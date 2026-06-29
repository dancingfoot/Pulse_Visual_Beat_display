import { useState, useEffect, useCallback, useRef } from 'react';

export function useMetronome(
  initialBpm: number,
  soundEnabled: boolean,
  latencyCompensation: number,
  linkEnabled: boolean,
  sharedBpm: number,
  sharedIsPlaying: boolean,
  sharedStartTime: number,
  clockOffset: number,
  activeTimeSignature: string
) {
  const [localBpm, setLocalBpm] = useState(initialBpm);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScheduledBeatRef = useRef<number>(-1);
  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const bpm = linkEnabled ? sharedBpm : localBpm;
  const isPlaying = linkEnabled ? sharedIsPlaying : localIsPlaying;

  const beatsPerBar = parseInt(activeTimeSignature.split('/')[0]) || 4;

  // Initialize Audio Context on interaction
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      // Create audio context supporting prefix in case of old Safari
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const setBpm = useCallback((newBpm: number) => {
    setLocalBpm(newBpm);
  }, []);

  const toggleMetronome = useCallback(() => {
    initAudio();
    setLocalIsPlaying((prev) => !prev);
  }, [initAudio]);

  // Create oscillator sound
  const playSound = useCallback((time: number, isAccent: boolean) => {
    if (!audioContextRef.current || !soundEnabled) return;

    try {
      const osc = audioContextRef.current.createOscillator();
      const gain = audioContextRef.current.createGain();

      osc.connect(gain);
      gain.connect(audioContextRef.current.destination);

      // Cyberpunk clean synthetic click sounds
      osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);

      // Fast volume envelope to prevent pop noises
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08); // 80ms decay

      osc.start(time);
      osc.stop(time + 0.1);
    } catch (e) {
      console.warn('Metronome: Failed to play tick sound', e);
    }
  }, [soundEnabled]);

  // Scheduler Loop
  useEffect(() => {
    if (!isPlaying) {
      setBeat(0);
      lastScheduledBeatRef.current = -1;
      if (schedulerIntervalRef.current) {
        clearInterval(schedulerIntervalRef.current);
        schedulerIntervalRef.current = null;
      }
      return;
    }

    initAudio();
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Local mode timing vs Link mode timing
    let startLocalAudioTime = audioContext.currentTime;
    if (linkEnabled) {
      // Map global server millisecond timestamp to local AudioContext seconds
      const getLocalAudioTime = (serverTimeMs: number) => {
        const serverNow = Date.now() + clockOffset;
        const serverTimeDiff = serverTimeMs - serverNow;
        return audioContext.currentTime + (serverTimeDiff / 1000);
      };
      
      startLocalAudioTime = getLocalAudioTime(sharedStartTime) + (latencyCompensation / 1000);
    } else {
      // Local mode starts right now
      startLocalAudioTime = audioContext.currentTime + (latencyCompensation / 1000);
    }

    const secondsPerBeat = 60.0 / bpm;
    const lookahead = 0.1; // Check ahead by 100ms
    const intervalMs = 25; // Run scheduler tick every 25ms

    const schedulerTick = () => {
      const currentAudioTime = audioContext.currentTime;
      
      // Calculate which beat indices would fall into the lookahead window
      let nextBeatToSchedule = Math.floor((currentAudioTime - startLocalAudioTime) / secondsPerBeat);
      if (nextBeatToSchedule < 0) nextBeatToSchedule = 0;

      while (true) {
        const scheduledTime = startLocalAudioTime + (nextBeatToSchedule * secondsPerBeat);
        
        // If scheduled time is beyond lookahead window, stop scheduling for now
        if (scheduledTime > currentAudioTime + lookahead) {
          break;
        }

        // Schedule only if the beat has not been scheduled yet and is in the future/present
        if (scheduledTime >= currentAudioTime && nextBeatToSchedule > lastScheduledBeatRef.current) {
          const currentBeatIndex = nextBeatToSchedule % beatsPerBar;
          
          // Schedule sound click
          playSound(scheduledTime, currentBeatIndex === 0);

          // Trigger state update/visual animation at the precise scheduled beat time
          const delayMs = Math.max(0, (scheduledTime - currentAudioTime) * 1000);
          setTimeout(() => {
            setBeat(currentBeatIndex);
          }, delayMs);

          lastScheduledBeatRef.current = nextBeatToSchedule;
        }

        nextBeatToSchedule++;
      }
    };

    // Run first tick immediately
    schedulerTick();
    schedulerIntervalRef.current = setInterval(schedulerTick, intervalMs);

    return () => {
      if (schedulerIntervalRef.current) {
        clearInterval(schedulerIntervalRef.current);
        schedulerIntervalRef.current = null;
      }
    };
  }, [
    isPlaying,
    bpm,
    beatsPerBar,
    linkEnabled,
    sharedStartTime,
    clockOffset,
    latencyCompensation,
    playSound,
    initAudio
  ]);

  return {
    bpm,
    setBpm,
    isPlaying,
    toggleMetronome,
    beat,
    initAudio,
  };
}
