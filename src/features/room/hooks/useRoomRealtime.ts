import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type RealtimeChannel } from '@/lib/supabaseClient';

// --- Local copies of the row shapes. Co-located with the hook so the
// page-level Room type can be derived from these later if desired. ---

export interface Room {
  id: string;
  weather: 'sun' | 'rain' | 'night';
  scene_preset: string;
  current_song_url: string | null;
  current_song_title: string | null;
  current_song_started_at: string | null;
  is_paused: boolean;
  paused_at: string | null;
}

export interface Song {
  id: string;
  url: string;
  title: string;
  added_by: string;
  position: number;
}

export interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system' | 'buzz';
  created_at: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_message?: string | null;
  image_url?: string | null;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string;
  emoji: string;
  created_at: string;
}

export type ReactionsByMessage = Record<string, Reaction[]>;

interface UseRoomRealtimeParams {
  roomId: string | undefined;
  userId: string;
  // Latest is-chat-open ref, used to decide whether to bump unread.
  isChatOpenRef: React.MutableRefObject<boolean>;
}

interface UseRoomRealtimeResult {
  room: Room | null;
  playlist: Song[];
  messages: Message[];
  reactionsByMessage: ReactionsByMessage;
  unreadCount: number;
  loading: boolean;
  resetUnreadCount: () => void;
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>;
  setPlaylist: React.Dispatch<React.SetStateAction<Song[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setReactionsByMessage: React.Dispatch<React.SetStateAction<ReactionsByMessage>>;
}

// Bounded LRU dedup for message ids. Replaces the old triple-defense
// (in-flight queue + historical id Set + state-level prev.some). A single
// Map preserves insertion order; we drop the oldest entries when over cap.
//
// DB-level dedup was deferred. The originally proposed Postgres index
// `WHERE created_at > now() - interval '...'` was invalid because `now()`
// is volatile (immutability is required for index predicates). The
// alternative — a `content_hash` column with a unique constraint — was
// rejected for false-positive risk (legitimate duplicate messages from
// the same user blocked by hash collision).
const MESSAGE_ID_LRU_CAP = 500;

function makeBoundedSet(cap: number) {
  const map = new Map<string, true>();
  return {
    has(id: string) {
      return map.has(id);
    },
    add(id: string) {
      if (map.has(id)) {
        // Re-insert to refresh recency.
        map.delete(id);
      }
      map.set(id, true);
      while (map.size > cap) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Realtime subscription for a single room. Owns:
 *   - initial load of room/playlist/messages/reactions
 *   - one stable channel `room:${roomId}` (no `Date.now()` suffix — that
 *     was the root cause of the duplicate-messages bug under StrictMode)
 *   - postgres_changes listeners for rooms / playlist / messages / reactions
 *   - bounded-LRU dedup for incoming messages
 *
 * Presence lives in `useRoomPresence` (separate channel).
 */
export function useRoomRealtime({
  roomId,
  userId,
  isChatOpenRef,
}: UseRoomRealtimeParams): UseRoomRealtimeResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<ReactionsByMessage>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // Bounded LRU of seen message ids (server- and optimistic-).
  const seenMessageIdsRef = useRef(makeBoundedSet(MESSAGE_ID_LRU_CAP));

  const resetUnreadCount = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    if (!roomId) return;
    let isMounted = true;

    const loadPlaylist = async (rid: string) => {
      const { data, error } = await supabase
        .from('playlist')
        .select('*')
        .eq('room_id', rid)
        .order('position');
      if (error) {
        console.error('Error loading playlist:', error);
        return;
      }
      if (isMounted) setPlaylist(data || []);
    };

    const loadMessages = async (rid: string) => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', rid)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) {
        console.error('Error loading messages:', error);
        return;
      }
      // Bail before mutating shared refs/state if the mount was cancelled.
      // Without this gate a stale init from a cancelled StrictMode mount
      // would clear the LRU after the live mount has already seeded it.
      if (!isMounted) return;
      const loaded = (data || []) as Message[];
      seenMessageIdsRef.current.clear();
      for (const msg of loaded) seenMessageIdsRef.current.add(msg.id);
      setMessages(loaded);
    };

    const loadReactions = async (rid: string) => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('room_id', rid)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error loading reactions:', error);
        return;
      }
      const grouped: ReactionsByMessage = {};
      for (const r of (data || []) as Reaction[]) {
        (grouped[r.message_id] ||= []).push(r);
      }
      if (isMounted) setReactionsByMessage(grouped);
    };

    const init = async () => {
      try {
        const { data: existingRoom, error: fetchError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }

        if (!existingRoom) {
          const { data: newRoom, error: createError } = await supabase
            .from('rooms')
            .insert({
              id: roomId,
              weather: 'sun',
              scene_preset: 'scene-1',
            })
            .select()
            .single();
          if (createError) throw createError;
          if (isMounted) setRoom(newRoom);
        } else if (isMounted) {
          setRoom(existingRoom);
        }

        await Promise.all([
          loadPlaylist(roomId),
          loadMessages(roomId),
          loadReactions(roomId),
        ]);

        if (!isMounted) return;

        // Tear down any prior channel from a StrictMode double-mount or
        // a previous roomId.
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        // Channel name must be:
        //   1. STABLE across mounts within one client (so StrictMode's
        //      double-mount doesn't create two competing channels — that
        //      was the duplicate-messages bug).
        //   2. UNIQUE per client. Sharing one channel topic across
        //      different clients (e.g. `room:${roomId}` only) caused
        //      postgres_changes events to stop fanning out reliably under
        //      this app's gateway transport — receivers would miss
        //      INSERT events from peers until a hard reload.
        // userId is per-browser-session (localStorage) so it satisfies
        // both: stable across re-mounts, distinct between clients.
        const channel = supabase
          .channel(`room:${roomId}:${userId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
            (payload) => {
              setRoom(payload.new as Room);
            },
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'playlist', filter: `room_id=eq.${roomId}` },
            () => {
              loadPlaylist(roomId);
            },
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
            (payload) => {
              const newMessage = payload.new as Message;

              // LRU fast-path: catches StrictMode double-fires and the
              // realtime echo of our own sends *when the sender remembered*
              // to seed the LRU via the temp→real swap path below.
              if (seenMessageIdsRef.current.has(newMessage.id)) return;
              seenMessageIdsRef.current.add(newMessage.id);

              // Defense-in-depth state-level dedup. The optimistic→real
              // swap on the sender's side updates the message's id in
              // state to the server-issued id; the realtime echo then
              // arrives with that same id. If the LRU was not seeded for
              // any reason (race, missed mark, etc.), this O(≤50) scan
              // guarantees we never render the same id twice. Gated on
              // `isNew` so the unread badge isn't bumped for a duplicate.
              let isNew = false;
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) return prev;
                isNew = true;
                return [...prev, newMessage].slice(-50);
              });

              if (
                isNew
                && !isChatOpenRef.current
                && newMessage.user_id !== userId
                && newMessage.message_type === 'chat'
              ) {
                setUnreadCount((prev) => prev + 1);
              }
            },
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` },
            (payload) => {
              const r = payload.new as Reaction;
              setReactionsByMessage((prev) => {
                const existing = prev[r.message_id] || [];
                if (existing.some((x) => x.id === r.id)) return prev;
                const withoutPending = existing.filter(
                  (x) => !(x.id.startsWith('temp-') && x.user_id === r.user_id && x.emoji === r.emoji),
                );
                return { ...prev, [r.message_id]: [...withoutPending, r] };
              });
            },
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` },
            (payload) => {
              const r = payload.new as Reaction;
              setReactionsByMessage((prev) => {
                const list = prev[r.message_id] || [];
                const idx = list.findIndex((x) => x.id === r.id);
                if (idx === -1) {
                  const withoutPending = list.filter(
                    (x) => !(x.id.startsWith('temp-') && x.user_id === r.user_id),
                  );
                  return { ...prev, [r.message_id]: [...withoutPending, r] };
                }
                const next = [...list];
                next[idx] = r;
                return { ...prev, [r.message_id]: next };
              });
            },
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'message_reactions' },
            (payload) => {
              const oldId = (payload.old as { id?: string } | null)?.id;
              if (!oldId) return;
              setReactionsByMessage((prev) => {
                let changed = false;
                const next: ReactionsByMessage = {};
                for (const [mid, list] of Object.entries(prev)) {
                  const filtered = list.filter((x) => x.id !== oldId);
                  if (filtered.length !== list.length) changed = true;
                  if (filtered.length) next[mid] = filtered;
                }
                return changed ? next : prev;
              });
            },
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              console.error('Failed to subscribe to room updates');
            }
          });

        channelRef.current = channel;
        if (isMounted) setLoading(false);
      } catch (error) {
        console.error('Error initializing room:', error);
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // isChatOpenRef is a ref — its identity is stable; no need to include.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  return {
    room,
    playlist,
    messages,
    reactionsByMessage,
    unreadCount,
    loading,
    resetUnreadCount,
    setRoom,
    setPlaylist,
    setMessages,
    setReactionsByMessage,
  };
}
