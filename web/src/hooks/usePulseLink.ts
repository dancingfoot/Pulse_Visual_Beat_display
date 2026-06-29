import { useState, useEffect, useCallback, useRef } from 'react';

interface PulseState {
  bpm: number;
  isPlaying: boolean;
  startTime: number;
  timeSignature: string;
}

export function usePulseLink(onStateUpdate: (state: Partial<PulseState>) => void) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);

  // Use a ref for onStateUpdate to prevent effect re-runs when callback changes
  const onStateUpdateRef = useRef(onStateUpdate);
  useEffect(() => {
    onStateUpdateRef.current = onStateUpdate;
  }, [onStateUpdate]);

  // Connect to the WebSocket server
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the host of the current page for connecting back to the server
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    let reconnectTimeout: NodeJS.Timeout;
    let pingInterval: NodeJS.Timeout;

    function connect() {
      console.log(`Pulse Link: Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('Pulse Link: Connected to WebSocket server');
        
        // Start high-frequency NTP clock sync pings
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'PING',
              clientTime: Date.now()
            }));
          }
        }, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'WELCOME':
              clientIdRef.current = message.clientId;
              break;

            case 'PEER_COUNT':
              setPeerCount(message.count);
              break;

            case 'PONG': {
              const now = Date.now();
              const rtt = now - message.clientTime;
              const offset = message.serverTime - (message.clientTime + now) / 2;
              // Smooth out offset calculation with an exponential moving average
              setClockOffset((prev) => {
                if (prev === 0) return Math.round(offset);
                return Math.round(prev * 0.7 + offset * 0.3);
              });
              break;
            }

            case 'SYNC_STATE':
              if (onStateUpdateRef.current) {
                onStateUpdateRef.current(message.state);
              }
              break;

            case 'BEAT':
              // Forward beat event if needed or trigger animation
              break;
          }
        } catch (e) {
          console.error('Pulse Link: Failed to parse WS message', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setPeerCount(0);
        clearInterval(pingInterval);
        console.log('Pulse Link: Disconnected from WebSocket server. Reconnecting...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('Pulse Link: WebSocket error', err);
      };
    }

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
    };
  }, []);

  const toggleLink = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const updateState = useCallback((state: Partial<PulseState>) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UPDATE_STATE',
        state
      }));
    }
  }, []);

  return {
    isConnected,
    isEnabled,
    peerCount,
    clockOffset,
    toggleLink,
    updateState
  };
}
