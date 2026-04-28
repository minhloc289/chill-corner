-- Message retention: cap per-room history and prune system noise.
--
-- Why: the `messages` table grows unbounded. The UI only ever loads the
-- latest 50 per room (see useRoomRealtime.ts), so anything beyond a
-- modest buffer is dead storage.
--
-- Strategy:
--   1. Keep the latest N messages per room (default 500).
--   2. Delete system join/leave/buzz noise older than `system_max_age`
--      (default 7 days) on top of the cap — these compound fast.
--   3. Run nightly via pg_cron at 03:15 UTC (off-peak for most users).
--
-- Re-runnable: the migration is idempotent. Re-applying it replaces the
-- function and re-schedules the job under the same name.

-- pg_cron is preinstalled on Supabase but needs explicit CREATE.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Composite index speeds up the per-room ORDER BY created_at DESC
-- window scan inside the prune function. Cheap if it already exists.
CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON public.messages (room_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_room_messages(
  keep_per_room   int      DEFAULT 500,
  system_max_age  interval DEFAULT interval '7 days'
)
RETURNS TABLE(rooms_pruned int, total_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_deleted bigint := 0;
  v_rooms_pruned  int    := 0;
  v_deleted       bigint;
  v_distinct_rooms int;
BEGIN
  -- 1) Drop old system messages outright. Bounded by created_at index.
  WITH d AS (
    DELETE FROM public.messages
    WHERE message_type = 'system'
      AND created_at < (now() - system_max_age)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM d;
  v_total_deleted := v_total_deleted + v_deleted;

  -- 2) Per-room cap: keep the newest `keep_per_room` rows; delete the rest.
  WITH ranked AS (
    SELECT id, room_id,
           row_number() OVER (
             PARTITION BY room_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM public.messages
  ),
  d AS (
    DELETE FROM public.messages m
    USING ranked r
    WHERE m.id = r.id
      AND r.rn > keep_per_room
    RETURNING r.room_id
  )
  SELECT count(*), count(DISTINCT room_id) INTO v_deleted, v_distinct_rooms FROM d;
  v_total_deleted := v_total_deleted + v_deleted;
  v_rooms_pruned  := v_distinct_rooms;

  RETURN QUERY SELECT v_rooms_pruned, v_total_deleted;
END;
$$;

-- The function is for the cron job and DBA use only — no API exposure.
REVOKE ALL ON FUNCTION public.prune_room_messages(int, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_room_messages(int, interval) FROM anon, authenticated;

-- Replace any prior schedule under the same name, then (re)create.
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'prune-room-messages';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'prune-room-messages',
  '15 3 * * *',
  $cron$ SELECT public.prune_room_messages(500, interval '7 days'); $cron$
);
