import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";

// Simple file logger for backend debugging
const logPath = "/tmp/server.log";
fs.writeFileSync(logPath, `--- Server started at ${new Date().toISOString()} ---\n`);

function logToFile(msg: string) {
  const formatted = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logPath, formatted);
  console.log(formatted.trim());
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
  
  // Shared state for the session
  let sessionState = {
    bpm: 120,
    startTime: Date.now(),
    isPlaying: false,
    lastUpdatedBy: null as string | null
  };

  wss.on("connection", (ws) => {
    const clientId = Math.random().toString(36).substring(7);
    logToFile(`Pulse Link: Client ${clientId} connected`);
    
    // Broadcast peer count to all clients
    const broadcastPeerCount = () => {
      const totalClients = wss.clients.size;
      logToFile(`Broadcasting peer count: total active clients = ${totalClients}`);
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
          logToFile(`Received UPDATE_STATE from client ${clientId}: ${JSON.stringify(message.state)}`);
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
      } catch (e: any) {
        logToFile(`Pulse Link: Error processing message from ${clientId}: ${e?.message || e}`);
      }
    });

    ws.on("close", () => {
      logToFile(`Pulse Link: Client ${clientId} disconnected`);
      broadcastPeerCount();
    });

    ws.on("error", (err: any) => {
      logToFile(`Pulse Link: Client ${clientId} socket error: ${err?.message || err}`);
    });
  });
}

startServer();
