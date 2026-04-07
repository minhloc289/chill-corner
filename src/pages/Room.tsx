import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { RoomScene } from '@/components/RoomScene';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { ChatSidebar } from '@/components/ChatSidebar';
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

  // Initialize or join room
  useEffect(() => {
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
            })
            .select()
            .single();

          if (createError) throw createError;
          setRoom(newRoom);
        } else {
          setRoom(existingRoom);
        }

        // Join room as member
        const { error: memberError } = await supabase
          .from('room_members')
          .upsert({
            room_id: currentRoomId,
            user_id: userId,
            username,
            last_seen: new Date().toISOString(),
          });

        if (memberError) throw memberError;

        // Add system message for join
        await supabase.from('messages').insert({
          room_id: currentRoomId,
          user_id: userId,
          username,
          message: `${username} joined the room`,
          message_type: 'system',
        });

        // Load initial data
        await Promise.all([
          loadPlaylist(currentRoomId),
          loadMessages(currentRoomId),
          loadMembers(currentRoomId),
        ]);

        // Subscribe to realtime updates
        subscribeToRoom(currentRoomId);

        setLoading(false);
      } catch (error) {
        console.error('Error initializing room:', error);
        setLoading(false);
      }
    };

    initRoom();

    // Cleanup on unmount
    return () => {
      if (roomId) {
        handleLeaveRoom();
      }
    };
  }, [roomId, navigate]);

  // Update last_seen every 10 seconds
  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(async () => {
      await supabase
        .from('room_members')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', userId);
    }, 10000);

    return () => clearInterval(interval);
  }, [roomId, userId]);

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

    setMessages(data || []);
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

  const subscribeToRoom = (roomIdParam: string) => {
    // Subscribe to room changes
    supabase
      .channel(`room:${roomIdParam}`)
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
          setMessages((prev) => [...prev, payload.new as Message].slice(-50));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomIdParam}` },
        () => {
          loadMembers(roomIdParam);
        }
      )
      .subscribe();
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

  const handleWeatherChange = async (weather: 'sun' | 'rain' | 'night') => {
    if (!roomId) return;

    await supabase
      .from('rooms')
      .update({ weather, updated_at: new Date().toISOString() })
      .eq('id', roomId);
  };

  const handleSceneChange = async (scenePreset: string) => {
    if (!roomId) return;

    await supabase
      .from('rooms')
      .update({ scene_preset: scenePreset, updated_at: new Date().toISOString() })
      .eq('id', roomId);
  };

  const handleAddSong = async (url: string, title: string) => {
    if (!roomId) return;

    const nextPosition = playlist.length > 0 ? Math.max(...playlist.map((s) => s.position)) + 1 : 0;

    const { error } = await supabase.from('playlist').insert({
      room_id: roomId,
      url,
      title,
      added_by: username,
      position: nextPosition,
    });

    if (error) {
      console.error('Error adding song:', error);
      return;
    }

    // If no song is currently playing, start this one immediately
    if (!room?.current_song_url) {
      // Update room with the new song
      await supabase
        .from('rooms')
        .update({
          current_song_url: url,
          current_song_title: title,
          current_song_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

      // Remove from playlist (it's now playing)
      await supabase
        .from('playlist')
        .delete()
        .eq('room_id', roomId)
        .eq('url', url)
        .eq('position', nextPosition);
    }
  };

  const handleSkip = async () => {
    if (!roomId) return;

    // Get next song in queue
    const nextSong = playlist[0];

    if (nextSong) {
      // Update room with new song
      await supabase
        .from('rooms')
        .update({
          current_song_url: nextSong.url,
          current_song_title: nextSong.title,
          current_song_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);

      // Remove from playlist
      await supabase.from('playlist').delete().eq('id', nextSong.id);
    } else {
      // No more songs, clear current song
      await supabase
        .from('rooms')
        .update({
          current_song_url: null,
          current_song_title: null,
          current_song_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!roomId) return;

    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: userId,
      username,
      message,
      message_type: 'chat',
    });
  };

  const handleRename = async (newName: string) => {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading room...</p>
      </div>
    );
  }

  return (
    <div className="room-page">
      <div className="room-main">
        <RoomScene
          weather={room?.weather || 'sun'}
          scenePreset={room?.scene_preset || 'lofi-night'}
          onWeatherChange={handleWeatherChange}
          onSceneChange={handleSceneChange}
        />
        <YouTubePlayer
          currentSong={
            room?.current_song_url
              ? {
                  url: room.current_song_url,
                  title: room.current_song_title || 'Untitled',
                  startedAt: room.current_song_started_at || new Date().toISOString(),
                }
              : null
          }
          playlist={playlist}
          onAddSong={handleAddSong}
          onSkip={handleSkip}
        />
      </div>
      <ChatSidebar
        messages={messages}
        members={members}
        currentUsername={username}
        onSendMessage={handleSendMessage}
        onRename={handleRename}
      />
    </div>
  );
}
