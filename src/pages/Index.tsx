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
    <div className="landing-page min-h-screen flex items-center justify-center" style={{ background: 'var(--pixel-bg-deep)' }}>
      <div className="max-w-2xl mx-auto px-6 text-center relative z-10">
        {/* Pixel headphones character */}
        <div className="mb-6 flex justify-center">
          <div className="pixel-headphones" aria-hidden="true" />
        </div>

        <h1 className="text-3xl md:text-5xl font-pixel mb-4 tracking-tight" style={{ color: 'var(--pixel-text-primary)', lineHeight: '1.3' }}>
          Chill Room
        </h1>

        <p className="text-sm md:text-base mb-12 max-w-lg mx-auto" style={{ color: 'var(--pixel-text-secondary)' }}>
          A cozy virtual space to listen to music together, chat with friends, and vibe with synchronized ambiance
        </p>

        <div className="space-y-6 p-8 pixel-border" style={{ background: 'var(--pixel-bg-surface)' }}>
          <div>
            <Button
              onClick={handleCreateRoom}
              size="lg"
              className="w-full text-sm h-14 font-pixel"
              style={{
                background: 'var(--pixel-accent-cyan)',
                color: 'var(--pixel-bg-deep)',
                border: '2px solid var(--pixel-accent-cyan)',
                borderRadius: '4px',
                boxShadow: '3px 3px 0 0 rgba(0, 240, 255, 0.3)',
                fontSize: '11px',
              }}
            >
              Create New Room
            </Button>
            <p className="text-xs mt-2 font-pixel" style={{ color: 'var(--pixel-text-secondary)', fontSize: '8px' }}>
              Start a new room and invite your friends
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full" style={{ borderTop: '2px solid var(--pixel-border)' }} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-3 font-pixel" style={{ background: 'var(--pixel-bg-surface)', color: 'var(--pixel-text-secondary)', fontSize: '8px' }}>Or</span>
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
                className="h-14 text-base flex-1"
                style={{
                  background: 'var(--pixel-bg-deep)',
                  color: 'var(--pixel-text-primary)',
                  border: '2px solid var(--pixel-border)',
                  borderRadius: '4px',
                }}
              />
              <Button
                onClick={handleJoinRoom}
                size="lg"
                variant="outline"
                className="h-14 px-8 font-pixel"
                type="button"
                style={{
                  background: 'transparent',
                  color: 'var(--pixel-accent-magenta)',
                  border: '2px solid var(--pixel-accent-magenta)',
                  borderRadius: '4px',
                  boxShadow: '2px 2px 0 0 rgba(255, 62, 220, 0.3)',
                  fontSize: '11px',
                }}
              >
                Join
              </Button>
            </div>
            <p className="text-xs mt-2 font-pixel" style={{ color: 'var(--pixel-text-secondary)', fontSize: '8px' }}>
              Join an existing room with a room ID
            </p>
          </div>
        </div>

        <div className="mt-8 font-pixel" style={{ color: 'var(--pixel-text-secondary)', fontSize: '8px', lineHeight: '1.8' }}>
          <p>Synced YouTube playback / Weather ambiance / Real-time chat</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
