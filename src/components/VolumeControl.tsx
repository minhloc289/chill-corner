import { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';

interface VolumeControlProps {
  playerRef: React.MutableRefObject<any>;
  isReady: boolean;
}

export function VolumeControl({ playerRef, isReady }: VolumeControlProps) {
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(80);
  const [showSlider, setShowSlider] = useState(false);

  // Load volume from localStorage on mount
  useEffect(() => {
    const savedVolume = localStorage.getItem('chill-room-volume');
    if (savedVolume) {
      const vol = parseInt(savedVolume, 10);
      setVolume(vol);
      setPrevVolume(vol);
    }
  }, []);

  // Apply volume to player when it changes
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    try {
      const volumeToSet = isMuted ? 0 : volume;
      playerRef.current.setVolume(volumeToSet);
      localStorage.setItem('chill-room-volume', volume.toString());
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  }, [volume, isMuted, isReady, playerRef]);

  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);

    // If user adjusts slider while muted, unmute
    if (isMuted && newVolume > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      // Unmute - restore previous volume
      setIsMuted(false);
      setVolume(prevVolume > 0 ? prevVolume : 80);
    } else {
      // Mute - save current volume
      setPrevVolume(volume);
      setIsMuted(true);
    }
  };

  const displayVolume = isMuted ? 0 : volume;

  return (
    <div
      className="flex items-center gap-2 relative"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMute}
        className="h-8 w-8 flex-shrink-0"
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="h-4 w-4 text-white" />
        ) : (
          <Volume2 className="h-4 w-4 text-white" />
        )}
      </Button>

      {/* Volume slider - shows on hover */}
      <div
        className={`volume-slider-container ${showSlider ? 'volume-slider-visible' : ''}`}
      >
        <Slider
          value={[displayVolume]}
          onValueChange={handleVolumeChange}
          max={100}
          step={1}
          className="w-20 cursor-pointer"
        />
        <span className="text-xs text-white/70 ml-2 min-w-[2rem]">{displayVolume}%</span>
      </div>
    </div>
  );
}
