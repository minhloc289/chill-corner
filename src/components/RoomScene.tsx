import { Button } from './ui/button';
import { Image as ImageIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface RoomSceneProps {
  scenePreset: string;
  onSceneChange: (preset: string) => void;
}

const scenePresets = [
  { id: 'lofi-night', name: 'Lofi Night', image: '/room-lofi-night.jpg' },
  { id: 'sunny-day', name: 'Sunny Study', image: '/room-sunny-day.jpg' },
  { id: 'cafe-rain', name: 'Rainy Cafe', image: '/room-cafe-rain.jpg' },
  { id: 'beach-sunset', name: 'Beach Sunset', image: '/room-beach-sunset.jpg' },
];

export function RoomScene({ scenePreset, onSceneChange }: RoomSceneProps) {
  const currentScene = scenePresets.find((s) => s.id === scenePreset) || scenePresets[0];

  return (
    <div className="room-scene">
      {/* Background Image */}
      <div
        className="room-background"
        style={{
          backgroundImage: `url(${currentScene.image})`,
        }}
      />

      {/* Controls */}
      <div className="scene-controls">
        {/* Scene Preset Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              {currentScene.name}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {scenePresets.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => onSceneChange(preset.id)}
                className={scenePreset === preset.id ? 'bg-accent' : ''}
              >
                {preset.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
