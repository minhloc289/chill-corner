-- Chat images: add image_url to messages + create public Storage bucket.
--
-- Schema additions:
--   - messages.image_url (nullable text) — public URL of an attached image
--     for messages with message_type='chat'. Plain-text messages leave it NULL.
--   - 'chat-images' bucket: public-read, 5 MB limit, image/* MIME allowlist.
--
-- The app has no auth (user_id is a localStorage UUID), so storage policies
-- mirror the messages table: anon can read & insert. Path convention is
-- {room_id}/{uuid}.{ext} so a future cleanup job can scope by room.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,
  5 * 1024 * 1024,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies. Drop-and-recreate so re-runs are idempotent.
DROP POLICY IF EXISTS "chat_images_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_images_anon_insert"   ON storage.objects;
DROP POLICY IF EXISTS "chat_images_anon_delete"   ON storage.objects;

CREATE POLICY "chat_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

CREATE POLICY "chat_images_anon_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-images');

-- DELETE so clients can roll back a stale upload before insert.
CREATE POLICY "chat_images_anon_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-images');
