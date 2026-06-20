import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Settings, Volume2, VolumeX, Globe } from 'lucide-react';
import { useMetronome } from './hooks/useMetronome';
import { usePulseLink } from './hooks/usePulseLink';

export default function App() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncRole, setSyncRole] = useState<'master' | 'slave'>('master');
  const [latencyCompensation, setLatencyCompensation] = useState(0);

  // Shared state for collaborative network alignment
  const [sharedState, setSharedState] = useState({
    bpm: 120,
    isPlaying: false,
    startTime: Date.now()
  });

  // Pulse Link Hook (Network Sync)
  const { 
    isConnected: linkConnected, 
    isEnabled: linkEnabled, 
    peerCount,
    toggleLink, 
    updateState: updateLinkState
  } = usePulseLink(
    (state) => {
      // Incoming sync state from another peer
      setSharedState({
        bpm: state.bpm ?? 120,
        isPlaying: state.isPlaying ?? false,
        startTime: state.startTime ?? Date.now()
      });
    }
  );

  // Metronome Hook
  const { 
    bpm, 
    setBpm, 
    isPlaying, 
    toggleMetronome, 
    beat,
    initAudio
  } = useMetronome(
    120,
    soundEnabled,
    latencyCompensation,
    linkEnabled,
    sharedState.bpm,
    sharedState.isPlaying,
    sharedState.startTime
  );

  // Sync state transitions locally/remotely based on sync role handler
  const handleBpmChange = useCallback((newBpm: number) => {
    const clampedBpm = Math.max(20, Math.min(300, newBpm));
    if (linkEnabled) {
      if (syncRole === 'master') {
        const now = Date.now();
        const currentBeatGlobal = (now - sharedState.startTime) / 1000 * (sharedState.bpm / 60);
        const newStartTime = now - (currentBeatGlobal * (60 / clampedBpm) * 1000);
        
        const nextState = {
          bpm: clampedBpm,
          startTime: newStartTime,
          isPlaying: sharedState.isPlaying
        };
        setSharedState(nextState);
        updateLinkState(nextState);
      }
    } else {
      setBpm(clampedBpm);
    }
  }, [linkEnabled, syncRole, sharedState, setBpm, updateLinkState]);

  const handlePlayToggle = useCallback(() => {
    initAudio();
    if (linkEnabled) {
      if (syncRole === 'master') {
        const nextIsPlaying = !sharedState.isPlaying;
        const nextState = {
          bpm: sharedState.bpm,
          isPlaying: nextIsPlaying,
          startTime: nextIsPlaying ? Date.now() : sharedState.startTime
        };
        setSharedState(nextState);
        updateLinkState(nextState);
      }
    } else {
      toggleMetronome();
    }
  }, [linkEnabled, syncRole, sharedState, toggleMetronome, updateLinkState, initAudio]);

  // Tap Tempo logic
  const tapTimes = useRef<number[]>([]);
  const handleTap = () => {
    initAudio();
    const now = performance.now();
    tapTimes.current.push(now);
    if (tapTimes.current.length > 4) tapTimes.current.shift();
    
    if (tapTimes.current.length >= 2) {
      const diffs = [];
      for (let i = 1; i < tapTimes.current.length; i++) {
        diffs.push(tapTimes.current[i] - tapTimes.current[i-1]);
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const tappedBpm = Math.round(60000 / avgDiff);
      if (tappedBpm >= 20 && tappedBpm <= 300) {
        handleBpmChange(tappedBpm);
      }
    }
  };

  const isInteractive = !linkEnabled || syncRole === 'master';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-[#FF3B30] selection:text-white overflow-hidden flex flex-col">
      {/* Header / Status Rail */}
      <header className="p-6 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#FF3B30] animate-pulse" />
          <h1 className="text-xs font-mono uppercase tracking-[0.2em] opacity-50">Pulse // Visual Sync</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Quick Sound Toggler */}
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-full border transition-all ${soundEnabled ? "bg-[#FF3B30]/10 border-[#FF3B30] text-[#FF3B30]" : "border-white/10 opacity-30 hover:opacity-100"}`}
            title={soundEnabled ? "Mute audio beeps" : "Unmute audio beeps"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <div className="flex items-center gap-6 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <Globe size={14} className={linkEnabled ? "text-[#00BFFF]" : "opacity-30"} />
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase tracking-wider leading-none">Link</span>
                {linkEnabled && (
                  <span className="text-[8px] font-mono opacity-50 leading-none mt-0.5">
                    {peerCount} {peerCount === 1 ? 'Peer' : 'Peers'}
                  </span>
                )}
              </div>
            </div>
            {linkEnabled && (
              <span className="text-[9px] font-mono opacity-50 uppercase tracking-widest pl-2 border-l border-white/10">
                {syncRole}
              </span>
            )}
          </div>

          <button onClick={() => setShowSettings(!showSettings)} className="opacity-50 hover:opacity-100 transition-opacity p-1.5">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Display Area */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-4">
        {/* Sync Mode Instructions Banner */}
        {linkEnabled && syncRole === 'slave' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest opacity-60">
            Following Master Active Timeline
          </div>
        )}

        <div className="relative flex items-center justify-center w-full max-w-2xl aspect-square">
          <div className="absolute inset-0 rounded-full border border-white/5" />
          
          {/* Beat Indicators */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i}
                className={`absolute w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                  isPlaying && beat === i 
                    ? "bg-[#FF3B30] scale-150 shadow-[0_0_15px_rgba(255,59,48,0.6)]" 
                    : "bg-white/10"
                }`}
                style={{ transform: `rotate(${i * 90}deg) translateY(-160px)` }}
              />
            ))}
          </div>

          {/* Main Pulse */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={isPlaying ? beat : 'inactive'}
              initial={{ scale: 0.8, opacity: 0.3 }}
              animate={{ 
                scale: isPlaying ? (beat === 0 ? 1.25 : 1.05) : 0.8, 
                opacity: isPlaying ? 1 : 0.1 
              }}
              transition={{ type: "spring", stiffness: 450, damping: 20 }}
              className={`w-64 h-64 rounded-full flex items-center justify-center transition-colors duration-200 ${
                isPlaying ? (beat === 0 ? "bg-[#FF3B30] shadow-[0_0_50px_rgba(255,59,48,0.4)]" : "bg-white shadow-[0_0_40px_rgba(255,255,255,0.25)]") : "bg-white/5"
              }`}
            >
              <div className="text-black font-mono text-7xl font-bold">
                {isPlaying ? beat + 1 : ""}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Ripple Glow Ring */}
          {isPlaying && (
            <motion.div
              key={`ripple-${beat}`}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`absolute w-64 h-64 rounded-full pointer-events-none border-2 ${beat === 0 ? "border-[#FF3B30] bg-[#FF3B30]/5" : "border-white bg-white/5"}`}
            />
          )}
        </div>

        {/* BPM Display */}
        <div className="mt-8 text-center select-none">
          <div className="text-[120px] font-mono font-light tracking-tighter leading-none flex items-baseline justify-center">
            {bpm}
            <span className="text-xl ml-4 opacity-30 font-sans uppercase tracking-widest">BPM</span>
          </div>
        </div>
      </main>

      {/* Controls Footer */}
      <footer className="p-8 bg-white/5 backdrop-blur-xl border-t border-white/10 flex flex-col items-center gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-8 w-full max-w-4xl justify-center">
          
          {/* Tempo adjustment slider */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-mono uppercase opacity-30">Tempo</span>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => handleBpmChange(bpm - 1)} 
                disabled={!isInteractive}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20"
              >
                -
              </button>
              <input 
                type="range" 
                min="20" 
                max="300" 
                value={bpm} 
                onChange={(e) => handleBpmChange(parseInt(e.target.value))} 
                disabled={!isInteractive}
                className="w-48 accent-[#FF3B30] disabled:opacity-25" 
              />
              <button 
                onClick={() => handleBpmChange(bpm + 1)} 
                disabled={!isInteractive}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20"
              >
                +
              </button>
            </div>
          </div>

          {/* Action trigger group */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayToggle}
              disabled={!isInteractive}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isPlaying 
                ? "bg-white text-black scale-95 hover:scale-90" 
                : "bg-[#FF3B30] text-white hover:scale-105 shadow-[0_0_30px_rgba(255,59,48,0.3)]"
              } disabled:opacity-20`}
            >
              {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>
            
            <button 
              onClick={handleTap} 
              disabled={!isInteractive}
              className="px-8 h-20 rounded-full border border-white/20 font-mono uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-20"
            >
              Tap
            </button>
          </div>

          {/* Link Connection State Trigger */}
          <div className="flex items-center">
            <button
              onClick={toggleLink}
              className={`flex flex-col items-center justify-center gap-1 px-8 h-14 rounded-full border transition-all ${
                linkEnabled 
                  ? "bg-[#00BFFF]/10 border-[#00BFFF] text-[#00BFFF]" 
                  : "border-white/20 opacity-50 hover:opacity-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe size={16} />
                <span className="text-xs font-mono uppercase tracking-wider">Pulse Link</span>
              </div>
              {linkEnabled && (
                <span className="text-[8px] font-mono uppercase opacity-70">
                  {peerCount} {peerCount === 1 ? 'Peer' : 'Peers'}
                </span>
              )}
            </button>
          </div>

        </div>
      </footer>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 15 }}
            className="absolute inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-2xl flex items-center justify-center p-8"
          >
            <div className="max-w-md w-full space-y-8">
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                <h2 className="text-2xl font-mono uppercase tracking-tighter">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-sm opacity-50 hover:opacity-100 transition-opacity font-mono uppercase">
                  Close
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <h3 className="text-xs font-mono uppercase opacity-30 tracking-wider">Network Sync (Pulse Link)</h3>
                  <p className="text-xs opacity-50 leading-relaxed">
                    Pulse Link syncs multiple browsers or devices around a mathematically phase-locked master timeline.
                  </p>
                  
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm">Link Active</span>
                    <button 
                      onClick={toggleLink}
                      className={`px-3 py-1 text-xs font-mono uppercase rounded border transition-colors ${
                        linkEnabled 
                          ? "bg-[#00BFFF]/20 border-[#00BFFF] text-[#00BFFF]" 
                          : "border-white/20 opacity-50"
                      }`}
                    >
                      {linkEnabled ? "Activated" : "Deactivated"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Connection Status</span>
                    <span className={`text-xs font-mono ${linkConnected ? "text-[#00BFFF]" : "text-red-500"}`}>
                      {linkConnected ? "CONNECTED" : "DISCONNECTED"}
                    </span>
                  </div>

                  {linkEnabled && (
                    <div className="pt-4 border-t border-white/5 space-y-6">
                      {/* Sync Role Selection */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Device Role</span>
                          <div className="flex bg-black rounded-lg p-1 border border-white/10">
                            <button 
                              onClick={() => setSyncRole('master')}
                              className={`px-3 py-1 text-[10px] font-mono uppercase rounded-md transition-all ${syncRole === 'master' ? "bg-[#00BFFF] text-black" : "opacity-50 hover:opacity-100"}`}
                            >
                              Master
                            </button>
                            <button 
                              onClick={() => setSyncRole('slave')}
                              className={`px-3 py-1 text-[10px] font-mono uppercase rounded-md transition-all ${syncRole === 'slave' ? "bg-[#00BFFF] text-black" : "opacity-50 hover:opacity-100"}`}
                            >
                              Slave
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] opacity-40 leading-normal">
                          {syncRole === 'master' 
                            ? "Master: This device sets the global timeline, broadcasting tempo and play/pause commands." 
                            : "Slave: This device behaves strictly as a silent target, running perfectly in phase with the master."}
                        </p>
                      </div>

                      {/* Latency Slider */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Latency Compensation</span>
                          <span className="text-xs font-mono text-[#00BFFF]">{latencyCompensation} ms</span>
                        </div>
                        <input 
                          type="range" 
                          min="-200" 
                          max="200" 
                          step="5" 
                          value={latencyCompensation} 
                          onChange={(e) => setLatencyCompensation(parseInt(e.target.value))}
                          className="w-full accent-[#00BFFF]" 
                        />
                        <p className="text-[10px] opacity-40 leading-normal">
                          Use this to slide playback ahead or behind (negative/positive offset) to align perfectly with speakers, headsets, or external soundcards.
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-sm opacity-60">Sync Quantum</span>
                        <span className="text-xs font-mono opacity-60">4 Beats</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
