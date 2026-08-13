import { Terminal, Cpu, Clock, Laptop, Globe, Radio } from 'lucide-react';

interface NodeInfo {
  id: string;
  type: string;
  name: string;
  latency: number;
  peers: number;
}

interface TesterPeerProps {
  nodes: NodeInfo[];
  currentClientId: string | null;
}

export default function TesterPeer({ nodes, currentClientId }: TesterPeerProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 w-full select-none h-full overflow-y-auto">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-[#00BFFF]" />
          <h2 className="text-sm font-mono uppercase tracking-wider font-semibold text-white">Network Nodes</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[10px] font-mono text-[#00BFFF]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] animate-pulse" />
          <span>{nodes.length} Active</span>
        </div>
      </div>

      {/* Real-time Connected Nodes Listing */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-mono uppercase tracking-wider font-semibold opacity-40">Connected Link Nodes</span>

        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          {nodes.length === 0 ? (
            <div className="text-xs font-mono opacity-30 text-center py-10 border border-dashed border-white/10 rounded-xl">
              Waiting for network nodes...
            </div>
          ) : (
            nodes.map((node) => {
              const isSelf = node.id === currentClientId;
              const isBridge = node.type === 'Link Bridge' || node.name.toLowerCase().includes('bridge');
              
              return (
                <div
                  key={node.id}
                  className={`flex flex-col gap-2 p-3.5 rounded-xl border transition-all ${
                    isSelf 
                      ? "bg-[#00BFFF]/5 border-[#00BFFF]/20" 
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isBridge ? (
                        <Radio size={14} className="text-[#FF3B30]" />
                      ) : (
                        <Laptop size={14} className="text-[#00BFFF]" />
                      )}
                      <span className="text-xs font-mono font-bold text-white/90 truncate max-w-[150px]">
                        {node.name}
                      </span>
                      {isSelf && (
                        <span className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#00BFFF]/10 border border-[#00BFFF]/20 text-[#00BFFF]">
                          YOU
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                        {node.latency} ms
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                  </div>

                  {/* Sub-status detailed row */}
                  <div className="flex items-center justify-between text-[9px] font-mono text-white/40 pt-1.5 border-t border-white/5">
                    <span className="uppercase opacity-80">{node.type}</span>
                    
                    {isBridge && (
                      <span className="text-[#FF3B30] font-semibold uppercase">
                        {node.peers} Native {node.peers === 1 ? 'Peer' : 'Peers'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Clock Synchronization / Network Health Report */}
      <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-auto flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-amber-400" />
          <span className="text-xs font-mono uppercase tracking-wider font-semibold opacity-50">Symmetric P2P Status</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-white/5 p-2 rounded-lg border border-white/10">
            <div className="text-[10px] font-mono opacity-40 uppercase">NTP Filter</div>
            <div className="text-xs font-mono font-bold text-emerald-400">Continuous</div>
          </div>
          <div className="bg-white/5 p-2 rounded-lg border border-white/10">
            <div className="text-[10px] font-mono opacity-40 uppercase">Sync Engine</div>
            <div className="text-xs font-mono font-bold text-emerald-400">Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}
