import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
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
  message_type: 'chat' | 'system';
  created_at: string;
}

interface RoomMember {
  id: string;
  user_id: string;
  username: string;
}

export default function Room() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const [userId] = useState(getUserId());
  const [username, setUsername] = useState(getUsername());
  const [room, setRoom] = useState<Room | null>(null);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const saved = localStorage.getItem('chill-room-chat-open');
    return saved !== null ? saved === 'true' : true;
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const isChatOpenRef = useRef(isChatOpen);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const subscriptionRef = useRef<any>(null);
  const subscriptionActiveRef = useRef<boolean>(false);
  const messageInsertQueueRef = useRef<Set<string>>(new Set());
  const sendingRef = useRef<boolean>(false); // Prevent rapid double-sends
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null); // Delay leave to handle Strict Mode remount

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

        // Cancel any pending leave (handles React Strict Mode remount)
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current);
          leaveTimerRef.current = null;
        }

        // Check if member already exists (to avoid duplicate join messages)
        const { data: existingMember } = await supabase
          .from('room_members')
          .select('*')
          .eq('room_id', currentRoomId)
          .eq('user_id', userId)
          .single();

        const isNewMember = !existingMember;

        // Join room as member (upsert to handle page refreshes)
        const { error: memberError } = await supabase
          .from('room_members')
          .upsert({
            room_id: currentRoomId,
            user_id: userId,
            username,
            last_seen: new Date().toISOString(),
          }, {
            onConflict: 'room_id,user_id',
            ignoreDuplicates: false,
          });

        if (memberError) throw memberError;

        // Add system message for join only if it's a new member
        if (isNewMember) {
          await supabase.from('messages').insert({
            room_id: currentRoomId,
            user_id: userId,
            username,
            message: `${username} joined the room`,
            message_type: 'system',
          });
        }

        // Load initial data
        await Promise.all([
          loadPlaylist(currentRoomId),
          loadMessages(currentRoomId),
          loadMembers(currentRoomId),
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

      // Delay leave to handle React Strict Mode remount (cancellable)
      if (roomId) {
        leaveTimerRef.current = setTimeout(() => {
          handleLeaveRoom();
        }, 200);
      }

      // Cleanup debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

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

  // Update last_seen every 20 seconds (reduced from 10s to minimize re-renders)
  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(async () => {
      await supabase
        .from('room_members')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', userId);
    }, 20000);

    return () => clearInterval(interval);
  }, [roomId, userId]);

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

  const loadMembers = async (roomIdParam: string) => {
    // Remove stale members (not seen in last 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomIdParam)
      .lt('last_seen', thirtySecondsAgo);

    const { data, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomIdParam);

    if (error) {
      console.error('Error loading members:', error);
      return;
    }

    setMembers(data || []);
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

  // Debounced version to prevent excessive re-renders
  const loadMembersDebounced = useCallback((roomIdParam: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      loadMembers(roomIdParam);
    }, 300); // Wait 300ms after last update
  }, []);

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
        (payload) => {
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
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomIdParam}` },
        (payload) => {
          loadMembersDebounced(roomIdParam);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        } else if (status === 'CHANNEL_ERROR') {
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

  const handleLeaveRoom = async () => {
    if (!roomId) return;

    try {
      // Add system message
      await supabase.from('messages').insert({
        room_id: roomId,
        user_id: userId,
        username,
        message: `${username} left the room`,
        message_type: 'system',
      });

      // Remove from members
      await supabase.from('room_members').delete().eq('user_id', userId);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  };

  const handleWeatherChange = useCallback(async (weather: 'sun' | 'rain' | 'night') => {
    if (!roomId) return;

    await supabase
      .from('rooms')
      .update({ weather, updated_at: new Date().toISOString() })
      .eq('id', roomId);
  }, [roomId]);

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
    } else {
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

      // OPTIMISTIC: Update local state
      setRoom((prev) => prev ? {
        ...prev,
        current_song_url: url,
        current_song_title: title,
        current_song_started_at: new Date().toISOString(),
      } : prev);

      // Update database
      const { error } = await supabase
        .from('rooms')
        .update({
          current_song_url: url,
          current_song_title: title,
          current_song_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        } : prev);

        // ATOMIC OPERATIONS: Do both database operations
        // 1. Update room with next song
        const { error: roomError } = await supabase
          .from('rooms')
          .update({
            current_song_url: nextSong.url,
            current_song_title: nextSong.title,
            current_song_started_at: newStartTime,
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

  const handleSendMessage = useCallback(async (message: string) => {
    if (!roomId) return;

    // Prevent rapid double-sends
    if (sendingRef.current) return;
    sendingRef.current = true;

    // Optimistic update: show message instantly with temp ID
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempId,
      user_id: userId,
      username,
      message,
      message_type: 'chat',
      created_at: new Date().toISOString(),
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
        onSendMessage={handleSendMessage}
        onRename={handleRename}
        isOpen={isChatOpen}
      />
    </div>
  );
}
