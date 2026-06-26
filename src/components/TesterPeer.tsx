import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Send, Wifi, WifiOff, RefreshCw, Layers, ArrowRightLeft, Square } from 'lucide-react';

interface LogMessage {
  id: string;
  timestamp: string;
  type: 'sent' | 'recv' | 'info' | 'error';
  text: string;
}

export default function TesterPeer() {
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  
  // Simulated state for the Tester Peer
  const [simBpm, setSimBpm] = useState(120);
  const [simIsPlaying, setSimIsPlaying] = useState(false);
  const [simRole, setSimRole] = useState<'master' | 'slave'>('master');
  
  const [receivedBpm, setReceivedBpm] = useState<number | null>(null);
  const [receivedIsPlaying, setReceivedIsPlaying] = useState<boolean | null>(null);
  
  const [clockOffset, setClockOffset] = useState(0);
  const clockOffsetRef = useRef(0);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  const addLog = useCallback((type: 'sent' | 'recv' | 'info' | 'error', text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: time,
        type,
        text,
      },
      ...prev.slice(0, 49), // Keep last 50 logs
    ]);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) return;

    addLog('info', 'Connecting tester peer socket...');
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      setIsConnected(true);
      addLog('info', 'Tester connected to Pulse Link synchronizer');

      // Start ping loop
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "PING",
            clientTime: Date.now()
          }));
        }
      }, 2500);
      (socket as any).pingInterval = interval;
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "WELCOME") {
          setClientId(message.clientId);
          addLog('recv', `WELCOME - Assigned client ID: ${message.clientId}`);
        }
        
        if (message.type === "PONG") {
          const receiveTime = Date.now();
          const clientTime = message.clientTime;
          const serverTime = message.serverTime;
          const rtt = receiveTime - clientTime;
          const offset = serverTime - (clientTime + rtt / 2);
          clockOffsetRef.current = offset;
          setClockOffset(offset);
          // Only log periodically or silently record to avoid spamming the log feed
          addLog('recv', `PONG sync: latency=${rtt}ms, offset=${offset}ms`);
        }

        if (message.type === "SYNC_STATE") {
          const state = message.state;
          setReceivedBpm(state.bpm);
          setReceivedIsPlaying(state.isPlaying);
          addLog('recv', `SYNC_STATE - BPM: ${state.bpm} | Playing: ${state.isPlaying ? 'YES' : 'NO'} | By: ${state.lastUpdatedBy}`);
          
          // Slave simulation automatically tracks incoming sync state
          if (simRole === 'slave') {
            setSimBpm(state.bpm);
            setSimIsPlaying(state.isPlaying);
          }
        }
        
        if (message.type === "PEER_COUNT") {
          setPeerCount(message.count);
          addLog('recv', `PEER_COUNT - Other peers on network: ${message.count}`);
        }

        if (message.type === "BEAT") {
          addLog('recv', `BEAT pulse tick: ${message.beat}`);
        }
      } catch (e) {
        addLog('error', `Error parsing message: ${String(e)}`);
      }
    };

    socket.onclose = () => {
      if ((socket as any).pingInterval) {
        clearInterval((socket as any).pingInterval);
      }
      setIsConnected(false);
      setClientId(null);
      setPeerCount(0);
      setClockOffset(0);
      clockOffsetRef.current = 0;
      socketRef.current = null;
      addLog('info', 'Tester socket disconnected');
    };

    socket.onerror = (e) => {
      addLog('error', 'WebSocket error event triggered');
    };

    socketRef.current = socket;
  }, [addLog, simRole]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  const sendStateUpdate = useCallback((bpmVal: number, playState: boolean) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addLog('error', 'Cannot send state: WebSocket is not open');
      return;
    }

    const serverNow = Date.now() + clockOffsetRef.current;
    const payload = {
      bpm: bpmVal,
      isPlaying: playState,
      startTime: serverNow
    };
    
    socketRef.current.send(JSON.stringify({
      type: 'UPDATE_STATE',
      state: payload
    }));
    
    addLog('sent', `UPDATE_STATE - BPM: ${bpmVal} | Playing: ${playState ? 'YES' : 'NO'}`);
  }, [addLog]);

  const sendBeatTick = useCallback((tickVal: number) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addLog('error', 'Cannot send beat: WebSocket is not open');
      return;
    }

    socketRef.current.send(JSON.stringify({
      type: 'BEAT',
      beat: tickVal,
      time: Date.now()
    }));
    addLog('sent', `BEAT event sent - Beat Index: ${tickVal}`);
  }, [addLog]);

  const clearLogs = () => setLogs([]);

  // Auto trigger updates in master role mode if local sim controls mutate
  const handleBpmChange = (newBpm: number) => {
    const clamped = Math.max(20, Math.min(300, newBpm));
    setSimBpm(clamped);
    if (simRole === 'master' && isConnected) {
      sendStateUpdate(clamped, simIsPlaying);
    }
  };

  const handlePlayToggle = () => {
    const nextVal = !simIsPlaying;
    setSimIsPlaying(nextVal);
    if (simRole === 'master' && isConnected) {
      sendStateUpdate(simBpm, nextVal);
    }
  };

  // Turn off socket when component unmounts
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full border-l border-white/10 bg-[#0E0E0E] text-[#D0D0D0] text-sm overflow-hidden select-none">
      {/* Title Header */}
      <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">Pulse Link Test Peer</span>
        </div>
        
        <div className="flex items-center gap-2">
          {isConnected ? (
            <button 
              onClick={disconnect}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase bg-red-950/40 text-red-400 hover:bg-red-950/80 border border-red-900/40 rounded transition-colors"
            >
              <WifiOff size={10} /> Disconnect
            </button>
          ) : (
            <button 
              onClick={connect}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/80 border border-emerald-900/40 rounded transition-colors"
            >
              <Wifi size={10} /> Connect Sim
            </button>
          )}
        </div>
      </div>

      {/* Network Diagnostics Badges */}
      <div className="p-4 bg-black/40 grid grid-cols-2 gap-2 border-b border-white/5 font-mono text-xs">
        <div className="rounded p-2 bg-white/[0.02] border border-white/5">
          <div className="opacity-40 text-[9px] uppercase tracking-wider">Sim Client ID</div>
          <div className="font-bold truncate mt-1 text-[#00BFFF]">
            {clientId || 'Not connected'}
          </div>
        </div>
        <div className="rounded p-2 bg-white/[0.02] border border-white/5">
          <div className="opacity-40 text-[9px] uppercase tracking-wider">Other Active Peers</div>
          <div className="font-bold mt-1 text-[#00BFFF]">
            {isConnected ? peerCount : '—'}
          </div>
        </div>
      </div>

      {/* Simulator Tuning Deck */}
      <div className="p-4 bg-[#121212] space-y-4 flex-none border-b border-white/5">
        <div className="flex justify-between items-center bg-black/30 rounded-lg p-1.5 border border-white/5">
          <span className="text-xs font-mono font-medium pl-1.5 opacity-60">SIM ROLE</span>
          <div className="flex gap-1">
            <button 
              onClick={() => {
                setSimRole('master');
                addLog('info', 'Changed sim role to Master (can broadcast state updates)');
              }}
              className={`px-3 py-1 text-[10px] font-mono uppercase rounded-md transition-all ${simRole === 'master' ? 'bg-[#00BFFF] text-black font-semibold' : 'opacity-40 hover:opacity-150'}`}
            >
              Master
            </button>
            <button 
              onClick={() => {
                setSimRole('slave');
                addLog('info', 'Changed sim role to Slave (behaves as target recipient)');
              }}
              className={`px-3 py-1 text-[10px] font-mono uppercase rounded-md transition-all ${simRole === 'slave' ? 'bg-[#00BFFF] text-black font-semibold' : 'opacity-40 hover:opacity-150'}`}
            >
              Slave
            </button>
          </div>
        </div>

        {/* BPM Console */}
        <div className="space-y-2">
          <div className="flex justify-between items-baseline font-mono text-xs">
            <span className="opacity-40 uppercase">Tester Tempo</span>
            <span className="text-lg font-bold text-white">{simBpm} <span className="text-[10px] uppercase font-light opacity-50">BPM</span></span>
          </div>
          
          <input 
            type="range"
            min="20"
            max="300"
            value={simBpm}
            onChange={(e) => handleBpmChange(parseInt(e.target.value))}
            className="w-full accent-[#00BFFF] h-1.5 bg-black rounded"
          />

          <div className="grid grid-cols-5 gap-1 pt-1 font-mono text-[9px]">
            {[60, 90, 120, 140, 160].map((preset) => (
              <button 
                key={preset}
                onClick={() => handleBpmChange(preset)}
                className="py-1 rounded bg-white/5 hover:bg-white/10 text-white transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Command deck */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {/* Play/Pause Simulator Control */}
          <button
            onClick={handlePlayToggle}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded font-mono text-xs uppercase tracking-wider transition-all ${
              simIsPlaying 
                ? 'bg-white text-black font-semibold hover:bg-neutral-200' 
                : 'bg-[#FF3B30] text-white hover:bg-red-600 shadow-md shadow-red-950/20'
            }`}
          >
            {simIsPlaying ? (
              <>
                <Pause size={12} fill="currentColor" /> Stop Sync
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" /> Play Sync
              </>
            )}
          </button>

          {/* Manual state pusher (Manual Broadcast) */}
          <button
            onClick={() => sendStateUpdate(simBpm, simIsPlaying)}
            disabled={!isConnected}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded font-mono text-[10px] uppercase bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all disabled:opacity-20"
          >
            <Send size={11} /> Force Push
          </button>
        </div>

        {/* Sync Status Overlay / Monitor */}
        <div className="bg-black/40 rounded p-2.5 space-y-1.5 font-mono text-[10px] border border-white/5">
          <div className="opacity-30 uppercase text-[8px] tracking-wider mb-1">Last Server Reported Values</div>
          <div className="flex justify-between">
            <span className="opacity-50">Remote Tempo:</span>
            <span className="font-bold text-[#00BFFF]">
              {receivedBpm !== null ? `${receivedBpm} BPM` : 'No packets'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-50">Remote Playing:</span>
            <span className="font-bold text-[#00BFFF]">
              {receivedIsPlaying !== null ? (receivedIsPlaying ? 'STREAMING ACTIVE' : 'STOPPED') : 'No packets'}
            </span>
          </div>
        </div>

        {/* Manual Beat Pulsation Simulator */}
        <div className="space-y-1 bg-black/20 p-2.5 rounded border border-white/5">
          <div className="opacity-30 uppercase text-[8px] tracking-wider mb-2">Beat Pulsator Simulator</div>
          <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
            {[0, 1, 2, 3].map((b) => (
              <button 
                key={b}
                onClick={() => sendBeatTick(b)}
                disabled={!isConnected}
                className="py-1.5 text-center bg-white/5 border border-white/5 hover:bg-white/10 text-white font-bold rounded transition-colors disabled:opacity-10"
              >
                {b + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#070707]">
        <div className="p-3 bg-black/60 flex items-center justify-between border-b border-white/5">
          <span className="font-mono text-[10px] uppercase tracking-wider opacity-40">WebSocket Traffic Feed</span>
          <button 
            onClick={clearLogs}
            className="flex items-center gap-1 text-[9px] font-mono uppercase px-1.5 py-0.5 opacity-30 hover:opacity-100 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-all font-medium"
          >
            Clear Log
          </button>
        </div>

        {/* Scrolling logs container */}
        <div className="flex-1 p-3 font-mono text-[10px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-25 text-[9px] font-sans py-12">
              <Layers size={18} className="mb-1.5" />
              Logs will appear streamingly as network state<br />changes or pulses occur.
            </div>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id} 
                className={`leading-tight border-l-2 pl-2 ${
                  log.type === 'sent' ? 'border-[#00BFFF] text-sky-400/90' :
                  log.type === 'recv' ? 'border-amber-500 text-amber-300/95' :
                  log.type === 'error' ? 'border-red-500 text-red-400' :
                  'border-neutral-700 text-neutral-400'
                }`}
              >
                <span className="opacity-35 text-[9px] mr-1">{log.timestamp}</span>
                <span className="opacity-45 mr-1 font-bold">
                  {log.type === 'sent' ? '➔ OUT' : log.type === 'recv' ? '➔ IN' : '• SYS'}
                </span>
                {log.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
