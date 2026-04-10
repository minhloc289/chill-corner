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

export function RoomScene({ scenePreset, onSceneChange }: RoomSceneProps) {
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

  return (
    <div className="room-scene">
      <div
        className="room-background"
        style={{ backgroundImage: `url(${currentScene.image})` }}
      />

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
    </div>
  );
}
