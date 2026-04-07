import { WeatherOverlay } from './WeatherOverlay';
import { Button } from './ui/button';
import { Cloud, Sun, Moon, Image as ImageIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface RoomSceneProps {
  weather: 'sun' | 'rain' | 'night';
  scenePreset: string;
  onWeatherChange: (weather: 'sun' | 'rain' | 'night') => void;
  onSceneChange: (preset: string) => void;
}

const scenePresets = [
  { id: 'lofi-night', name: 'Lofi Night', image: '/room-lofi-night.jpg' },
  { id: 'sunny-day', name: 'Sunny Study', image: '/room-sunny-day.jpg' },
  { id: 'cafe-rain', name: 'Rainy Cafe', image: '/room-cafe-rain.jpg' },
  { id: 'beach-sunset', name: 'Beach Sunset', image: '/room-beach-sunset.jpg' },
];

export function RoomScene({ weather, scenePreset, onWeatherChange, onSceneChange }: RoomSceneProps) {
  const currentScene = scenePresets.find((s) => s.id === scenePreset) || scenePresets[0];

  return (
    <div className="room-scene">
      <WeatherOverlay weather={weather} />

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

        {/* Weather controls */}
        <div className="flex gap-2">
          <Button
            variant={weather === 'sun' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onWeatherChange('sun')}
            title="Sunny"
          >
            <Sun className="h-4 w-4" />
          </Button>
          <Button
            variant={weather === 'rain' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onWeatherChange('rain')}
            title="Rainy"
          >
            <Cloud className="h-4 w-4" />
          </Button>
          <Button
            variant={weather === 'night' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onWeatherChange('night')}
            title="Night"
          >
            <Moon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
