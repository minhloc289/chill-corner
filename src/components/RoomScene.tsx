import { WeatherOverlay } from './WeatherOverlay';
import { Button } from './ui/button';
import { Cloud, Sun, Moon } from 'lucide-react';

interface RoomSceneProps {
  weather: 'sun' | 'rain' | 'night';
  onWeatherChange: (weather: 'sun' | 'rain' | 'night') => void;
}

export function RoomScene({ weather, onWeatherChange }: RoomSceneProps) {
  return (
    <div className="room-scene">
      <WeatherOverlay weather={weather} />

      <div className="room-container">
        {/* Window with view */}
        <div className="window">
          <div className="window-frame">
            <div className="window-pane" />
            <div className="window-pane" />
            <div className="window-pane" />
            <div className="window-pane" />
          </div>
        </div>

        {/* Bookshelf */}
        <div className="bookshelf">
          <div className="shelf">
            <div className="book book-1" />
            <div className="book book-2" />
            <div className="book book-3" />
            <div className="book book-4" />
          </div>
          <div className="shelf">
            <div className="book book-5" />
            <div className="book book-6" />
            <div className="book book-7" />
          </div>
          <div className="shelf">
            <div className="book book-8" />
            <div className="book book-9" />
            <div className="book book-10" />
            <div className="book book-11" />
          </div>
        </div>

        {/* Desk */}
        <div className="desk">
          <div className="desk-surface" />
          <div className="desk-leg-left" />
          <div className="desk-leg-right" />
        </div>

        {/* Lamp */}
        <div className="lamp">
          <div className="lamp-shade" />
          <div className="lamp-base" />
          <div className="lamp-light" />
        </div>

        {/* Plant */}
        <div className="plant">
          <div className="pot" />
          <div className="leaves">
            <div className="leaf" />
            <div className="leaf" />
            <div className="leaf" />
          </div>
        </div>
      </div>

      {/* Weather controls */}
      <div className="weather-controls">
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
  );
}
