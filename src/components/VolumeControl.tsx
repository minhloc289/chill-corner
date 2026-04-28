import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';

interface VolumeControlProps {
  playerRef: React.MutableRefObject<any>;
  isReady: boolean;
}

const BAR_COUNT = 10;

export function VolumeControl({ playerRef, isReady }: VolumeControlProps) {
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(80);
  const meterRef = useRef<HTMLDivElement>(null);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('chill-room-volume');
    if (saved) {
      const vol = parseInt(saved, 10);
      setVolume(vol);
      setPrevVolume(vol);
    }
  }, []);

  // Apply volume to the YouTube player synchronously on every change —
  // this part has to be immediate so the audio response feels instant.
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      playerRef.current.setVolume(isMuted ? 0 : volume);
    } catch (err) {
      console.error('Error setting volume:', err);
    }
  }, [volume, isMuted, isReady, playerRef]);

  // Persist to localStorage on a 300ms debounce. Dragging the volume meter
  // triggers many state changes per second; writing to localStorage on each
  // one would block the main thread unnecessarily. We do NOT use
  // requestIdleCallback — Safari has zero support as of 2026.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem('chill-room-volume', volume.toString());
      } catch {
        /* localStorage may be disabled in private mode — non-blocking */
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [volume]);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolume > 0 ? prevVolume : 80);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
    }
  };

  // Map a clientX coordinate on the meter to a 0–100 volume value.
  // Rounds to the nearest integer step so the bars feel snappy.
  const volumeFromClientX = useCallback((clientX: number) => {
    const el = meterRef.current;
    if (!el) return volume;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * 100);
  }, [volume]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    const next = volumeFromClientX(e.clientX);
    setVolume(next);
    if (isMuted && next > 0) setIsMuted(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    const next = volumeFromClientX(e.clientX);
    setVolume(next);
    if (isMuted && next > 0) setIsMuted(false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  // Keyboard affordance: arrow keys step 5%, Home/End jump to extremes.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 5;
    let next = volume;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, volume - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(100, volume + step);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    else return;
    e.preventDefault();
    setVolume(next);
    if (isMuted && next > 0) setIsMuted(false);
  };

  const displayVolume = isMuted ? 0 : volume;
  const activeBars = Math.round((displayVolume / 100) * BAR_COUNT);

  return (
    <div className="volume-control-group" title={`Volume ${displayVolume}%`}>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMute}
        className="volume-mute-btn"
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>

      <div
        ref={meterRef}
        className={`volume-meter ${isMuted ? 'volume-meter-muted' : ''}`}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayVolume}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`volume-bar ${i < activeBars ? 'volume-bar-active' : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="volume-percent">{displayVolume}%</span>
    </div>
  );
}
