import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, type RealtimeChannel } from '@/lib/supabaseClient';
import { RoomScene } from '@/components/RoomScene';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatToggleButton } from '@/components/ChatToggleButton';
import { getUserId, getUsername, saveUsername, generateRoomId } from '@/lib/roomUtils';

interface Room {
  id: string;
  weather: 'sun' | 'rain' | 'night';
  scene_preset: string;
  current_song_url: string | null;
  current_song_title: string | null;
  current_song_started_at: string | null;
  is_paused: boolean;
  paused_at: string | null;
}

interface Song {
  id: string;
  url: string;
  title: string;
  added_by: string;
  position: number;
}

interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system' | 'buzz';
  created_at: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_message?: string | null;
}

interface RoomMember {
  id: string;
  user_id: string;
  username: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string;
  emoji: string;
  created_at: string;
}

export type ReactionsByMessage = Record<string, Reaction[]>;

export default function Room() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const [userId] = useState(getUserId());
  const [username, setUsername] = useState(getUsername());
  const [room, setRoom] = useState<Room | null>(null);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<ReactionsByMessage>({});
  const [loading, setLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem('chill-room-chat-open');
    return saved !== null ? saved === 'true' : true;
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const isChatOpenRef = useRef(isChatOpen);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const subscriptionActiveRef = useRef<boolean>(false);
  const messageInsertQueueRef = useRef<Set<string>>(new Set());
  const sendingRef = useRef<boolean>(false); // Prevent rapid double-sends
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceReadyRef = useRef(false);
  // Gate: ensures the "you joined the room" system message fires at
  // most once per channel lifetime, even when rename re-tracks presence
  // and triggers another self-join event. Reset inside the presence
  // effect on (re-)subscribe so switching rooms re-arms the announcement.
  const hasAnnouncedSelfJoinRef = useRef(false);
  // Latest-value refs so the presence effect (keyed on roomId+userId only)
  // can read current username + messages without re-subscribing.
  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  // Latest-value ref so handleReact can read the user's current reaction
  // on a message without closing over stale state.
  const reactionsRef = useRef<ReactionsByMessage>(reactionsByMessage);
  useEffect(() => {
    reactionsRef.current = reactionsByMessage;
  }, [reactionsByMessage]);

  // Initialize or join room
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const initRoom = async () => {
      try {
        let currentRoomId = roomId;

        // If no roomId in URL, create a new room
        if (!currentRoomId) {
          currentRoomId = generateRoomId();
          navigate(`/room/${currentRoomId}`, { replace: true });
          return; // Let the navigation trigger a re-render
        }

        // Check if room exists
        const { data: existingRoom, error: fetchError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', currentRoomId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }

        // Create room if it doesn't exist
        if (!existingRoom) {
          const { data: newRoom, error: createError } = await supabase
            .from('rooms')
            .insert({
              id: currentRoomId,
              weather: 'sun',
              scene_preset: 'scene-1',
            })
            .select()
            .single();

          if (createError) throw createError;
          if (isMounted) setRoom(newRoom);
        } else {
          if (isMounted) setRoom(existingRoom);
        }

        // Join/leave system messages are written from presence events —
        // see the presence effect below. Lifecycle-driven writes created
        // duplicates on refresh and silently dropped on tab close.

        // Load initial data (members come from presence — no DB fetch needed).
        await Promise.all([
          loadPlaylist(currentRoomId),
          loadMessages(currentRoomId),
          loadReactions(currentRoomId),
        ]);


        // Only subscribe if component is still mounted
        if (isMounted) {
          // Subscribe to realtime updates
          unsubscribe = subscribeToRoom(currentRoomId);
          if (isMounted) setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing room:', error);
        if (isMounted) setLoading(false);
      }
    };

    initRoom();

    // Cleanup on unmount or roomId change
    return () => {
      isMounted = false;

      // Properly cleanup realtime subscription
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }

      // Additional safety: manually cleanup subscription ref
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [roomId, navigate]);

  // Presence: source of truth for the live roster AND join/leave
  // system messages. Tracks the WebSocket so a tab close is detected
  // server-side (no missed "left" notifications). Keyed by userId so
  // multi-tab sessions collapse into one roster entry.
  useEffect(() => {
    if (!roomId) return;

    // Captured per-channel-instance state — reset on each (re-)subscribe.
    let initialSyncDone = false;
    hasAnnouncedSelfJoinRef.current = false;
    const pendingLeaveTimers = new Map<string, number>();

    const channel = supabase.channel(`room-presence:${roomId}`, {
      config: { presence: { key: userId } },
    });

    type PresenceEntry = { user_id: string; username: string; online_at: string };

    const readRoster = () => {
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
    // so only one writes the row. `exclude` removes a user from the
    // candidate pool — needed for broadcast-triggered leaves where the
    // leaver may still be in the server-side presence state.
    const amDesignatedInserter = (exclude?: string) => {
      const ids = readRoster()
        .map((e) => e.user_id)
        .filter((id) => id !== exclude)
        .sort();
      return ids.length > 0 && ids[0] === userId;
    };

    // Has a system message for this user + keyword been inserted in the
    // last `windowMs`? Used to dedupe across quick reconnects.
    const recentlyAnnounced = (uid: string, keyword: string, windowMs = 30_000) => {
      const cutoff = Date.now() - windowMs;
      for (const m of messagesRef.current) {
        if (m.message_type !== 'system') continue;
        if (m.user_id !== uid) continue;
        if (!m.message.includes(keyword)) continue;
        if (new Date(m.created_at).getTime() >= cutoff) return true;
      }
      return false;
    };

    const insertSystemMessage = (uid: string, name: string, message: string) => {
      supabase.from('messages').insert({
        room_id: roomId,
        user_id: uid,
        username: name,
        message,
        message_type: 'system',
      }).then(({ error }) => {
        if (error) console.error('Presence system-message insert failed:', error);
      });
    };

    const handleJoin = (newPresences: PresenceEntry[]) => {
      for (const p of newPresences) {
        if (!p?.user_id || !p?.username) continue;

        // If this user had a pending "left" scheduled, they bounced back
        // before the grace window — cancel the leave announcement.
        const pending = pendingLeaveTimers.get(p.user_id);
        if (pending !== undefined) {
          clearTimeout(pending);
          pendingLeaveTimers.delete(p.user_id);
        }

        // Self-announce: only the joiner writes their own "joined"
        // message. Every other presence event is ignored for joins —
        // simpler than designated-inserter, and always reliable.
        if (p.user_id !== userId) continue;
        // Rename re-tracks presence, which fires another self-join
        // event. Mark the flag on the FIRST self-join we ever see on
        // this channel (even if it arrives pre-sync and we skip the
        // announcement) so a later rename-driven re-track can't be
        // mistaken for the "first" self-join. The rename effect also
        // pre-sets this ref before calling track(), closing any race
        // in which Supabase emits the join event asynchronously.
        if (hasAnnouncedSelfJoinRef.current) continue;
        hasAnnouncedSelfJoinRef.current = true;
        // Post-initial-sync only. The initial sync fires a join event
        // for every existing member — we don't want to announce them.
        if (!initialSyncDone) continue;
        if (recentlyAnnounced(p.user_id, 'joined')) continue;

        insertSystemMessage(p.user_id, p.username, `${p.username} joined the room`);
      }
    };

    // Schedule the "X left the room" write with a 2s grace period.
    // `source` drives an important nuance:
    //   - 'presence': fired by presence.leave — the leaver is already
    //     removed from presenceState server-side, so the designated-
    //     inserter check is straightforward.
    //   - 'broadcast': fired when the leaver's pagehide handler beat
    //     the server's connection-idle timeout. They may still appear
    //     in presenceState; we exclude them from designated-inserter
    //     so the remaining clients can still elect a writer.
    const scheduleLeaveAnnouncement = (
      uid: string,
      name: string,
      source: 'presence' | 'broadcast',
    ) => {
      const existing = pendingLeaveTimers.get(uid);
      if (existing !== undefined) clearTimeout(existing);

      const timerId = window.setTimeout(() => {
        pendingLeaveTimers.delete(uid);
        // Re-verify: user must still be absent from the roster.
        const stillPresent = readRoster().some((e) => e.user_id === uid);
        if (source === 'presence' && stillPresent) return;
        if (!amDesignatedInserter(uid)) return;
        if (recentlyAnnounced(uid, 'left', 15_000)) return;

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
      // Fast-path: the leaver's pagehide handler fires this broadcast
      // just before the tab dies. We don't wait for the server's
      // connection-idle timeout (which can be minutes on some network
      // paths) — we schedule the 2s grace immediately.
      .on('broadcast', { event: 'user-leaving' }, ({ payload }) => {
        if (!initialSyncDone) return;
        const uid = payload?.user_id;
        const name = payload?.username;
        if (typeof uid !== 'string' || typeof name !== 'string') return;
        if (uid === userId) return; // ignore our own (shouldn't receive it, but be safe)
        // Optimistically drop the leaver from the local roster so the
        // UI updates immediately, even though server presence may lag.
        setMembers((prev) => prev.filter((m) => m.user_id !== uid));
        scheduleLeaveAnnouncement(uid, name, 'broadcast');
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        presenceReadyRef.current = true;
        // Track self. Username read via latest-ref so rename doesn't
        // force a re-subscribe.
        channel.track({
          user_id: userId,
          username: usernameRef.current,
          online_at: new Date().toISOString(),
        });
      });

    presenceChannelRef.current = channel;

    // Announce our own departure just before the tab dies. This is the
    // ONLY reliable leave signal under tab close — React effect cleanup
    // is not guaranteed to run, and the server's socket-idle detection
    // can take minutes. `pagehide` is the modern unload event that fires
    // reliably across browsers; `beforeunload` is kept as a belt-and-
    // suspenders fallback for older/niche paths. Handler is idempotent.
    const announceLeaving = () => {
      try {
        // Fire-and-forget broadcast over the open WebSocket. Browsers
        // flush pending WebSocket sends during pagehide well enough that
        // this reaches the server in the vast majority of cases.
        channel.send({
          type: 'broadcast',
          event: 'user-leaving',
          payload: {
            user_id: userId,
            username: usernameRef.current,
          },
        });
        channel.untrack();
      } catch {
        // best-effort; the tab is dying anyway
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
  }, [roomId, userId]);

  // Re-announce presence when the user renames — instant propagation to
  // every other client's roster without any DB round-trip. Guarded on
  // presenceReadyRef so we never call track() before SUBSCRIBED status.
  useEffect(() => {
    if (!presenceReadyRef.current) return;
    const channel = presenceChannelRef.current;
    if (!channel) return;
    // Suppress the fake self-join notification that a rename re-track
    // would otherwise produce. By the time we reach this effect on a
    // username change, the initial join (if any) has already fired —
    // forcing the flag true here is safe and race-proof.
    hasAnnouncedSelfJoinRef.current = true;
    channel.track({
      user_id: userId,
      username,
      online_at: new Date().toISOString(),
    });
  }, [username, userId]);

  // Keep chat open ref in sync for subscription callbacks
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    localStorage.setItem('chill-room-chat-open', String(isChatOpen));
  }, [isChatOpen]);

  const handleToggleChat = useCallback(() => {
    setIsChatOpen(prev => {
      if (!prev) setUnreadCount(0);
      return !prev;
    });
  }, []);

  const loadPlaylist = async (roomIdParam: string) => {
    const { data, error } = await supabase
      .from('playlist')
      .select('*')
      .eq('room_id', roomIdParam)
      .order('position');

    if (error) {
      console.error('Error loading playlist:', error);
      return;
    }

    setPlaylist(data || []);
  };

  const loadMessages = async (roomIdParam: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomIdParam)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    const loadedMessages = data || [];

    // Populate the message IDs set with initial messages
    messageIdsRef.current.clear();
    loadedMessages.forEach(msg => messageIdsRef.current.add(msg.id));

    setMessages(loadedMessages);
  };

  const loadReactions = async (roomIdParam: string) => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('room_id', roomIdParam)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading reactions:', error);
      return;
    }

    const grouped: ReactionsByMessage = {};
    for (const r of (data || []) as Reaction[]) {
      (grouped[r.message_id] ||= []).push(r);
    }
    setReactionsByMessage(grouped);
  };

  // Normalize playlist positions to be sequential (0, 1, 2, ...)
  const normalizePlaylistPositions = async (roomIdParam: string) => {
    const { data: songs, error: fetchError } = await supabase
      .from('playlist')
      .select('*')
      .eq('room_id', roomIdParam)
      .order('position');

    if (fetchError || !songs || songs.length === 0) {
      return;
    }

    // Check if positions are already normalized
    const needsNormalization = songs.some((song, index) => song.position !== index);

    if (!needsNormalization) {
      return;
    }


    // Update each song with new sequential position
    for (let i = 0; i < songs.length; i++) {
      await supabase
        .from('playlist')
        .update({ position: i })
        .eq('id', songs[i].id);
    }

  };

  const subscribeToRoom = (roomIdParam: string) => {
    // MUTEX: Prevent concurrent subscriptions (fixes duplicate messages)
    if (subscriptionActiveRef.current) {
      console.warn('Subscription already active, skipping duplicate subscription attempt');
      return () => {}; // Return empty cleanup function
    }

    // Mark subscription as active
    subscriptionActiveRef.current = true;

    // Cleanup existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    // Use unique channel name with timestamp to prevent conflicts in Strict Mode
    const channelName = `room:${roomIdParam}:${Date.now()}:${Math.random()}`;

    // Subscribe to room changes
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomIdParam}` },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playlist', filter: `room_id=eq.${roomIdParam}` },
        () => {
          loadPlaylist(roomIdParam);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomIdParam}` },
        (payload) => {
          const newMessage = payload.new as Message;

          // Layer 1: In-flight queue check
          if (messageInsertQueueRef.current.has(newMessage.id)) return;

          // Layer 2: Historical ID check (includes optimistic sends)
          if (messageIdsRef.current.has(newMessage.id)) return;

          // Mark as processing
          messageInsertQueueRef.current.add(newMessage.id);
          messageIdsRef.current.add(newMessage.id);

          // Track unread when chat is closed
          if (!isChatOpenRef.current && newMessage.user_id !== userId && newMessage.message_type === 'chat') {
            setUnreadCount(prev => prev + 1);
          }

          setMessages((prev) => {
            // Layer 3: State-level check
            if (prev.some(msg => msg.id === newMessage.id)) {
              messageInsertQueueRef.current.delete(newMessage.id);
              return prev;
            }

            const updated = [...prev, newMessage].slice(-50);
            messageInsertQueueRef.current.delete(newMessage.id);

            // Prevent memory leak in ID tracking
            if (messageIdsRef.current.size > 200) {
              messageIdsRef.current = new Set(updated.map(m => m.id));
            }

            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomIdParam}` },
        (payload) => {
          const r = payload.new as Reaction;
          setReactionsByMessage((prev) => {
            const existing = prev[r.message_id] || [];
            // Dedupe: same id (realtime echo of our own insert), or same
            // (user_id, emoji) tuple (realtime arriving after optimistic add).
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
        { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomIdParam}` },
        (payload) => {
          const r = payload.new as Reaction;
          setReactionsByMessage((prev) => {
            const list = prev[r.message_id] || [];
            const idx = list.findIndex((x) => x.id === r.id);
            if (idx === -1) {
              // Row not yet in local state (e.g. arrived before initial
              // fetch completed, or a temp-id placeholder for the same
              // user hasn't been swapped yet). Drop any temp entry from
              // this user and append the real one.
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
          // DELETE events from Postgres do not include the full row by default —
          // only the primary key. Strip by id across the whole map.
          const oldId = (payload.old as { id?: string } | null)?.id;
          if (!oldId) return;
          setReactionsByMessage((prev) => {
            let changed = false;
            const next: ReactionsByMessage = {};
            for (const [mid, list] of Object.entries(prev)) {
              const filtered = list.filter((r) => r.id !== oldId);
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

    // Store subscription reference
    subscriptionRef.current = channel;

    // Return cleanup function
    return () => {
      supabase.removeChannel(channel);
      subscriptionRef.current = null;
      subscriptionActiveRef.current = false; // Release mutex
      messageInsertQueueRef.current.clear(); // Clear in-flight queue
    };
  };

  const handleSceneChange = useCallback(async (scenePreset: string) => {
    if (!roomId || !room) return;


    // Optimistic update - update local state immediately
    setRoom({ ...room, scene_preset: scenePreset });

    const { error } = await supabase
      .from('rooms')
      .update({ scene_preset: scenePreset, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (error) {
      console.error('Error changing scene:', error);
      // Revert on error
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
      if (data) setRoom(data);
    }
  }, [roomId, room]);

  // Auto-rotate scene every 30 minutes
  const sceneRotateRef = useRef<NodeJS.Timeout | null>(null);
  const SCENE_IDS = ['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5', 'scene-6', 'scene-7', 'scene-8', 'scene-9'];
  const ROTATE_INTERVAL = 30 * 60 * 1000; // 30 minutes

  const rotateScene = useCallback(() => {
    if (!roomId || !room) return;
    const currentId = room.scene_preset || 'scene-1';
    const others = SCENE_IDS.filter(id => id !== currentId);
    const nextId = others[Math.floor(Math.random() * others.length)];
    handleSceneChange(nextId);
  }, [roomId, room, handleSceneChange]);

  useEffect(() => {
    if (!roomId || !room) return;

    if (sceneRotateRef.current) clearInterval(sceneRotateRef.current);
    sceneRotateRef.current = setInterval(rotateScene, ROTATE_INTERVAL);

    return () => {
      if (sceneRotateRef.current) clearInterval(sceneRotateRef.current);
    };
  }, [roomId, room?.scene_preset, rotateScene]);

  const handleAddSong = useCallback(async (url: string, title: string) => {
    if (!roomId) return;

    // Check if there's a current song playing
    if (!room?.current_song_url) {
      // NO SONG PLAYING - Start immediately (don't add to queue)
      const nowIso = new Date().toISOString();

      // OPTIMISTIC: Update local state (also clear any stale pause state)
      setRoom((prev) => prev ? {
        ...prev,
        current_song_url: url,
        current_song_title: title,
        current_song_started_at: nowIso,
        is_paused: false,
        paused_at: null,
      } : prev);

      // Update database — clear pause state so stale paused_at doesn't break
      // the resume calculation later (which would shift started_at into the future)
      const { error } = await supabase
        .from('rooms')
        .update({
          current_song_url: url,
          current_song_title: title,
          current_song_started_at: nowIso,
          is_paused: false,
          paused_at: null,
          updated_at: nowIso,
        })
        .eq('id', roomId);

      if (error) {
        console.error('Error starting song:', error);
      }
    } else {
      // SONG PLAYING - Add to queue

      // Calculate next position safely - use playlist length as next position
      const nextPosition = playlist.length;

      // OPTIMISTIC: Add to local playlist immediately
      const tempSong = {
        id: `temp-${Date.now()}`,
        url,
        title,
        added_by: username,
        position: nextPosition,
        room_id: roomId,
      };
      setPlaylist((prev) => [...prev, tempSong]);

      try {
        // Insert to database
        const { data, error } = await supabase
          .from('playlist')
          .insert({
            room_id: roomId,
            url,
            title,
            added_by: username,
            position: nextPosition,
          })
          .select()
          .single();

        if (error) {
          console.error('Error adding song to queue:', error);
          // Remove temp song on error
          setPlaylist((prev) => prev.filter((s) => s.id !== tempSong.id));
          return;
        }

        // Replace temp with real data
        setPlaylist((prev) => prev.map((s) => (s.id === tempSong.id ? data : s)));

      } catch (error) {
        console.error('Error in add song operation:', error);
        // Remove temp song on error
        setPlaylist((prev) => prev.filter((s) => s.id !== tempSong.id));
      }
    }
  }, [roomId, playlist, username, room?.current_song_url]);

  const handleSkip = useCallback(async () => {
    if (!roomId) return;


    // Get next song in queue BEFORE any operations
    const nextSong = playlist[0];

    if (nextSong) {

      try {
        // OPTIMISTIC: Update local state immediately for better UX
        const newStartTime = new Date().toISOString();
        setPlaylist((prev) => prev.slice(1)); // Remove first song
        setRoom((prev) => prev ? {
          ...prev,
          current_song_url: nextSong.url,
          current_song_title: nextSong.title,
          current_song_started_at: newStartTime,
          is_paused: false,
          paused_at: null,
        } : prev);

        // ATOMIC OPERATIONS: Do both database operations
        // 1. Update room with next song (also clear pause state)
        const { error: roomError } = await supabase
          .from('rooms')
          .update({
            current_song_url: nextSong.url,
            current_song_title: nextSong.title,
            current_song_started_at: newStartTime,
            is_paused: false,
            paused_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', roomId);

        if (roomError) {
          console.error('Error updating room:', roomError);
          // Revert optimistic update
          await loadPlaylist(roomId);
          const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
          if (roomData) setRoom(roomData);
          return;
        }

        // 2. Remove from playlist in database
        const { error: deleteError } = await supabase
          .from('playlist')
          .delete()
          .eq('id', nextSong.id)
          .eq('room_id', roomId); // Safety check

        if (deleteError) {
          console.error('Error deleting song from playlist:', deleteError);
          // Reload playlist to sync state
          await loadPlaylist(roomId);
          return;
        }

        // 3. Normalize positions after successful skip
        await normalizePlaylistPositions(roomId);

      } catch (error) {
        console.error('Error during skip operation:', error);
        // Reload everything to ensure consistency
        await loadPlaylist(roomId);
        const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
        if (roomData) setRoom(roomData);
      }
    } else {

      try {
        // OPTIMISTIC: Clear current song locally
        setRoom((prev) => prev ? {
          ...prev,
          current_song_url: null,
          current_song_title: null,
          current_song_started_at: null,
        } : prev);

        // Clear in database
        const { error } = await supabase
          .from('rooms')
          .update({
            current_song_url: null,
            current_song_title: null,
            current_song_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', roomId);

        if (error) {
          console.error('Error clearing current song:', error);
          // Reload room state
          const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
          if (roomData) setRoom(roomData);
        }
      } catch (error) {
        console.error('Error clearing song:', error);
      }
    }
  }, [roomId, playlist]);

  const handleTogglePause = useCallback(async () => {
    if (!roomId || !room) return;

    const nowPaused = !room.is_paused;

    // OPTIMISTIC: Update local state immediately
    setRoom((prev) => prev ? { ...prev, is_paused: nowPaused, paused_at: nowPaused ? new Date().toISOString() : null } : prev);

    if (nowPaused) {
      // Pausing: store when we paused
      await supabase
        .from('rooms')
        .update({ is_paused: true, paused_at: new Date().toISOString() })
        .eq('id', roomId);
    } else {
      // Unpausing: shift current_song_started_at forward by the paused duration
      // so playback resumes from where it was paused.
      // Guard against stale paused_at (older than current_song_started_at, which
      // can happen if the song was replaced while paused) — in that case we
      // only clear the pause state without shifting.
      const startedAtMs = room.current_song_started_at ? new Date(room.current_song_started_at).getTime() : 0;
      const pausedAtMs = room.paused_at ? new Date(room.paused_at).getTime() : 0;
      const canShift = room.current_song_started_at && room.paused_at && pausedAtMs >= startedAtMs;

      if (canShift) {
        const pausedDuration = Date.now() - pausedAtMs;
        const newStartedAt = new Date(startedAtMs + pausedDuration).toISOString();
        await supabase
          .from('rooms')
          .update({ is_paused: false, paused_at: null, current_song_started_at: newStartedAt })
          .eq('id', roomId);
      } else {
        await supabase
          .from('rooms')
          .update({ is_paused: false, paused_at: null })
          .eq('id', roomId);
      }
    }
  }, [roomId, room]);

  const handleRemoveSong = useCallback(async (songId: string) => {
    if (!roomId) return;


    try {
      // OPTIMISTIC: Remove from local state immediately
      setPlaylist((prev) => prev.filter((s) => s.id !== songId));

      // Delete from database
      const { error } = await supabase
        .from('playlist')
        .delete()
        .eq('id', songId)
        .eq('room_id', roomId); // Safety: only delete from this room

      if (error) {
        console.error('Error removing song:', error);
        // Reload playlist on error to sync state
        await loadPlaylist(roomId);
        return;
      }

      // Normalize positions after removal to avoid gaps
      await normalizePlaylistPositions(roomId);

    } catch (error) {
      console.error('Error in remove song operation:', error);
      await loadPlaylist(roomId);
    }
  }, [roomId]);

  const handleSendMessage = useCallback(async (message: string, replyTo: Message | null) => {
    if (!roomId) return;

    // Prevent rapid double-sends
    if (sendingRef.current) return;
    sendingRef.current = true;

    // Denormalized reply snapshot: the chip must render even if the
    // parent rolls off the 50-message window later.
    const replyFields = replyTo
      ? {
          reply_to_id: replyTo.id,
          reply_to_username: replyTo.username,
          reply_to_message: replyTo.message,
        }
      : {
          reply_to_id: null,
          reply_to_username: null,
          reply_to_message: null,
        };

    // Optimistic update: show message instantly with temp ID
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempId,
      user_id: userId,
      username,
      message,
      message_type: 'chat',
      created_at: new Date().toISOString(),
      ...replyFields,
    };

    setMessages(prev => [...prev, optimisticMessage].slice(-50));

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: userId,
          username,
          message,
          message_type: 'chat',
          ...replyFields,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Track the real ID so the subscription handler skips it
      if (data) {
        messageIdsRef.current.add(data.id);
        // Replace temp message with real ID
        setMessages(prev =>
          prev.map(msg => msg.id === tempId ? { ...msg, id: data.id } : msg)
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    } finally {
      sendingRef.current = false;
    }
  }, [roomId, userId, username]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!roomId) return;

    // Messenger rule: one reaction per (user, message). Picking a
    // different emoji switches the existing row via an upsert on
    // (message_id, user_id); clicking the same emoji is a no-op here
    // (the caller should route that to onUnreact instead).
    const existingList = reactionsRef.current[messageId] || [];
    const existingMine = existingList.find((r) => r.user_id === userId);
    if (existingMine?.emoji === emoji) return;

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic: Reaction = {
      id: tempId,
      message_id: messageId,
      user_id: userId,
      username,
      emoji,
      created_at: new Date().toISOString(),
    };

    // Optimistic switch: drop the user's previous reaction (if any) and
    // append the new optimistic one in one state write.
    setReactionsByMessage((prev) => {
      const list = prev[messageId] || [];
      const withoutMine = list.filter((r) => r.user_id !== userId);
      return { ...prev, [messageId]: [...withoutMine, optimistic] };
    });

    const { data, error } = await supabase
      .from('message_reactions')
      .upsert(
        {
          message_id: messageId,
          room_id: roomId,
          user_id: userId,
          username,
          emoji,
        },
        { onConflict: 'message_id,user_id' },
      )
      .select('*')
      .single();

    if (error) {
      console.error('Error switching reaction:', error);
      // Roll back: drop the optimistic row; restore the prior reaction
      // if there was one.
      setReactionsByMessage((prev) => {
        const list = prev[messageId] || [];
        const withoutMine = list.filter((r) => r.user_id !== userId);
        const restored = existingMine ? [...withoutMine, existingMine] : withoutMine;
        if (restored.length === 0) {
          const { [messageId]: _removed, ...rest } = prev;
          void _removed;
          return rest;
        }
        return { ...prev, [messageId]: restored };
      });
      return;
    }

    if (data) {
      const real = data as Reaction;
      setReactionsByMessage((prev) => {
        const list = prev[messageId] || [];
        // Replace whatever the user currently has (temp or stale) with
        // the server-authoritative row.
        const withoutMine = list.filter((r) => r.user_id !== userId);
        return { ...prev, [messageId]: [...withoutMine, real] };
      });
    }
  }, [roomId, userId, username]);

  const handleUnreact = useCallback(async (messageId: string, emoji: string) => {
    let removed: Reaction | undefined;
    setReactionsByMessage((prev) => {
      const existing = prev[messageId] || [];
      removed = existing.find((r) => r.user_id === userId && r.emoji === emoji);
      if (!removed) return prev;
      const filtered = existing.filter((r) => r !== removed);
      if (filtered.length === 0) {
        const { [messageId]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [messageId]: filtered };
    });

    if (!removed) return;

    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);

    if (error) {
      console.error('Error removing reaction:', error);
      // Restore on failure.
      const restore = removed;
      setReactionsByMessage((prev) => {
        const existing = prev[messageId] || [];
        if (existing.some((r) => r.id === restore.id)) return prev;
        return { ...prev, [messageId]: [...existing, restore] };
      });
    }
  }, [userId]);

  const handleBuzz = useCallback(async () => {
    if (!roomId) return;
    // Insert with no optimistic entry — the sender shouldn't shake
    // themselves, and the realtime echo will populate the log quickly.
    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      user_id: userId,
      username,
      message: `${username} buzzed the room`,
      message_type: 'buzz',
    });
    if (error) console.error('Error sending buzz:', error);
  }, [roomId, userId, username]);

  const handleRename = useCallback(async (newName: string) => {
    if (!roomId) return;

    const oldName = username;
    setUsername(newName);
    saveUsername(newName);

    // Update member record
    await supabase
      .from('room_members')
      .update({ username: newName })
      .eq('user_id', userId);

    // Add system message
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: userId,
      username: newName,
      message: `${oldName} is now ${newName}`,
      message_type: 'system',
    });
  }, [roomId, userId, username]);

  // Memoize currentSong to prevent unnecessary re-renders in YouTubePlayer
  const currentSongMemo = useMemo(() => {
    if (!room?.current_song_url) return null;
    return {
      url: room.current_song_url,
      title: room.current_song_title || 'Untitled',
      startedAt: room.current_song_started_at || new Date().toISOString(),
    };
  }, [room?.current_song_url, room?.current_song_title, room?.current_song_started_at]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--pixel-bg-deep)' }}>
        <p className="font-pixel text-sm" style={{ color: 'var(--pixel-accent-cyan)' }}>Loading room...</p>
      </div>
    );
  }

  return (
    <div className="room-page">
      <div className="room-main">
        <RoomScene
          scenePreset={room?.scene_preset || 'scene-1'}
          onSceneChange={handleSceneChange}
        />
        <YouTubePlayer
          currentSong={currentSongMemo}
          playlist={playlist}
          onAddSong={handleAddSong}
          onSkip={handleSkip}
          onRemoveSong={handleRemoveSong}
          isPaused={room?.is_paused ?? false}
          onTogglePause={handleTogglePause}
          isChatOpen={isChatOpen}
        />
        <ChatToggleButton
          isOpen={isChatOpen}
          onToggle={handleToggleChat}
          unreadCount={unreadCount}
        />
      </div>
      <ChatSidebar
        messages={messages}
        members={members}
        currentUsername={username}
        reactionsByMessage={reactionsByMessage}
        onSendMessage={handleSendMessage}
        onRename={handleRename}
        onReact={handleReact}
        onUnreact={handleUnreact}
        onBuzz={handleBuzz}
        isOpen={isChatOpen}
      />
    </div>
  );
}
