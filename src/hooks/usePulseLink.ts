import { useState, useEffect, useCallback, useRef } from 'react';

export function usePulseLink(onSync: (state: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const isEnabledRef = useRef(false);

  // Clock synchronization math variables
  const clockOffsetRef = useRef<number>(0);
  const rttHistoryRef = useRef<{ rtt: number; offset: number }[]>([]);

  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const connect = useCallback(() => {
    if (!isEnabledRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      setIsConnected(true);
      rttHistoryRef.current = []; // Reset history on new connection
      console.log("Pulse Link: Connected to WebSocket synchronizer");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "WELCOME") {
          clientIdRef.current = message.clientId;
        }
        
        if (message.type === "PONG") {
          const receiveTime = Date.now();
          const clientTime = message.clientTime;
          const serverTime = message.serverTime;
          
          const rtt = receiveTime - clientTime;
          // Offset = Server Time - Client Estimate
          const offset = serverTime - (clientTime + rtt / 2);
          
          const history = rttHistoryRef.current;
          history.push({ rtt, offset });
          if (history.length > 10) {
            history.shift();
          }
          
          // Select sample with lowest RTT for maximum symmetry and accuracy (SNTP standard)
          const bestSample = history.reduce((best, current) => {
            return current.rtt < best.rtt ? current : best;
          }, history[0]);
          
          clockOffsetRef.current = bestSample.offset;
          setClockOffset(bestSample.offset);
        }

        if (message.type === "SYNC_STATE") {
          // Trigger sync callback if the update originated from elsewhere
          if (message.state.lastUpdatedBy !== clientIdRef.current) {
            onSyncRef.current(message.state);
          }
        }
        if (message.type === "PEER_COUNT") {
          setPeerCount(message.count);
        }
      } catch (e) {
        console.error("Pulse Link: Error parsing incoming state packet", e);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setPeerCount(0);
      setClockOffset(0);
      clockOffsetRef.current = 0;
      console.log("Pulse Link: Disconnected. Reconnecting in 3s...");
      if (isEnabledRef.current) {
        setTimeout(connect, 3000);
      }
    };

    socketRef.current = socket;
  }, []);

  // Periodic high-resolution SNTP Ping/Pong Loop
  useEffect(() => {
    if (!isConnected) return;

    const sendPing = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: "PING",
          clientTime: Date.now()
        }));
      }
    };

    // Run first ping immediately and then every 2.5 seconds to refine offset
    sendPing();
    const interval = setInterval(sendPing, 2500);
    return () => clearInterval(interval);
  }, [isConnected]);

  const toggleLink = useCallback(() => {
    if (!isEnabled) {
      isEnabledRef.current = true;
      setIsEnabled(true);
      connect();
    } else {
      isEnabledRef.current = false;
      setIsEnabled(false);
      socketRef.current?.close();
    }
  }, [isEnabled, connect]);

  const updateState = useCallback((state: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "UPDATE_STATE", state }));
    }
  }, []);

  useEffect(() => {
    return () => {
      isEnabledRef.current = false;
      socketRef.current?.close();
    };
  }, []);

  return {
    isConnected,
    isEnabled,
    peerCount,
    clockOffset,
    clockOffsetRef,
    toggleLink,
    updateState,
  };
}
