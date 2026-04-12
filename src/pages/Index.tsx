import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div
      className="landing-page min-h-screen flex items-center justify-center"
      style={{ background: 'var(--pixel-bg-deep)' }}
    >
      <div className="max-w-xl mx-auto px-6 text-center relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="pixel-headphones" aria-hidden="true" />
        </div>

        <h1
          className="font-pixel mb-5 tracking-tight"
          style={{
            color: 'var(--pixel-text-primary)',
            fontSize: '28px',
            lineHeight: '1.4',
          }}
        >
          Chill Corner
        </h1>

        <p
          className="mb-10 max-w-md mx-auto"
          style={{
            color: 'var(--pixel-text-secondary)',
            fontSize: '14px',
            lineHeight: '1.6',
          }}
        >
          A cozy virtual space to listen to music together, chat with friends,
          and vibe with synchronized ambiance.
        </p>

        <div
          className="space-y-6 p-7 pixel-border"
          style={{ background: 'var(--pixel-bg-surface)' }}
        >
          <div>
            <Button
              onClick={handleCreateRoom}
              size="lg"
              className="w-full h-14 font-pixel"
              style={{
                background: 'var(--pixel-accent-peach)',
                color: 'var(--pixel-text-primary)',
                border: '2px solid var(--pixel-accent-peach)',
                borderRadius: '4px',
                boxShadow: '3px 3px 0 0 #d87a58',
                fontSize: '11px',
              }}
            >
              Create New Room
            </Button>
            <p
              className="mt-3"
              style={{
                color: 'var(--pixel-text-secondary)',
                fontSize: '12px',
                lineHeight: '1.5',
              }}
            >
              Start a new room and invite your friends
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span
                className="w-full pixel-divider"
                aria-hidden="true"
              />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 font-pixel"
                style={{
                  background: 'var(--pixel-bg-surface)',
                  color: 'var(--pixel-text-muted)',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                }}
              >
                OR
              </span>
            </div>
          </div>

          <div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter room ID…"
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
                  background: 'var(--pixel-bg-elevated)',
                  color: 'var(--pixel-text-primary)',
                  border: '2px solid var(--pixel-border)',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              <Button
                onClick={handleJoinRoom}
                size="lg"
                variant="outline"
                className="h-14 px-7 font-pixel"
                type="button"
                style={{
                  background: 'var(--pixel-bg-surface)',
                  color: 'var(--pixel-accent-sky)',
                  border: '2px solid var(--pixel-accent-sky)',
                  borderRadius: '4px',
                  boxShadow: '3px 3px 0 0 #4a8fc7',
                  fontSize: '11px',
                }}
              >
                Join
              </Button>
            </div>
            <p
              className="mt-3"
              style={{
                color: 'var(--pixel-text-secondary)',
                fontSize: '12px',
                lineHeight: '1.5',
              }}
            >
              Got a room ID from a friend? Drop it in.
            </p>
          </div>
        </div>

        <div
          className="mt-10"
          style={{
            color: 'var(--pixel-text-muted)',
            fontSize: '12px',
            lineHeight: '1.7',
          }}
        >
          <p>Synced YouTube playback · weather ambiance · real-time chat</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
