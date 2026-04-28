import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { supabase, type RealtimeChannel } from '@/lib/supabaseClient';

export interface RoomMember {
  id: string;
  user_id: string;
  username: string;
}

interface SystemMessage {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system' | 'buzz';
  created_at: string;
}

interface UseRoomPresenceParams {
  roomId: string | undefined;
  userId: string;
  username: string;
  // Latest-messages source. Used to dedupe system-message announcements
  // across quick reconnects/refreshes.
  messagesRef: React.MutableRefObject<SystemMessage[]>;
}

interface UseRoomPresenceResult {
  members: RoomMember[];
}

/**
 * Live presence + join/leave system messages for a room.
 *
 * - Channel name `room-presence:${roomId}` is STABLE so React StrictMode
 *   double-mount doesn't create two parallel channels.
 * - Tab close is signalled via a `pagehide`-driven broadcast so the server's
 *   socket-idle timeout (which can run minutes) doesn't delay the leave UX.
 * - `useEffectEvent` keeps the effect from re-subscribing when the consumer's
 *   username changes — the latest username is read inside the callback.
 */
export function useRoomPresence({
  roomId,
  userId,
  username,
  messagesRef,
}: UseRoomPresenceParams): UseRoomPresenceResult {
  const [members, setMembers] = useState<RoomMember[]>([]);

  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceReadyRef = useRef(false);
  // Gate: ensures the "you joined the room" system message fires at
  // most once per channel lifetime, even when rename re-tracks presence
  // and triggers another self-join event. Reset inside the presence
  // effect on (re-)subscribe so switching rooms re-arms the announcement.
  const hasAnnouncedSelfJoinRef = useRef(false);

  // Stable readers for state that the effect must observe lazily.
  // `useEffectEvent` is React 19.2+; verified via package.json.
  const readUsername = useEffectEvent(() => username);
  const readRecentlyAnnounced = useEffectEvent(
    (uid: string, keyword: string, windowMs: number) => {
      const cutoff = Date.now() - windowMs;
      for (const m of messagesRef.current) {
        if (m.message_type !== 'system') continue;
        if (m.user_id !== uid) continue;
        if (!m.message.includes(keyword)) continue;
        if (new Date(m.created_at).getTime() >= cutoff) return true;
      }
      return false;
    },
  );

  // Presence: source of truth for the live roster AND join/leave system
  // messages.
  useEffect(() => {
    if (!roomId) return;

    let initialSyncDone = false;
    hasAnnouncedSelfJoinRef.current = false;
    const pendingLeaveTimers = new Map<string, number>();

    const channel = supabase.channel(`room-presence:${roomId}`, {
      config: { presence: { key: userId } },
    });

    type PresenceEntry = { user_id: string; username: string; online_at: string };

    const readRoster = (): PresenceEntry[] => {
      const state = channel.presenceState<PresenceEntry>();
      const entries: PresenceEntry[] = [];
      for (const key of Object.keys(state)) {
        const e = state[key]?.[0];
        if (e) entries.push(e as PresenceEntry);
      }
      return entries;
    };

    const syncMembers = () => {
      const entries = readRoster();
      setMembers(entries.map((e) => ({
        id: `presence-${e.user_id}`,
        user_id: e.user_id,
        username: e.username,
      })));
    };

    // Designated-inserter rule: the remaining user with the smallest
    // user_id inserts the system message. Deterministic across clients,
    // so only one writes the row.
    const amDesignatedInserter = (exclude?: string) => {
      const ids = readRoster()
        .map((e) => e.user_id)
        .filter((id) => id !== exclude)
        .sort();
      return ids.length > 0 && ids[0] === userId;
    };

    const insertSystemMessage = (uid: string, name: string, message: string) => {
      supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: uid,
          username: name,
          message,
          message_type: 'system',
        })
        .then(({ error }) => {
          if (error) console.error('Presence system-message insert failed:', error);
        });
    };

    const handleJoin = (newPresences: PresenceEntry[]) => {
      for (const p of newPresences) {
        if (!p?.user_id || !p?.username) continue;

        const pending = pendingLeaveTimers.get(p.user_id);
        if (pending !== undefined) {
          clearTimeout(pending);
          pendingLeaveTimers.delete(p.user_id);
        }

        if (p.user_id !== userId) continue;
        if (hasAnnouncedSelfJoinRef.current) continue;
        hasAnnouncedSelfJoinRef.current = true;
        if (!initialSyncDone) continue;
        if (readRecentlyAnnounced(p.user_id, 'joined', 30_000)) continue;

        insertSystemMessage(p.user_id, p.username, `${p.username} joined the room`);
      }
    };

    const scheduleLeaveAnnouncement = (
      uid: string,
      name: string,
      source: 'presence' | 'broadcast',
    ) => {
      const existing = pendingLeaveTimers.get(uid);
      if (existing !== undefined) clearTimeout(existing);

      const timerId = window.setTimeout(() => {
        pendingLeaveTimers.delete(uid);
        const stillPresent = readRoster().some((e) => e.user_id === uid);
        if (source === 'presence' && stillPresent) return;
        if (!amDesignatedInserter(uid)) return;
        if (readRecentlyAnnounced(uid, 'left', 15_000)) return;

        insertSystemMessage(uid, name, `${name} left the room`);
      }, 2_000);

      pendingLeaveTimers.set(uid, timerId);
    };

    const handleLeave = (leftPresences: PresenceEntry[]) => {
      if (!initialSyncDone) return;
      for (const p of leftPresences) {
        if (!p?.user_id || !p?.username) continue;
        scheduleLeaveAnnouncement(p.user_id, p.username, 'presence');
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        syncMembers();
        initialSyncDone = true;
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        syncMembers();
        handleJoin(newPresences as unknown as PresenceEntry[]);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        syncMembers();
        handleLeave(leftPresences as unknown as PresenceEntry[]);
      })
      .on('broadcast', { event: 'user-leaving' }, ({ payload }) => {
        if (!initialSyncDone) return;
        const uid = payload?.user_id;
        const name = payload?.username;
        if (typeof uid !== 'string' || typeof name !== 'string') return;
        if (uid === userId) return;
        setMembers((prev) => prev.filter((m) => m.user_id !== uid));
        scheduleLeaveAnnouncement(uid, name, 'broadcast');
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        presenceReadyRef.current = true;
        channel.track({
          user_id: userId,
          username: readUsername(),
          online_at: new Date().toISOString(),
        });
      });

    presenceChannelRef.current = channel;

    // Announce our own departure just before the tab dies. This is the
    // ONLY reliable leave signal under tab close.
    const announceLeaving = () => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'user-leaving',
          payload: {
            user_id: userId,
            username: readUsername(),
          },
        });
        channel.untrack();
      } catch {
        /* tab is dying — best effort */
      }
    };

    window.addEventListener('pagehide', announceLeaving);
    window.addEventListener('beforeunload', announceLeaving);

    return () => {
      window.removeEventListener('pagehide', announceLeaving);
      window.removeEventListener('beforeunload', announceLeaving);
      presenceReadyRef.current = false;
      presenceChannelRef.current = null;
      for (const t of pendingLeaveTimers.values()) clearTimeout(t);
      pendingLeaveTimers.clear();
      channel.untrack();
      supabase.removeChannel(channel);
    };
    // readUsername / readRecentlyAnnounced are stable per useEffectEvent
    // contract — intentionally NOT included in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  // Re-announce presence when the user renames — instant propagation to
  // every other client's roster.
  useEffect(() => {
    if (!presenceReadyRef.current) return;
    const channel = presenceChannelRef.current;
    if (!channel) return;
    hasAnnouncedSelfJoinRef.current = true;
    channel.track({
      user_id: userId,
      username,
      online_at: new Date().toISOString(),
    });
  }, [username, userId]);

  return { members };
}
