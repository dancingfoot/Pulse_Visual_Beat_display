import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
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
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Pulse Link WebSocket Server
  const wss = new WebSocketServer({ server });
  
  // Shared state for the session
  let sessionState = {
    bpm: 120,
    startTime: Date.now(),
    isPlaying: false,
    lastUpdatedBy: null as string | null
  };

  wss.on("connection", (ws) => {
    const clientId = Math.random().toString(36).substring(7);
    console.log(`Pulse Link: Client ${clientId} connected`);
    
    // Broadcast peer count to all clients
    const broadcastPeerCount = () => {
      const totalClients = wss.clients.size;
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          // Send the number of OTHER peers to each client
          client.send(JSON.stringify({ type: "PEER_COUNT", count: totalClients - 1 }));
        }
      });
    };

    broadcastPeerCount();
    
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

        if (message.type === "UPDATE_STATE") {
          // Update global state
          sessionState = { 
            ...sessionState, 
            ...message.state,
            lastUpdatedBy: clientId
          };
          
          // Broadcast the update to EVERYONE (including sender to confirm)
          const updateMsg = JSON.stringify({ type: "SYNC_STATE", state: sessionState });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(updateMsg);
            }
          });
        }
        
        if (message.type === "BEAT") {
          // Relay beat trigger for visual sync
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "BEAT", beat: message.beat, time: message.time }));
            }
          });
        }
      } catch (e) {
        console.error("Pulse Link: Error processing message", e);
      }
    });

    ws.on("close", () => {
      console.log("Pulse Link: Client disconnected");
      broadcastPeerCount();
    });
  });
}

startServer();
