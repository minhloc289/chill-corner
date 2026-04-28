import { useEffect, useRef } from 'react';

interface UseDriftCorrectionParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  playerRef: React.MutableRefObject<any>;
  // Primitive deps so the interval re-binds only on actual song change,
  // not on object-identity churn from {url, title, startedAt} memos.
  currentSongUrl: string | null;
  currentSongStartedAt: string | null;
  isReady: boolean;
  isPaused: boolean;
  // When true (default music playing), drift correction is suppressed.
  isPlayingDefault: boolean;
  hasCurrentVideoId: boolean;
}

const DRIFT_THRESHOLD_SECONDS = 1.5;
const SYNC_INTERVAL_MS = 3000;

/**
 * Periodic playback-position drift correction for the synced YouTube
 * player. Compares the player's current time against the expected time
 * (now - startedAt) and re-seeks when drift exceeds 1.5 s.
 *
 * Drift detection still polls `getCurrentTime()` because the IFrame API
 * does not push position events. Play/pause state, however, is driven
 * by the player's `onStateChange` event in the consumer — no polling.
 */
export function useDriftCorrection({
  playerRef,
  currentSongUrl,
  currentSongStartedAt,
  isReady,
  isPaused,
  isPlayingDefault,
  hasCurrentVideoId,
}: UseDriftCorrectionParams) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (
      !currentSongUrl
      || !currentSongStartedAt
      || !isReady
      || !playerRef.current
      || !hasCurrentVideoId
      || isPlayingDefault
      || isPaused
    ) {
      return;
    }

    intervalRef.current = setInterval(() => {
      if (!playerRef.current) return;
      try {
        const currentTime = playerRef.current.getCurrentTime();
        const startedAt = new Date(currentSongStartedAt).getTime();
        const expectedTime = (Date.now() - startedAt) / 1000;
        const drift = Math.abs(currentTime - expectedTime);

        if (drift > DRIFT_THRESHOLD_SECONDS) {
          playerRef.current.seekTo(expectedTime, true);
          const state = playerRef.current.getPlayerState();
          if (state !== window.YT?.PlayerState.PLAYING) {
            playerRef.current.playVideo();
          }
        }
      } catch {
        /* ignore — IFrame API can throw transiently during load */
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    playerRef,
    currentSongUrl,
    currentSongStartedAt,
    isReady,
    isPaused,
    isPlayingDefault,
    hasCurrentVideoId,
  ]);
}
