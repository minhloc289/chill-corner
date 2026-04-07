import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Users, Cloud, Moon } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');

  const handleCreateRoom = () => {
    navigate('/room');
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-indigo-100">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="mb-8 flex justify-center gap-4">
          <Music className="h-12 w-12 text-primary animate-pulse" />
          <Users className="h-12 w-12 text-primary animate-pulse delay-100" />
          <Cloud className="h-12 w-12 text-primary animate-pulse delay-200" />
          <Moon className="h-12 w-12 text-primary animate-pulse delay-300" />
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-4 tracking-tight">
          Chill Room
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-lg mx-auto">
          A cozy virtual space to listen to music together, chat with friends, and vibe with synchronized ambiance
        </p>

        <div className="space-y-6 bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
          <div>
            <Button
              onClick={handleCreateRoom}
              size="lg"
              className="w-full text-lg h-14"
            >
              Create New Room
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Start a new room and invite your friends
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter room ID..."
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleJoinRoom();
                  }
                }}
                className="h-14 text-lg flex-1"
              />
              <Button
                onClick={handleJoinRoom}
                size="lg"
                variant="outline"
                className="h-14 px-8"
                type="button"
              >
                Join
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Join an existing room with a room ID
            </p>
          </div>
        </div>

        <div className="mt-8 text-sm text-muted-foreground">
          <p>✨ Synced YouTube playback • 🌦️ Weather ambiance • 💬 Real-time chat</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
