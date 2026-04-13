import {
  usePausePlayback, useResumePlayback, useStopPlayback,
  useSkipTrack, usePreviousTrack, useSeek, useSetVolume,
  useSetShuffle, useSetRepeat,
} from '@/hooks/use-music-bots';

export function usePlayback() {
  const pausePlayback = usePausePlayback();
  const resumePlayback = useResumePlayback();
  const stopPlayback = useStopPlayback();
  const skipTrack = useSkipTrack();
  const previousTrack = usePreviousTrack();
  const setVolume = useSetVolume();
  const seekMut = useSeek();
  const shuffleMut = useSetShuffle();
  const repeatMut = useSetRepeat();

  return {
    pausePlayback,
    resumePlayback,
    stopPlayback,
    skipTrack,
    previousTrack,
    setVolume,
    seekMut,
    shuffleMut,
    repeatMut,
  };
}
