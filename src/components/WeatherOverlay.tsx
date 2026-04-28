import { useMemo } from 'react';

interface WeatherOverlayProps {
  weather: 'sun' | 'rain' | 'night';
}

interface RaindropStyle {
  left: string;
  animationDelay: string;
  animationDuration: string;
}

interface StarStyle {
  left: string;
  top: string;
  animationDelay: string;
}

export function WeatherOverlay({ weather }: WeatherOverlayProps) {
  // Random positions are computed once per weather change, not per render.
  // Keeping them in state would force a useEffect roundtrip; useMemo keyed
  // on `weather` is the simpler pattern.
  const raindrops = useMemo<RaindropStyle[]>(() => {
    if (weather !== 'rain') return [];
    return Array.from({ length: 50 }, () => ({
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 2}s`,
      animationDuration: `${0.5 + Math.random() * 0.5}s`,
    }));
  }, [weather]);

  const stars = useMemo<StarStyle[]>(() => {
    if (weather !== 'night') return [];
    return Array.from({ length: 30 }, () => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 3}s`,
    }));
  }, [weather]);

  return (
    <div className="weather-overlay">
      {weather === 'rain' && (
        <div className="rain">
          {raindrops.map((style, i) => (
            <div key={i} className="raindrop" style={style} />
          ))}
        </div>
      )}

      {weather === 'night' && (
        <div className="night-overlay">
          <div className="stars">
            {stars.map((style, i) => (
              <div key={i} className="star" style={style} />
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
