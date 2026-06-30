import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Settings, Volume2, VolumeX, Globe, Terminal } from 'lucide-react';
import { useMetronome } from './hooks/useMetronome';
import { usePulseLink } from './hooks/usePulseLink';
import TesterPeer from './components/TesterPeer';

export default function App() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [latencyCompensation, setLatencyCompensation] = useState(0);
  const [localTimeSignature, setLocalTimeSignature] = useState("4/4");
  const [tempoMultiplier, setTempoMultiplier] = useState(1.0);

  // Shared state for collaborative network alignment
  const [sharedState, setSharedState] = useState({
    bpm: 120,
    isPlaying: false,
    startTime: Date.now(),
    timeSignature: "4/4"
  });

  // Pulse Link Hook (Network Sync)
  const { 
    isConnected: linkConnected, 
    isEnabled: linkEnabled, 
    peerCount,
    clockOffset,
    toggleLink, 
    updateState: updateLinkState
  } = usePulseLink(
    (state) => {
      // Incoming sync state from another peer
      setSharedState({
        bpm: state.bpm ?? 120,
        isPlaying: state.isPlaying ?? false,
        startTime: state.startTime ?? Date.now(),
        timeSignature: state.timeSignature ?? "4/4"
      });
    }
  );

  const activeTimeSignature = linkEnabled ? (sharedState.timeSignature || "4/4") : localTimeSignature;

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
    sharedState.startTime,
    clockOffset,
    activeTimeSignature,
    tempoMultiplier
  );

  // Sync state transitions locally/remotely based on sync role handler
  const handleBpmChange = useCallback((newBpm: number) => {
    const clampedBpm = Math.max(20, Math.min(300, newBpm));
    if (linkEnabled) {
      const serverNow = Date.now() + clockOffset;
      const currentBeatGlobal = (serverNow - sharedState.startTime) / 1000 * (sharedState.bpm / 60);
      const newStartTime = serverNow - (currentBeatGlobal * (60 / clampedBpm) * 1000);
      
      const nextState = {
        bpm: clampedBpm,
        startTime: newStartTime,
        isPlaying: sharedState.isPlaying,
        timeSignature: sharedState.timeSignature || "4/4"
      };
      setSharedState(nextState);
      updateLinkState(nextState);
    } else {
      setBpm(clampedBpm);
    }
  }, [linkEnabled, sharedState, clockOffset, setBpm, updateLinkState]);

  const handlePlayToggle = useCallback(() => {
    initAudio();
    if (linkEnabled) {
      const nextIsPlaying = !sharedState.isPlaying;
      const serverNow = Date.now() + clockOffset;
      const nextState = {
        bpm: sharedState.bpm,
        isPlaying: nextIsPlaying,
        startTime: nextIsPlaying ? serverNow : sharedState.startTime,
        timeSignature: sharedState.timeSignature || "4/4"
      };
      setSharedState(nextState);
      updateLinkState(nextState);
    } else {
      toggleMetronome();
    }
  }, [linkEnabled, sharedState, clockOffset, toggleMetronome, updateLinkState, initAudio]);

  const handleTimeSignatureChange = useCallback((newSig: string) => {
    if (linkEnabled) {
      const serverNow = Date.now() + clockOffset;
      const currentBeatGlobal = (serverNow - sharedState.startTime) / 1000 * (sharedState.bpm / 60);
      const newStartTime = serverNow - (currentBeatGlobal * (60 / sharedState.bpm) * 1000);

      const nextState = {
        bpm: sharedState.bpm,
        isPlaying: sharedState.isPlaying,
        startTime: newStartTime,
        timeSignature: newSig
      };
      setSharedState(nextState);
      updateLinkState(nextState);
    } else {
      setLocalTimeSignature(newSig);
    }
  }, [linkEnabled, sharedState, clockOffset, updateLinkState]);

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

  const isInteractive = true;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-[#FF3B30] selection:text-white overflow-hidden flex flex-row">
      {/* Main app pane */}
      <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
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
                <span className="text-[9px] font-mono text-[#00BFFF] uppercase tracking-widest pl-2 border-l border-white/10">
                  PEER SYNC
                </span>
              )}
            </div>

            <button 
              onClick={() => setShowTester(!showTester)} 
              className={`p-1.5 rounded-lg border transition-all ${showTester ? "bg-[#00BFFF]/10 border-[#00BFFF]/30 text-[#00BFFF]" : "border-white/10 opacity-50 hover:opacity-100"}`}
              title="Toggle Simulator Debug Panel"
            >
              <Terminal size={18} />
            </button>

            <button onClick={() => setShowSettings(!showSettings)} className="opacity-50 hover:opacity-100 transition-opacity p-1.5">
              <Settings size={18} />
            </button>
          </div>
        </header>

      {/* Main Display Area */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-4">
        {/* Sync Mode Instructions Banner */}
        {linkEnabled && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest opacity-60">
            Symmetric Pulse Link Active
          </div>
        )}

        <div className="relative flex items-center justify-center w-full max-w-2xl aspect-square">
          <div className="absolute inset-0 rounded-full border border-white/5" />
          
          {/* Beat Indicators */}
          <div className="absolute inset-0 flex items-center justify-center">
            {Array.from({ length: parseInt(activeTimeSignature.split('/')[0]) || 4 }).map((_, i) => {
              const beatsCount = parseInt(activeTimeSignature.split('/')[0]) || 4;
              const angle = i * (360 / beatsCount);
              return (
                <div 
                  key={i}
                  className={`absolute w-3.5 h-3.5 md:w-4.5 md:h-4.5 rounded-full transition-all duration-200 ${
                    isPlaying && beat === i 
                      ? "bg-[#FF3B30] scale-150 shadow-[0_0_20px_rgba(255,59,48,0.7)]" 
                      : "bg-white/20"
                  }`}
                  style={{ transform: `rotate(${angle}deg) translateY(-210px)` }}
                />
              );
            })}
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
              className={`w-72 h-72 md:w-80 md:h-80 rounded-full flex items-center justify-center transition-colors duration-200 ${
                isPlaying ? (beat === 0 ? "bg-[#FF3B30] shadow-[0_0_60px_rgba(255,59,48,0.5)]" : "bg-white shadow-[0_0_50px_rgba(255,255,255,0.3)]") : "bg-white/5"
              }`}
            >
              <div className="text-black font-mono text-9xl md:text-[140px] font-black select-none leading-none">
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
              className={`absolute w-72 h-72 md:w-80 md:h-80 rounded-full pointer-events-none border-2 ${beat === 0 ? "border-[#FF3B30] bg-[#FF3B30]/5" : "border-white bg-white/5"}`}
            />
          )}
        </div>

        {/* BPM Display */}
        <div className="mt-8 text-center select-none flex flex-col items-center gap-2">
          <div className="text-[130px] md:text-[160px] font-mono font-extralight tracking-tighter leading-none flex items-baseline justify-center">
            {bpm}
            <span className="text-2xl ml-4 opacity-40 font-sans font-bold uppercase tracking-widest">BPM</span>
          </div>
          <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm font-mono uppercase tracking-widest text-[#E0E0E0] flex items-center gap-2">
            <span>{activeTimeSignature}</span>
            {tempoMultiplier !== 1.0 && (
              <span className="text-[#FF3B30] pl-2 border-l border-white/10 font-bold font-mono">
                {Math.round(bpm * tempoMultiplier)} BPM ({tempoMultiplier}x)
              </span>
            )}
          </div>
        </div>

        {/* Subdivision & Tempo Ratios Grid */}
        <div className="mt-6 flex flex-col items-center gap-2.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">Grid Subdivision Ratio</span>
          <div className="flex flex-wrap justify-center bg-white/5 rounded-2xl md:rounded-full p-1 border border-white/10 gap-1 max-w-sm md:max-w-none">
            {[
              { label: "0.5x Half", value: 0.5, desc: "Half-time groove" },
              { label: "1.0x Norm", value: 1.0, desc: "Standard tempo" },
              { label: "1.5x Swing", value: 1.5, desc: "Polyrhythmic 3:2 swing feel" },
              { label: "2.0x Double", value: 2.0, desc: "8th note subdivisions" },
              { label: "3.0x Trip", value: 3.0, desc: "Triplet subdivisions (Swing/Blues)" },
              { label: "4.0x Quad", value: 4.0, desc: "16th note subdivisions" }
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setTempoMultiplier(item.value)}
                className={`px-3 py-1.5 text-[11px] font-mono rounded-full transition-all ${
                  tempoMultiplier === item.value
                    ? "bg-[#FF3B30] text-white font-medium shadow-[0_0_12px_rgba(255,59,48,0.4)]"
                    : "opacity-40 hover:opacity-100 text-white"
                }`}
                title={item.desc}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Controls Footer */}
      <footer className="p-8 bg-white/5 backdrop-blur-xl border-t border-white/10 flex flex-col items-center gap-6">
        <div className="flex flex-col lg:flex-row items-center gap-8 w-full max-w-5xl justify-between">
          
          {/* Tempo adjustment slider */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider opacity-40">Tempo Speed</span>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => handleBpmChange(bpm - 1)} 
                disabled={!isInteractive}
                className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20 text-2xl font-bold"
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
                className="w-48 sm:w-64 h-2 rounded-lg cursor-pointer accent-[#FF3B30] disabled:opacity-25" 
              />
              <button 
                onClick={() => handleBpmChange(bpm + 1)} 
                disabled={!isInteractive}
                className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20 text-2xl font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Action trigger group */}
          <div className="flex items-center gap-5">
            <button
              onClick={handlePlayToggle}
              disabled={!isInteractive}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                isPlaying 
                ? "bg-white text-black scale-95 hover:scale-90" 
                : "bg-[#FF3B30] text-white hover:scale-105 shadow-[0_0_35px_rgba(255,59,48,0.4)]"
              } disabled:opacity-20`}
            >
              {isPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="ml-1" />}
            </button>
            
            <button 
              onClick={handleTap} 
              disabled={!isInteractive}
              className="px-10 h-24 rounded-full border border-white/20 font-mono text-lg font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-20 shadow-md"
            >
              Tap
            </button>
          </div>

          {/* Link Connection State Trigger */}
          <div className="flex items-center">
            <button
              onClick={toggleLink}
              className={`flex flex-col items-center justify-center gap-1.5 px-10 h-16 rounded-full border transition-all ${
                linkEnabled 
                  ? "bg-[#00BFFF]/15 border-[#00BFFF] text-[#00BFFF] shadow-[0_0_15px_rgba(0,191,255,0.2)]" 
                  : "border-white/20 opacity-60 hover:opacity-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe size={18} />
                <span className="text-sm font-mono uppercase tracking-wider font-semibold">Pulse Link</span>
              </div>
              {linkEnabled && (
                <span className="text-[9px] font-mono uppercase opacity-80 font-bold">
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
                {/* Time Signature Section */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <h3 className="text-xs font-mono uppercase opacity-30 tracking-wider">Time Signature</h3>
                  <div className="flex bg-black rounded-lg p-1 border border-white/10 justify-between items-center gap-1">
                    {["2/4", "3/4", "4/4", "5/4", "6/8"].map((sig) => (
                      <button
                        key={sig}
                        onClick={() => handleTimeSignatureChange(sig)}
                        className={`flex-1 py-1.5 text-xs font-mono uppercase rounded-md transition-all ${
                          activeTimeSignature === sig
                            ? "bg-[#FF3B30] text-white font-medium shadow-[0_0_10px_rgba(255,59,48,0.3)]"
                            : "opacity-50 hover:opacity-100"
                        }`}
                      >
                        {sig}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] opacity-40 leading-normal">
                    {activeTimeSignature === "6/8" 
                      ? "6/8 Compound Time: 6 eighth-note beats per measure, accented on 1 and 4." 
                      : `${activeTimeSignature.split('/')[0]}/4 Simple Time: ${activeTimeSignature.split('/')[0]} quarter-note beats per measure, accented on the first beat.`}
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <h3 className="text-xs font-mono uppercase opacity-30 tracking-wider">Network Sync (Pulse Link)</h3>
                  <p className="text-xs opacity-50 leading-relaxed">
                    Symmetric P2P Sync: All connected devices are equal peers. Anyone can adjust tempo, toggle playback, or update the time signature, and all other devices instantly synchronize.
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
                        <span className="text-xs font-mono opacity-60">{activeTimeSignature.split('/')[0]} Beats</span>
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

      {/* Right Tester Pane (for wider screens) */}
      <AnimatePresence>
        {showTester && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "380px", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="hidden lg:block border-l border-white/10 shrink-0"
          >
            <TesterPeer />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile/Tablet Tester Slider Overlay (drawers) */}
      <AnimatePresence>
        {showTester && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed inset-y-0 right-0 z-40 w-full max-w-sm lg:hidden shadow-2xl"
          >
            <div className="absolute top-4 right-4 z-50">
              <button 
                onClick={() => setShowTester(false)}
                className="px-2 py-1 text-[10px] font-mono uppercase bg-black/80 hover:bg-black rounded border border-white/20 text-white"
              >
                Close
              </button>
            </div>
            <TesterPeer />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
