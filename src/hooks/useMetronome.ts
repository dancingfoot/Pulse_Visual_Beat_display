import { useState, useEffect, useRef, useCallback } from 'react';

export function useMetronome(
  initialBpm: number = 120,
  soundEnabled: boolean = false,
  latencyCompensation: number = 0,
  linkEnabled: boolean = false,
  sharedBpm?: number,
  sharedIsPlaying?: boolean,
  sharedStartTime?: number
) {
  // Local state for non-linked fallback mode
  const [localBpm, setLocalBpm] = useState(initialBpm);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [localStartTime, setLocalStartTime] = useState<number>(Date.now());

  // Determine active states depending on whether link mode is on
  const activeBpm = linkEnabled && sharedBpm !== undefined ? sharedBpm : localBpm;
  const activeIsPlaying = linkEnabled && sharedIsPlaying !== undefined ? sharedIsPlaying : localIsPlaying;
  const activeStartTime = linkEnabled && sharedStartTime !== undefined ? sharedStartTime : localStartTime;

  const [beat, setBeat] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIDRef = useRef<number | null>(null);
  const lastScheduledBeatRef = useRef<number>(-1);

  // Synchronize state references to avoid stale closure references inside callback loop
  const activeBpmRef = useRef(activeBpm);
  const activeIsPlayingRef = useRef(activeIsPlaying);
  const activeStartTimeRef = useRef(activeStartTime);
  const soundEnabledRef = useRef(soundEnabled);
  const latencyCompensationRef = useRef(latencyCompensation);

  useEffect(() => { activeBpmRef.current = activeBpm; }, [activeBpm]);
  useEffect(() => { activeIsPlayingRef.current = activeIsPlaying; }, [activeIsPlaying]);
  useEffect(() => { activeStartTimeRef.current = activeStartTime; }, [activeStartTime]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { latencyCompensationRef.current = latencyCompensation; }, [latencyCompensation]);

  // Audio scheduler look-ahead parameters (seconds)
  const lookahead = 25.0; // ms
  const scheduleAheadTime = 0.1; // s

  const playOscillator = useCallback((freq: number, startTime: number, stopTime: number) => {
    if (!audioContextRef.current || !soundEnabledRef.current) return;
    try {
      const osc = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();
      
      osc.frequency.value = freq;
      
      // Fast pitch drop decay envelope for highly clicky focus beeps
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.002);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      osc.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      osc.start(startTime);
      osc.stop(stopTime);
    } catch (e) {
      console.warn("Waveform click scheduling failed:", e);
    }
  }, []);

  const scheduleNote = useCallback((beatNumber: number, localAudioTime: number) => {
    // Schedule beep
    const freq = beatNumber === 0 ? 880 : 440;
    playOscillator(freq, localAudioTime, localAudioTime + 0.08);

    // Sync UI beat safely
    if (audioContextRef.current) {
      const delayMs = Math.max(0, (localAudioTime - audioContextRef.current.currentTime) * 1000);
      setTimeout(() => {
        if (activeIsPlayingRef.current) {
          setBeat(beatNumber);
        }
      }, delayMs);
    }
  }, [playOscillator]);

  const scheduler = useCallback(() => {
    if (!audioContextRef.current || !activeIsPlayingRef.current) return;

    const audioCtx = audioContextRef.current;
    
    // Project Web Audio contexts back onto the absolute timeline clock
    const nowSec = Date.now() / 1000;
    const contextStartSec = nowSec - audioCtx.currentTime;
    
    const timelineStartSec = activeStartTimeRef.current / 1000;
    const secondsPerBeat = 60.0 / activeBpmRef.current;
    
    // Convert latency from milliseconds into timeline shifting offset seconds
    const latencySec = latencyCompensationRef.current / 1000;

    const lookAheadLimitSec = contextStartSec + audioCtx.currentTime + scheduleAheadTime;
    const windowStartGlobalSec = contextStartSec + audioCtx.currentTime;
    
    const startBeatIndex = Math.floor((windowStartGlobalSec - timelineStartSec - latencySec) / secondsPerBeat);
    const endBeatIndex = Math.ceil((lookAheadLimitSec - timelineStartSec - latencySec) / secondsPerBeat);

    for (let k = startBeatIndex; k <= endBeatIndex; k++) {
      const globalBeatTime = timelineStartSec + k * secondsPerBeat + latencySec;
      const localAudioTime = globalBeatTime - contextStartSec;

      if (localAudioTime >= audioCtx.currentTime && localAudioTime < audioCtx.currentTime + scheduleAheadTime) {
        if (k > lastScheduledBeatRef.current) {
          scheduleNote((k % 4 + 4) % 4, localAudioTime);
          lastScheduledBeatRef.current = k;
        }
      }
    }

    timerIDRef.current = window.setTimeout(scheduler, lookahead);
  }, [scheduleNote]);

  // Unlock audio state safely in modern browsers
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive'
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const startLoop = useCallback(() => {
    initAudio();
    lastScheduledBeatRef.current = -1;
    scheduler();
  }, [initAudio, scheduler]);

  const stopLoop = useCallback(() => {
    if (timerIDRef.current) {
      window.clearTimeout(timerIDRef.current);
      timerIDRef.current = null;
    }
  }, []);

  // Monitor playing state change to start/stop loop
  useEffect(() => {
    if (activeIsPlaying) {
      startLoop();
    } else {
      stopLoop();
    }
    return () => {
      stopLoop();
    };
  }, [activeIsPlaying, startLoop, stopLoop]);

  // Restart loop temporarily on BPM / timeline updates to correct window alignment
  useEffect(() => {
    if (activeIsPlaying) {
      stopLoop();
      startLoop();
    }
  }, [activeBpm, activeStartTime, activeIsPlaying]);

  const setBpm = useCallback((newBpm: number) => {
    const clampedBpm = Math.max(20, Math.min(300, newBpm));
    if (linkEnabled) {
      // Slaves ignore local input; masters will broadcast
      setLocalBpm(clampedBpm);
    } else {
      // Local mode uses phase conservation math automatically
      const now = Date.now();
      const currentBeatGlobal = (now - localStartTime) / 1000 * (localBpm / 60);
      const newStartTime = now - (currentBeatGlobal * (60 / clampedBpm) * 1000);
      setLocalStartTime(newStartTime);
      setLocalBpm(clampedBpm);
    }
  }, [linkEnabled, localBpm, localStartTime]);

  const toggleMetronome = useCallback(() => {
    initAudio();
    if (linkEnabled) {
      // Handled at application state layer
    } else {
      if (!localIsPlaying) {
        setLocalStartTime(Date.now());
        setLocalIsPlaying(true);
      } else {
        setLocalIsPlaying(false);
      }
    }
  }, [linkEnabled, localIsPlaying, initAudio]);

  const setPlaying = useCallback((playing: boolean) => {
    initAudio();
    if (linkEnabled) {
      // Handled at application state layer
    } else {
      if (playing !== localIsPlaying) {
        if (playing) {
          setLocalStartTime(Date.now());
        }
        setLocalIsPlaying(playing);
      }
    }
  }, [linkEnabled, localIsPlaying, initAudio]);

  return {
    bpm: activeBpm,
    setBpm,
    isPlaying: activeIsPlaying,
    toggleMetronome,
    setPlaying,
    beat,
    startTime: activeStartTime,
    setLocalStartTime,
    setLocalIsPlaying,
    initAudio
  };
}
