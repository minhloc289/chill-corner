import { useState, useEffect, useRef } from 'react';

interface ProgressBarProps {
  playerRef: React.MutableRefObject<any>;
  isReady: boolean;
  isPlaying: boolean;
}

export function ProgressBar({ playerRef, isReady, isPlaying }: ProgressBarProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Update progress every second when playing
  useEffect(() => {
    if (!isReady || !playerRef.current || !isPlaying) return;

    const interval = setInterval(() => {
      if (isDragging) return; // Don't update while dragging

      try {
        const current = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration();

        if (typeof current === 'number' && typeof dur === 'number') {
          setCurrentTime(current);
          setDuration(dur);
        }
      } catch (error) {
        console.error('Error getting playback time:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isReady, isPlaying, isDragging, playerRef]);

  // Get duration when video loads
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    try {
      const dur = playerRef.current.getDuration();
      if (typeof dur === 'number' && dur > 0) {
        setDuration(dur);
      }
    } catch (error) {
      console.error('Error getting duration:', error);
    }
  }, [isReady, playerRef]);

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Detect livestream (duration > 24 hours or 0)
  const isLivestream = duration > 86400 || (duration === 0 && isPlaying);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isReady || !playerRef.current || !progressRef.current || duration === 0) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const seekTime = percentage * duration;

    try {
      playerRef.current.seekTo(seekTime, true);
      setCurrentTime(seekTime);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;

    setHoverTime(time);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hoverPercentage = hoverTime !== null && duration > 0 ? (hoverTime / duration) * 100 : null;

  return (
    <div className="w-full space-y-1">
      {/* Progress bar */}
      <div
        ref={progressRef}
        className="progress-bar-container group cursor-pointer"
        onClick={handleSeek}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Background track */}
        <div className="progress-bar-track">
          {/* Played portion */}
          <div
            className="progress-bar-filled"
            style={{ width: `${progressPercentage}%` }}
          />

          {/* Hover preview */}
          {hoverPercentage !== null && (
            <div
              className="progress-bar-hover"
              style={{ width: `${hoverPercentage}%` }}
            />
          )}

          {/* Playhead */}
          <div
            className="progress-bar-thumb"
            style={{ left: `${progressPercentage}%` }}
          />
        </div>

        {/* Hover time tooltip */}
        {hoverTime !== null && hoverPercentage !== null && (
          <div
            className="progress-bar-tooltip"
            style={{ left: `${hoverPercentage}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Time display */}
      <div className="flex justify-between px-1 progress-time-display">
        {isLivestream ? (
          <>
            <span className="progress-live-badge">LIVE</span>
            <span>{formatTime(currentTime)}</span>
          </>
        ) : (
          <>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </>
        )}
      </div>
    </div>
  );
}
