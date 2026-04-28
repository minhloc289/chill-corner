import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { RoomScene } from '@/components/RoomScene';
import { WeatherOverlay } from '@/components/WeatherOverlay';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatToggleButton } from '@/components/ChatToggleButton';
import { getUserId, getUsername, saveUsername, generateRoomId } from '@/lib/roomUtils';
import { uploadChatImage, ChatImageError } from '@/lib/imageUpload';
import { toast } from 'sonner';
import {
  useRoomRealtime,
  type Message,
  type Reaction,
  type ReactionsByMessage,
  type Room as RoomRow,
  type Song,
} from '@/features/room/hooks/useRoomRealtime';
import { useRoomPresence } from '@/features/room/hooks/useRoomPresence';
import { ChatProvider, type ChatState, type ChatDispatch } from '@/features/room/ChatProvider';

export type { ReactionsByMessage };

export default function Room() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const [userId] = useState(getUserId());
  const [username, setUsername] = useState(getUsername());

  // If no roomId in URL, create a new room and redirect.
  useEffect(() => {
    if (!roomId) {
      navigate(`/room/${generateRoomId()}`, { replace: true });
    }
  }, [roomId, navigate]);

  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem('chill-room-chat-open');
    return saved !== null ? saved === 'true' : true;
  });
  const isChatOpenRef = useRef(isChatOpen);
  const sendingRef = useRef<boolean>(false); // Prevent rapid double-sends

  // --- Realtime hook (room/playlist/messages/reactions) ---
  const {
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
  } = useRoomRealtime({ roomId, userId, isChatOpenRef });

  // Latest-room ref so handlers can read freshest values without
  // closing over the rendered `room` object.
  const roomLatestRef = useRef<RoomRow | null>(room);
  useEffect(() => {
    roomLatestRef.current = room;
  }, [room]);

  // Latest-messages ref needed by useRoomPresence for system-message dedup.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Latest reactions ref so handleReact can read the user's current
  // reaction on a message without closing over stale state.
  const reactionsRef = useRef<ReactionsByMessage>(reactionsByMessage);
  useEffect(() => {
    reactionsRef.current = reactionsByMessage;
  }, [reactionsByMessage]);

  // --- Presence hook (separate channel) ---
  const { members } = useRoomPresence({ roomId, userId, username, messagesRef });

  // Keep chat-open ref in sync for subscription callbacks.
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    localStorage.setItem('chill-room-chat-open', String(isChatOpen));
  }, [isChatOpen]);

  const handleToggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      if (!prev) resetUnreadCount();
      return !prev;
    });
  }, [resetUnreadCount]);

  // --- Helpers ---

  const loadPlaylist = useCallback(async (rid: string) => {
    const { data, error } = await supabase
      .from('playlist')
      .select('*')
      .eq('room_id', rid)
      .order('position');

    if (error) {
      console.error('Error loading playlist:', error);
      return;
    }
    setPlaylist(data || []);
  }, [setPlaylist]);

  // Normalize playlist positions to be sequential (0, 1, 2, ...).
  const normalizePlaylistPositions = useCallback(async (rid: string) => {
    const { data: songs, error: fetchError } = await supabase
      .from('playlist')
      .select('*')
      .eq('room_id', rid)
      .order('position');

    if (fetchError || !songs || songs.length === 0) return;

    const needsNormalization = songs.some((song, index) => song.position !== index);
    if (!needsNormalization) return;

    for (let i = 0; i < songs.length; i++) {
      await supabase
        .from('playlist')
        .update({ position: i })
        .eq('id', songs[i].id);
    }
  }, []);

  // --- Handlers ---

  const handleSceneChange = useCallback(async (scenePreset: string) => {
    if (!roomId) return;

    let didUpdate = false;
    setRoom((prev) => {
      if (!prev) return prev;
      didUpdate = true;
      return { ...prev, scene_preset: scenePreset };
    });
    if (!didUpdate) return;

    const { error } = await supabase
      .from('rooms')
      .update({ scene_preset: scenePreset, updated_at: new Date().toISOString() })
      .eq('id', roomId);

    if (error) {
      console.error('Error changing scene:', error);
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
      if (data) setRoom(data);
    }
  }, [roomId, setRoom]);

  // Auto-rotate scene every 30 minutes
  const sceneRotateRef = useRef<NodeJS.Timeout | null>(null);
  const SCENE_IDS = ['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5', 'scene-6', 'scene-7', 'scene-8', 'scene-9'];
  const ROTATE_INTERVAL = 30 * 60 * 1000;

  const rotateScene = useCallback(() => {
    if (!roomId) return;
    const latest = roomLatestRef.current;
    if (!latest) return;
    const currentId = latest.scene_preset || 'scene-1';
    const others = SCENE_IDS.filter((id) => id !== currentId);
    const nextId = others[Math.floor(Math.random() * others.length)];
    handleSceneChange(nextId);
    // SCENE_IDS is module-stable; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, handleSceneChange]);

  useEffect(() => {
    if (!roomId) return;
    if (sceneRotateRef.current) clearInterval(sceneRotateRef.current);
    sceneRotateRef.current = setInterval(rotateScene, ROTATE_INTERVAL);
    return () => {
      if (sceneRotateRef.current) clearInterval(sceneRotateRef.current);
    };
  }, [roomId, rotateScene]);

  const handleAddSong = useCallback(async (url: string, title: string) => {
    if (!roomId) return;
    const currentRoom = roomLatestRef.current;
    const hasCurrentSong = !!currentRoom?.current_song_url;

    if (!hasCurrentSong) {
      // NO SONG PLAYING - Start immediately (don't add to queue).
      const nowIso = new Date().toISOString();

      setRoom((prev) => prev ? {
        ...prev,
        current_song_url: url,
        current_song_title: title,
        current_song_started_at: nowIso,
        is_paused: false,
        paused_at: null,
      } : prev);

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

      if (error) console.error('Error starting song:', error);
    } else {
      // SONG PLAYING - Add to queue. Position is computed inside the
      // updater so we read the freshest length without stale closures.
      const tempId = `temp-${Date.now()}`;
      let nextPosition = 0;
      setPlaylist((prev) => {
        nextPosition = prev.length;
        return [...prev, {
          id: tempId,
          url,
          title,
          added_by: username,
          position: nextPosition,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any];
      });

      try {
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
          setPlaylist((prev) => prev.filter((s) => s.id !== tempId));
          return;
        }

        setPlaylist((prev) => prev.map((s) => (s.id === tempId ? data : s)));
      } catch (error) {
        console.error('Error in add song operation:', error);
        setPlaylist((prev) => prev.filter((s) => s.id !== tempId));
      }
    }
  }, [roomId, username, setRoom, setPlaylist]);

  const handleSkip = useCallback(async () => {
    if (!roomId) return;

    let nextSong: Song | undefined;
    setPlaylist((prev) => {
      nextSong = prev[0];
      return nextSong ? prev.slice(1) : prev;
    });

    if (nextSong) {
      try {
        const newStartTime = new Date().toISOString();
        setRoom((prev) => prev ? {
          ...prev,
          current_song_url: nextSong!.url,
          current_song_title: nextSong!.title,
          current_song_started_at: newStartTime,
          is_paused: false,
          paused_at: null,
        } : prev);

        const { error: roomError } = await supabase
          .from('rooms')
          .update({
            current_song_url: nextSong!.url,
            current_song_title: nextSong!.title,
            current_song_started_at: newStartTime,
            is_paused: false,
            paused_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', roomId);

        if (roomError) {
          console.error('Error updating room:', roomError);
          await loadPlaylist(roomId);
          const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
          if (roomData) setRoom(roomData);
          return;
        }

        const { error: deleteError } = await supabase
          .from('playlist')
          .delete()
          .eq('id', nextSong!.id)
          .eq('room_id', roomId);

        if (deleteError) {
          console.error('Error deleting song from playlist:', deleteError);
          await loadPlaylist(roomId);
          return;
        }

        await normalizePlaylistPositions(roomId);
      } catch (error) {
        console.error('Error during skip operation:', error);
        await loadPlaylist(roomId);
        const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
        if (roomData) setRoom(roomData);
      }
    } else {
      try {
        setRoom((prev) => prev ? {
          ...prev,
          current_song_url: null,
          current_song_title: null,
          current_song_started_at: null,
        } : prev);

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
          const { data: roomData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
          if (roomData) setRoom(roomData);
        }
      } catch (error) {
        console.error('Error clearing song:', error);
      }
    }
  }, [roomId, setRoom, setPlaylist, loadPlaylist, normalizePlaylistPositions]);

  const handleTogglePause = useCallback(async () => {
    if (!roomId) return;
    const currentRoom = roomLatestRef.current;
    if (!currentRoom) return;

    const nowPaused = !currentRoom.is_paused;

    setRoom((prev) => prev ? { ...prev, is_paused: nowPaused, paused_at: nowPaused ? new Date().toISOString() : null } : prev);

    if (nowPaused) {
      await supabase
        .from('rooms')
        .update({ is_paused: true, paused_at: new Date().toISOString() })
        .eq('id', roomId);
    } else {
      const startedAtMs = currentRoom.current_song_started_at ? new Date(currentRoom.current_song_started_at).getTime() : 0;
      const pausedAtMs = currentRoom.paused_at ? new Date(currentRoom.paused_at).getTime() : 0;
      const canShift = currentRoom.current_song_started_at && currentRoom.paused_at && pausedAtMs >= startedAtMs;

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
  }, [roomId, setRoom]);

  const handleRemoveSong = useCallback(async (songId: string) => {
    if (!roomId) return;

    try {
      setPlaylist((prev) => prev.filter((s) => s.id !== songId));

      const { error } = await supabase
        .from('playlist')
        .delete()
        .eq('id', songId)
        .eq('room_id', roomId);

      if (error) {
        console.error('Error removing song:', error);
        await loadPlaylist(roomId);
        return;
      }

      await normalizePlaylistPositions(roomId);
    } catch (error) {
      console.error('Error in remove song operation:', error);
      await loadPlaylist(roomId);
    }
  }, [roomId, setPlaylist, loadPlaylist, normalizePlaylistPositions]);

  const handleSendMessage = useCallback(async (
    message: string,
    replyTo: Message | null,
    image: File | null = null,
  ) => {
    if (!roomId) return;
    if (sendingRef.current) return;
    if (!message.trim() && !image) return;
    sendingRef.current = true;

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

    let imageUrl: string | null = null;
    if (image) {
      try {
        imageUrl = await uploadChatImage(image, roomId);
      } catch (error) {
        sendingRef.current = false;
        if (error instanceof ChatImageError) {
          toast.error(error.message);
        } else {
          console.error('Image upload failed:', error);
          toast.error('Could not upload image. Try again.');
        }
        return;
      }
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempId,
      user_id: userId,
      username,
      message,
      message_type: 'chat',
      created_at: new Date().toISOString(),
      image_url: imageUrl,
      ...replyFields,
    };

    setMessages((prev) => [...prev, optimisticMessage].slice(-50));

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          user_id: userId,
          username,
          message,
          message_type: 'chat',
          image_url: imageUrl,
          ...replyFields,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Reconcile temp → real id. There are two possible orderings:
      //   (a) insert resolves first → realtime echo arrives later. We
      //       swap tempId → realId; the realtime listener's state-level
      //       dedup then drops the echo because the id is already there.
      //   (b) realtime echo arrives first → it already pushed the real
      //       message into state. We must not overwrite the temp's id
      //       to realId (that would create two rows with the same id);
      //       instead we drop the temp.
      if (data) {
        const realId = data.id;
        setMessages((prev) => {
          if (prev.some((m) => m.id === realId)) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((msg) => (msg.id === tempId ? { ...msg, id: realId } : msg));
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } finally {
      sendingRef.current = false;
    }
  }, [roomId, userId, username, setMessages]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!roomId) return;

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
        const withoutMine = list.filter((r) => r.user_id !== userId);
        return { ...prev, [messageId]: [...withoutMine, real] };
      });
    }
  }, [roomId, userId, username, setReactionsByMessage]);

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
      const restore = removed;
      setReactionsByMessage((prev) => {
        const existing = prev[messageId] || [];
        if (existing.some((r) => r.id === restore.id)) return prev;
        return { ...prev, [messageId]: [...existing, restore] };
      });
    }
  }, [userId, setReactionsByMessage]);

  const handleBuzz = useCallback(async () => {
    if (!roomId) return;
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

    await supabase
      .from('room_members')
      .update({ username: newName })
      .eq('user_id', userId);

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

  // ChatProvider state + dispatch payloads. Two-context split: state
  // changes (messages/reactions) re-render only chat consumers; dispatch
  // is stable across renders so dispatch-only consumers never re-render
  // due to state churn.
  const chatState = useMemo<ChatState>(
    () => ({ messages, unreadCount, reactionsByMessage, members }),
    [messages, unreadCount, reactionsByMessage, members],
  );
  const chatDispatch = useMemo<ChatDispatch>(
    () => ({
      resetUnreadCount,
      sendMessage: handleSendMessage,
      react: handleReact,
      unreact: handleUnreact,
      buzz: handleBuzz,
      rename: handleRename,
    }),
    [resetUnreadCount, handleSendMessage, handleReact, handleUnreact, handleBuzz, handleRename],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--pixel-bg-deep)' }}>
        <p className="font-pixel text-sm" style={{ color: 'var(--pixel-accent-cyan)' }}>Loading room...</p>
      </div>
    );
  }

  return (
    <div className="room-page">
      {/* RoomScene + YouTubePlayer live OUTSIDE ChatProvider so they
          never subscribe to chat-state context and don't re-render on
          chat events. They are also wrapped in React.memo (Step 7). */}
      <div className="room-main">
        <RoomScene
          scenePreset={room?.scene_preset || 'scene-1'}
          onSceneChange={handleSceneChange}
        />
        <WeatherOverlay weather={room?.weather ?? 'sun'} />
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
        {/* The toggle button is purely presentational — its state still
            flows through props since `isOpen` is a page concern. */}
        <ChatToggleButton
          isOpen={isChatOpen}
          onToggle={handleToggleChat}
          unreadCount={unreadCount}
        />
      </div>
      <ChatProvider state={chatState} dispatch={chatDispatch}>
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
      </ChatProvider>
    </div>
  );
}
