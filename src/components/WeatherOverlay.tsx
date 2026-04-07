import { useEffect, useState } from 'react';

interface WeatherOverlayProps {
  weather: 'sun' | 'rain' | 'night';
}

export function WeatherOverlay({ weather }: WeatherOverlayProps) {
  const [raindrops, setRaindrops] = useState<number[]>([]);

  useEffect(() => {
    if (weather === 'rain') {
      // Generate 50 raindrops with random positions
      setRaindrops(Array.from({ length: 50 }, (_, i) => i));
    } else {
      setRaindrops([]);
    }
  }, [weather]);

  return (
    <div className="weather-overlay">
      {weather === 'rain' && (
        <div className="rain">
          {raindrops.map((i) => (
            <div
              key={i}
              className="raindrop"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${0.5 + Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      {weather === 'night' && (
        <div className="night-overlay">
          <div className="stars">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="star"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                }}
              />
            ))}
          </div>
          <div className="moon" />
        </div>
      )}

      {weather === 'sun' && (
        <div className="sun-overlay">
          <div className="sun" />
        </div>
      )}
    </div>
  );
}
