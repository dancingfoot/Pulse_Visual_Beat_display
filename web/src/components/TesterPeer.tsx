import { useState, useEffect } from 'react';
import { Terminal, Cpu, Clock, RefreshCw } from 'lucide-react';

export default function TesterPeer() {
  const [latency, setLatency] = useState(25);
  const [jitter, setJitter] = useState(5);
  const [simulatedPeers, setSimulatedPeers] = useState<Array<{ id: string; latency: number; drift: number }>>([
    { id: 'esp32-node-a7', latency: 12, drift: -2 },
    { id: 'bespoke-synth-daw', latency: 4, drift: 1 },
  ]);

  const addSimulatedPeer = () => {
    const ids = ['ableton-live-peer', 'iphone-link-client', 'rpi-pulse-box', 'esp32-sensor-b'];
    const randomId = ids[Math.floor(Math.random() * ids.length)] + '-' + Math.random().toString(36).substring(2, 5);
    setSimulatedPeers(prev => [
      ...prev,
      {
        id: randomId,
        latency: Math.floor(Math.random() * 80) + 10,
        drift: Math.floor(Math.random() * 10) - 5
      }
    ]);
  };

  const clearSimulatedPeers = () => {
    setSimulatedPeers([]);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 w-full select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-[#00BFFF]" />
          <h2 className="text-sm font-mono uppercase tracking-wider font-semibold">Pulse Link Inspector</h2>
        </div>
        <Cpu size={18} className="text-white/30 animate-pulse" />
      </div>

      {/* Latency & Jitter Simulator Settings */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="opacity-40">Simulated Network Latency</span>
            <span className="text-[#00BFFF] font-bold">{latency} ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="300"
            value={latency}
            onChange={(e) => setLatency(parseInt(e.target.value))}
            className="w-full accent-[#00BFFF] h-1.5 bg-white/10 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="opacity-40">Network Jitter Range</span>
            <span className="text-[#00BFFF] font-bold">± {jitter} ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={jitter}
            onChange={(e) => setJitter(parseInt(e.target.value))}
            className="w-full accent-[#00BFFF] h-1.5 bg-white/10 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Active Clients Listing */}
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider font-semibold opacity-40">Simulated Link Peers</span>
          <div className="flex gap-2">
            <button
              onClick={addSimulatedPeer}
              className="text-[10px] font-mono uppercase px-2.5 py-1 bg-[#00BFFF]/10 border border-[#00BFFF]/30 text-[#00BFFF] rounded-md hover:bg-[#00BFFF]/20 transition-all font-semibold"
            >
              + Add
            </button>
            <button
              onClick={clearSimulatedPeers}
              className="text-[10px] font-mono uppercase px-2.5 py-1 bg-white/5 border border-white/10 text-white/50 rounded-md hover:bg-white/10 transition-all font-semibold"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {simulatedPeers.length === 0 ? (
            <div className="text-xs font-mono opacity-30 text-center py-6 border border-dashed border-white/10 rounded-xl">
              No simulated peers active
            </div>
          ) : (
            simulatedPeers.map((peer, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-mono font-bold text-white/80">{peer.id}</span>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/40">
                    <Clock size={10} />
                    <span>Drift: {peer.drift > 0 ? `+${peer.drift}` : peer.drift} ms</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-mono text-emerald-400 font-bold">
                    {peer.latency + Math.floor(Math.random() * (jitter * 2 + 1)) - jitter} ms
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Clock Synchronization Report */}
      <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-amber-400" />
          <span className="text-xs font-mono uppercase tracking-wider font-semibold opacity-50">Clock Alignment Status</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-white/5 p-2 rounded-lg border border-white/10">
            <div className="text-[10px] font-mono opacity-40 uppercase">Clock Offset</div>
            <div className="text-sm font-mono font-bold text-amber-400">Stable</div>
          </div>
          <div className="bg-white/5 p-2 rounded-lg border border-white/10">
            <div className="text-[10px] font-mono opacity-40 uppercase">NTP Filter</div>
            <div className="text-sm font-mono font-bold text-emerald-400">Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}
