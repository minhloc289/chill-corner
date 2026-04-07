import { Button } from './ui/button';

interface RoomSceneProps {
  scenePreset: string;
  onSceneChange: (preset: string) => void;
}

const scenePresets = [
  { id: 'scene-1', number: 1, image: '/scene-1.gif' },
  { id: 'scene-2', number: 2, image: '/scene-2.gif' },
  { id: 'scene-3', number: 3, image: '/scene-3.gif' },
  { id: 'scene-4', number: 4, image: '/scene-4.gif' },
];

export function RoomScene({ scenePreset, onSceneChange }: RoomSceneProps) {
  const currentScene = scenePresets.find((s) => s.id === scenePreset) || scenePresets[0];

  const handleSceneClick = (presetId: string) => {
    console.log('Button clicked, changing to:', presetId);
    onSceneChange(presetId);
  };

  return (
    <div className="room-scene">
      {/* Background Image/GIF */}
      <div
        className="room-background"
        style={{
          backgroundImage: `url(${currentScene.image})`,
        }}
      />

      {/* Scene Number Buttons */}
      <div className="scene-controls">
        {scenePresets.map((preset) => (
          <Button
            key={preset.id}
            variant={scenePreset === preset.id ? 'default' : 'outline'}
            size="icon"
            onClick={() => handleSceneClick(preset.id)}
            className="h-10 w-10 font-semibold"
          >
            {preset.number}
          </Button>
        ))}
      </div>
    </div>
  );
}
