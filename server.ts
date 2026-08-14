import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Simple file logger for backend debugging
const logPath = "/tmp/server.log";
fs.writeFileSync(logPath, `--- Server started at ${new Date().toISOString()} ---\n`);

function logToFile(msg: string) {
  const formatted = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logPath, formatted);
  console.log(formatted.trim());
}

// Native Ableton Link Engine Integration (Direct LAN Multicast Sync)
interface NativeLinkAdapter {
  link: any;
  isKtamas: boolean;
  getNumPeers: () => number;
  getTempo: () => number;
  setTempo: (bpm: number) => void;
  isPlayingState: () => boolean;
  play: () => void;
  stop: () => void;
}

let nativeLinkAdapter: NativeLinkAdapter | null = null;

function initNativeAbletonLink(initialBpm: number): NativeLinkAdapter | null {
  try {
    let AbletonLinkClass: any = null;
    let isKtamas = false;

    try {
      AbletonLinkClass = require("abletonlink");
      isKtamas = false;
      logToFile("Found 'abletonlink' native bindings.");
    } catch {
      try {
        AbletonLinkClass = require("@ktamas77/abletonlink");
        isKtamas = true;
        logToFile("Found '@ktamas77/abletonlink' native bindings.");
      } catch {
        // Native Link not installed in current environment
      }
    }

    if (!AbletonLinkClass) {
      logToFile("ℹ Native Ableton Link C++ bindings not loaded. Operating with high-precision network clock.");
      return null;
    }

    const link = isKtamas ? new AbletonLinkClass(initialBpm) : new AbletonLinkClass();
    if (!isKtamas) link.bpm = initialBpm;

    try {
      if (isKtamas) {
        link.enable(true);
        link.enableStartStopSync(true);
      } else {
        link.isLinkEnable = true;
        link.isPlayStateSync = true;
      }
    } catch (e) {}

    const adapter: NativeLinkAdapter = {
      link,
      isKtamas,
      getNumPeers() {
        try {
          return isKtamas ? this.link.getNumPeers() : (this.link.numPeers || 0);
        } catch { return 0; }
      },
      getTempo() {
        try {
          return isKtamas ? this.link.getTempo() : this.link.bpm;
        } catch { return initialBpm; }
      },
      setTempo(bpm: number) {
        try {
          if (isKtamas) this.link.setTempo(bpm);
          else this.link.bpm = bpm;
        } catch (e) {}
      },
      isPlayingState() {
        try {
          return isKtamas ? this.link.isPlaying() : false;
        } catch { return false; }
      },
      play() {
        try { if (isKtamas) this.link.play(); } catch (e) {}
      },
      stop() {
        try { if (isKtamas) this.link.stop(); } catch (e) {}
      }
    };

    logToFile("✓ Native Ableton Link UDP Multicast engine successfully initialized in server!");
    return adapter;
  } catch (err: any) {
    logToFile(`Note on native Link init: ${err?.message || err}`);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: path.resolve(process.cwd(), "web"),
      server: { middlewareMode: true },
      appType: "spa",
      configFile: path.resolve(process.cwd(), "vite.config.ts"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    logToFile(`Server running on http://localhost:${PORT}`);
  });

  // Shared state for the session
  let sessionState = {
    bpm: 120,
    startTime: Date.now(),
    isPlaying: false,
    lastUpdatedBy: null as string | null
  };

  // Initialize Native Ableton Link
  nativeLinkAdapter = initNativeAbletonLink(sessionState.bpm);

  // Pulse Link WebSocket Server - handle upgrades manually to filter by path and avoid interfering with Vite HMR
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      logToFile(`Upgrade request received for URL: ${request.url} | host: ${request.headers.host} | path: ${url.pathname}`);
      
      if (url.pathname === "/ws") {
        logToFile("Handling upgrade for /ws");
        wss.handleUpgrade(request, socket, head, (ws) => {
          logToFile("WebSocket upgrade successful, emitting connection");
          wss.emit("connection", ws, request);
        });
      } else {
        logToFile(`Bypassing upgrade for path: ${url.pathname}`);
      }
    } catch (err: any) {
      logToFile(`Error during upgrade handling: ${err?.message || err}`);
    }
  });

  interface NodeInfo {
    id: string;
    type: string;
    name: string;
    latency: number;
    peers: number;
  }
  const connectedNodes = new Map<string, NodeInfo>();

  if (nativeLinkAdapter) {
    connectedNodes.set("native-ableton-link", {
      id: "native-ableton-link",
      type: "Ableton Link",
      name: "Native Ableton Link (Local LAN)",
      latency: 0,
      peers: nativeLinkAdapter.getNumPeers()
    });
  }

  // Broadcast helper functions
  const broadcastPeerCount = () => {
    const totalClients = wss.clients.size;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "PEER_COUNT", count: totalClients - 1 }));
      }
    });
  };

  const broadcastNodeList = () => {
    const nodes = Array.from(connectedNodes.values());
    const msg = JSON.stringify({ type: "NODE_LIST", nodes });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  // High-Resolution 25ms Native Ableton Link Sync Polling Loop
  let prevLinkPeers = -1;
  let prevLinkTempo = 120;
  let prevLinkPlayState = false;
  let isUpdatingFromClient = false;

  setInterval(() => {
    if (!nativeLinkAdapter) return;

    const peers = nativeLinkAdapter.getNumPeers();
    const tempo = nativeLinkAdapter.getTempo();
    const playState = nativeLinkAdapter.isPlayingState();

    if (peers !== prevLinkPeers) {
      prevLinkPeers = peers;
      logToFile(`[Native Link] LAN active peers: ${peers}`);
      const linkNode = connectedNodes.get("native-ableton-link");
      if (linkNode) {
        linkNode.peers = peers;
        broadcastNodeList();
      }
    }

    if (!isUpdatingFromClient) {
      let stateChanged = false;

      if (typeof tempo === "number" && !isNaN(tempo) && Math.abs(tempo - sessionState.bpm) > 0.05) {
        sessionState.bpm = Math.round(tempo * 10) / 10;
        stateChanged = true;
        logToFile(`[Native Link] Synced tempo from LAN/DAW: ${sessionState.bpm} BPM`);
      }

      if (playState !== sessionState.isPlaying) {
        sessionState.isPlaying = playState;
        stateChanged = true;
        logToFile(`[Native Link] Synced play state from LAN/DAW: ${playState ? "PLAYING" : "STOPPED"}`);
      }

      if (stateChanged) {
        sessionState.startTime = Date.now();
        const updateMsg = JSON.stringify({ type: "SYNC_STATE", state: sessionState });
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(updateMsg);
          }
        });
      }
    }
  }, 25);

  wss.on("connection", (ws) => {
    const clientId = Math.random().toString(36).substring(7);
    logToFile(`Pulse Link: Client ${clientId} connected`);

    // Add to connected nodes
    connectedNodes.set(clientId, {
      id: clientId,
      type: "Web Client",
      name: `Web Player (${clientId})`,
      latency: 0,
      peers: 0
    });

    broadcastPeerCount();
    broadcastNodeList();
    
    // Send initial state and client ID
    ws.send(JSON.stringify({ type: "WELCOME", clientId }));
    ws.send(JSON.stringify({ type: "SYNC_STATE", state: sessionState }));

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "PING") {
          ws.send(JSON.stringify({
            type: "PONG",
            clientTime: message.clientTime,
            serverTime: Date.now()
          }));
          return;
        }

        if (message.type === "REGISTER") {
          const node = connectedNodes.get(clientId);
          if (node) {
            node.type = message.clientType || node.type;
            node.name = message.name || node.name;
            connectedNodes.set(clientId, node);
            broadcastNodeList();
          }
          return;
        }

        if (message.type === "UPDATE_LATENCY") {
          const node = connectedNodes.get(clientId);
          if (node) {
            node.latency = message.latency;
            connectedNodes.set(clientId, node);
            broadcastNodeList();
          }
          return;
        }

        if (message.type === "UPDATE_PEERS") {
          const node = connectedNodes.get(clientId);
          if (node) {
            node.peers = message.numPeers;
            connectedNodes.set(clientId, node);
            broadcastNodeList();
          }
          return;
        }

        if (message.type === "UPDATE_STATE") {
          isUpdatingFromClient = true;
          logToFile(`Received UPDATE_STATE from client ${clientId}: ${JSON.stringify(message.state)}`);
          
          sessionState = { 
            ...sessionState, 
            ...message.state,
            lastUpdatedBy: clientId
          };

          // Apply state directly to local Native Ableton Link
          if (nativeLinkAdapter) {
            if (typeof sessionState.bpm === "number") {
              nativeLinkAdapter.setTempo(sessionState.bpm);
            }
            if (typeof sessionState.isPlaying === "boolean") {
              if (sessionState.isPlaying) nativeLinkAdapter.play();
              else nativeLinkAdapter.stop();
            }
          }
          
          // Broadcast the update to EVERYONE
          const updateMsg = JSON.stringify({ type: "SYNC_STATE", state: sessionState });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(updateMsg);
            }
          });

          setTimeout(() => { isUpdatingFromClient = false; }, 60);
        }
        
        if (message.type === "BEAT") {
          // Relay beat trigger for visual sync
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "BEAT", beat: message.beat, time: message.time }));
            }
          });
        }
      } catch (e: any) {
        logToFile(`Pulse Link: Error processing message from ${clientId}: ${e?.message || e}`);
      }
    });

    ws.on("close", () => {
      logToFile(`Pulse Link: Client ${clientId} disconnected`);
      connectedNodes.delete(clientId);
      broadcastPeerCount();
      broadcastNodeList();
    });

    ws.on("error", (err: any) => {
      logToFile(`Pulse Link: Client ${clientId} socket error: ${err?.message || err}`);
    });
  });
}

startServer();

