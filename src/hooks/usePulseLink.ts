import { useState, useEffect, useCallback, useRef } from 'react';

export function usePulseLink(onSync: (state: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const isEnabledRef = useRef(false);

  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const connect = useCallback(() => {
    if (!isEnabledRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}`);

    socket.onopen = () => {
      setIsConnected(true);
      console.log("Pulse Link: Connected to WebSocket synchronizer");
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === "WELCOME") {
          clientIdRef.current = message.clientId;
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
      console.log("Pulse Link: Disconnected. Reconnecting in 3s...");
      if (isEnabledRef.current) {
        setTimeout(connect, 3000);
      }
    };

    socketRef.current = socket;
  }, []);

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
    toggleLink,
    updateState,
  };
}
