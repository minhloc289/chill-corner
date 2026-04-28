import { memo, useState } from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';

interface RoomSceneProps {
  scenePreset: string;
  onSceneChange: (preset: string) => void;
}

const scenePresets = [
  { id: 'scene-1', image: '/scene-1.gif' },
  { id: 'scene-2', image: '/scene-2.gif' },
  { id: 'scene-3', image: '/scene-3.gif' },
  { id: 'scene-4', image: '/scene-4.gif' },
  { id: 'scene-5', image: '/scene-5.gif' },
  { id: 'scene-6', image: '/scene-6.gif' },
  { id: 'scene-7', image: '/scene-7.gif' },
  { id: 'scene-8', image: '/scene-8.gif' },
  { id: 'scene-9', image: '/scene-9.gif' },
];

// Sparse positions for ambient sparkles — deterministic, not random per render.
const SPARKLE_POSITIONS = [
  { left: '8%',  delay: '0s',   color: 'var(--pixel-accent-sun)' },
  { left: '22%', delay: '3s',   color: 'var(--pixel-accent-peach)' },
  { left: '36%', delay: '6s',   color: 'var(--pixel-accent-sky)' },
  { left: '49%', delay: '1.5s', color: 'var(--pixel-accent-rose)' },
  { left: '61%', delay: '4.5s', color: 'var(--pixel-accent-mint)' },
  { left: '74%', delay: '7.5s', color: 'var(--pixel-accent-sun)' },
  { left: '86%', delay: '2s',   color: 'var(--pixel-accent-peach)' },
  { left: '93%', delay: '5s',   color: 'var(--pixel-accent-sky)' },
];

// Manual memo. Remove when React Compiler is enabled (currently blocked: SWC plugin support pending).
export const RoomScene = memo(function RoomScene({ scenePreset, onSceneChange }: RoomSceneProps) {
  const [hearts, setHearts] = useState<number[]>([]);

  const currentIndex = scenePresets.findIndex((s) => s.id === scenePreset);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentScene = scenePresets[safeIndex];

  const handlePrev = () => {
    const prevIndex = (safeIndex - 1 + scenePresets.length) % scenePresets.length;
    onSceneChange(scenePresets[prevIndex].id);
  };

  const handleNext = () => {
    const nextIndex = (safeIndex + 1) % scenePresets.length;
    onSceneChange(scenePresets[nextIndex].id);
  };

  const handleShuffle = () => {
    const others = scenePresets.filter((_, i) => i !== safeIndex);
    const random = others[Math.floor(Math.random() * others.length)];
    onSceneChange(random.id);
  };

  const handleMascotBoop = () => {
    const id = Date.now();
    setHearts((prev) => [...prev, id]);
    window.setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h !== id));
    }, 1200);
  };

  return (
    <div className="room-scene">
      <div
        className="room-background"
        style={{ backgroundImage: `url(${currentScene.image})` }}
      />

      {/* Ambient floating pixel sparkles */}
      <div className="ambient-sparkles" aria-hidden="true">
        {SPARKLE_POSITIONS.map((p, i) => (
          <span
            key={i}
            className="ambient-sparkle"
            style={{
              left: p.left,
              animationDelay: p.delay,
              backgroundColor: p.color,
              boxShadow: `0 0 6px ${p.color}`,
            }}
          />
        ))}
      </div>

      {/* Scene controls (top-right) */}
      <div className="scene-controls">
        <button onClick={handlePrev} className="scene-btn" aria-label="Previous scene">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="scene-indicator">{safeIndex + 1}/{scenePresets.length}</span>
        <button onClick={handleNext} className="scene-btn" aria-label="Next scene">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={handleShuffle} className="scene-btn" aria-label="Random scene">
          <Shuffle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pixel cat mascot (top-left) — click to boop */}
      <button
        className="pixel-mascot"
        onClick={handleMascotBoop}
        aria-label="Boop the cat"
        type="button"
      >
        <span className="pixel-mascot-sprite" aria-hidden="true" />
        {hearts.map((id) => (
          <span key={id} className="pixel-mascot-heart" aria-hidden="true" />
        ))}
      </button>
    </div>
  );
});
