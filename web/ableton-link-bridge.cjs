/**
 * Ableton Link to WebSockets Bridge
 * 
 * This script bridges this web application's WebSocket-based sync protocol with
 * the native Ableton Link network (UDP-based multicast). This allows web metronome 
 * clients to sync natively in phase with desktop software such as Bespoke Synth, 
 * Ableton Live, Traktor, Rekordbox, etc., when running the application locally.
 * 
 * Requirements:
 *   1. Node.js installed on your machine.
 *   2. The project downloaded and installed locally (`npm install`).
 *   3. Install the native Ableton Link connector and WebSockets client:
 *      On Linux (Pop!_OS, Ubuntu, Debian, etc.):
 *        npm install abletonlink ws
 *      On macOS / Windows:
 *        npm install @ktamas77/abletonlink ws
 * 
 * Usage:
 *   1. Start your local server:
 *      npm start
 *   2. Run this bridge script:
 *      node ableton-link-bridge.js
 *   3. Open Bespoke Synth or Ableton Live on the same machine/local network and enable Link.
 */

const WebSocket = require('ws');

let AbletonLink;
let isKtamasBinding = false;

try {
  // 1. Try macOS/Windows default package
  AbletonLink = require('@ktamas77/abletonlink');
  isKtamasBinding = true;
  console.log('Using @ktamas77/abletonlink native bindings.');
} catch (err) {
  try {
    // 2. Try clean Linux-compliant package (without conflicting preprocessor defines in binding.gyp)
    AbletonLink = require('abletonlink');
    isKtamasBinding = false;
    console.log('Using abletonlink (2bbb) native bindings (highly recommended for Linux).');
  } catch (err2) {
    console.error('\n❌ ERROR: Native Ableton Link bindings are not installed.');
    console.error('To run this bridge locally, please install the appropriate package for your OS:');
    console.error('  On Linux (Pop!_OS, Ubuntu, Debian, Fedora, etc.):');
    console.error('    npm install abletonlink ws');
    console.error('  On macOS / Windows:');
    console.error('    npm install @ktamas77/abletonlink ws\n');
    process.exit(1);
  }
}

// ------------------------------
// Ableton Link API Adapter (Unified Interface)
// ------------------------------
class AbletonLinkAdapter {
  constructor(bpm = 120) {
    this._playState = false;
    this.isKtamas = isKtamasBinding;

    if (this.isKtamas) {
      this.link = new AbletonLink(bpm);
    } else {
      this.link = new AbletonLink();
      this.link.bpm = bpm;
      
      // Start polling to maintain _playState
      this.link.startUpdate(20, (beat, phase, bpm, playState) => {
        this._playState = !!playState;
      });
    }
  }

  enable(active) {
    try {
      if (this.isKtamas) {
        this.link.enable(active);
      } else {
        this.link.isLinkEnable = active;
      }
    } catch (e) {
      console.warn('Warning: Could not enable Link on native library:', e.message);
    }
  }

  enableStartStopSync(active) {
    try {
      if (this.isKtamas) {
        this.link.enableStartStopSync(active);
      } else {
        this.link.isPlayStateSync = active;
      }
    } catch (e) {
      console.warn('Warning: Could not enable playState sync on native library:', e.message);
    }
  }

  getTempo() {
    try {
      if (this.isKtamas) {
        return this.link.getTempo();
      } else {
        return this.link.bpm;
      }
    } catch (e) {
      return 120.0;
    }
  }

  setTempo(bpm) {
    try {
      if (this.isKtamas) {
        this.link.setTempo(bpm);
      } else {
        this.link.bpm = bpm;
      }
    } catch (e) {
      console.error('Failed to set tempo on native library:', e.message);
    }
  }

  isPlaying() {
    try {
      if (this.isKtamas) {
        return this.link.isPlaying();
      } else {
        // For abletonlink (2bbb), check if property exists, fallback to polled _playState
        if (typeof this.link.isPlaying === 'boolean') {
          return this.link.isPlaying;
        }
        return this._playState;
      }
    } catch (e) {
      return false;
    }
  }

  setIsPlaying(playing) {
    try {
      if (this.isKtamas) {
        this.link.setIsPlaying(playing);
      } else {
        try {
          this.link.isPlaying = playing;
        } catch (e) {
          // If not directly writable, it relies on start/stop state triggers or playState sync
        }
        this._playState = playing;
      }
    } catch (e) {
      console.error('Failed to set play state on native library:', e.message);
    }
  }

  getBeat() {
    try {
      if (this.isKtamas) {
        return this.link.getBeat();
      } else {
        return this.link.beat;
      }
    } catch (e) {
      return 0.0;
    }
  }

  forceBeatAtTime(beat, time, quantum) {
    try {
      if (this.isKtamas) {
        this.link.forceBeatAtTime(beat, time, quantum);
      } else {
        this.link.beat = beat;
      }
    } catch (e) {
      console.error('Failed to force beat on native library:', e.message);
    }
  }

  getNumPeers() {
    try {
      if (this.isKtamas) {
        return this.link.getNumPeers();
      } else {
        return this.link.numPeers || 0;
      }
    } catch (e) {
      return 0;
    }
  }
}

// ------------------------------
// Config
// ------------------------------
const WS_URL = 'ws://localhost:3000/ws';
const RECONNECT_INTERVAL = 3000; // ms

// Initialize Ableton Link via Adapter
const link = new AbletonLinkAdapter(120);
link.enable(true);
link.enableStartStopSync(true);

console.log('✅ Native Ableton Link initialized.');
console.log(`  Current native tempo: ${link.getTempo().toFixed(2)} BPM`);
console.log(`  Current play state: ${link.isPlaying() ? 'Playing' : 'Stopped'}`);

// Local cache to prevent loop feedback
let lastSentBpm = null;
let lastSentIsPlaying = null;
let lastReceivedBpm = null;
let lastReceivedIsPlaying = null;

let ws = null;
let isConnected = false;

function connectWebSocket() {
  console.log(`Connecting to Pulse Link WebSocket server at ${WS_URL}...`);
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    isConnected = true;
    console.log('🔌 Connected to local Pulse Link WebSocket server!');
    
    // Sync current Ableton Link state to the WebSocket server on initial connection
    sendLocalStateToWS();
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'WELCOME') {
        console.log(`Received client ID from server: ${message.clientId}`);
      } else if (message.type === 'SYNC_STATE') {
        handleWSSyncState(message.state);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e.message);
    }
  });

  ws.on('close', () => {
    isConnected = false;
    console.log(`Disconnected from WebSocket server. Reconnecting in ${RECONNECT_INTERVAL / 1000}s...`);
    setTimeout(connectWebSocket, RECONNECT_INTERVAL);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Handle updates coming from the Web Browser client/WebSockets server
function handleWSSyncState(state) {
  if (!state) return;

  const webBpm = Math.round(state.bpm * 100) / 100;
  const webIsPlaying = !!state.isPlaying;

  // Track received state to prevent echo loops
  lastReceivedBpm = webBpm;
  lastReceivedIsPlaying = webIsPlaying;

  let changed = false;

  // 1. Sync BPM
  const currentLinkBpm = Math.round(link.getTempo() * 100) / 100;
  if (Math.abs(currentLinkBpm - webBpm) > 0.05) {
    console.log(`[WS ➡️ LINK] Updating Tempo: ${currentLinkBpm} ➡️ ${webBpm} BPM`);
    link.setTempo(webBpm);
    changed = true;
  }

  // 2. Sync Play State
  const currentLinkIsPlaying = link.isPlaying();
  if (currentLinkIsPlaying !== webIsPlaying) {
    console.log(`[WS ➡️ LINK] Updating Play State: ${currentLinkIsPlaying ? 'Playing' : 'Stopped'} ➡️ ${webIsPlaying ? 'Playing' : 'Stopped'}`);
    link.setIsPlaying(webIsPlaying);
    changed = true;
  }

  // 3. Phase Alignment
  if (webIsPlaying && state.startTime) {
    const now = Date.now();
    const elapsedSec = (now - state.startTime) / 1000;
    const targetBeat = elapsedSec * (webBpm / 60);
    const currentBeat = link.getBeat();

    // If beat drift is more than 0.08 beat, align phase
    if (Math.abs(currentBeat - targetBeat) > 0.08) {
      // Align beat in Ableton Link timeline
      // we request the beat at current time. 
      // Link time is in microseconds, but we can use the library's helpers or just let it adjust phase
      try {
        if (typeof link.requestBeatAtStartPlayingTime === 'function') {
          link.requestBeatAtStartPlayingTime(targetBeat, 4);
        } else {
          // Fallback forcebeat
          const timeMicros = Date.now() * 1000; // rough approximation
          link.forceBeatAtTime(targetBeat, timeMicros, 4);
        }
      } catch (err) {
        // Safe fallback
      }
    }
  }
}

// Send local Ableton Link updates to the WebSockets server
function sendLocalStateToWS() {
  if (!isConnected || ws.readyState !== WebSocket.OPEN) return;

  const currentBpm = Math.round(link.getTempo() * 100) / 100;
  const currentIsPlaying = link.isPlaying();
  const currentBeat = link.getBeat();

  // Prevent sending identical values back to avoid feedback loops
  if (currentBpm === lastReceivedBpm && currentIsPlaying === lastReceivedIsPlaying) {
    return;
  }

  if (currentBpm === lastSentBpm && currentIsPlaying === lastSentIsPlaying) {
    return;
  }

  console.log(`[LINK ➡️ WS] Syncing State: Tempo=${currentBpm} BPM, Playing=${currentIsPlaying}`);

  // Calculate startTime for the web timeline based on the current beat
  const secondsPerBeat = 60 / currentBpm;
  const startTime = Date.now() - (currentBeat * secondsPerBeat * 1000);

  lastSentBpm = currentBpm;
  lastSentIsPlaying = currentIsPlaying;

  ws.send(JSON.stringify({
    type: 'UPDATE_STATE',
    state: {
      bpm: currentBpm,
      isPlaying: currentIsPlaying,
      startTime: Math.round(startTime),
      timeSignature: '4/4'
    }
  }));
}

// Poll local Ableton Link status (every 20ms) to check for user changes in Bespoke Synth/Ableton Live
let prevLinkBpm = Math.round(link.getTempo() * 100) / 100;
let prevLinkIsPlaying = link.isPlaying();
let prevPeers = 0;

setInterval(() => {
  const currentBpm = Math.round(link.getTempo() * 100) / 100;
  const currentIsPlaying = link.isPlaying();
  const peers = link.getNumPeers();

  // Log peer count changes
  if (peers !== prevPeers) {
    console.log(`[LINK] Active Local Link Network Peers: ${peers}`);
    prevPeers = peers;
  }

  // If local Link state changed (due to Bespoke Synth, Ableton Live, etc.), update the WebSockets server
  if (Math.abs(currentBpm - prevLinkBpm) > 0.05 || currentIsPlaying !== prevLinkIsPlaying) {
    prevLinkBpm = currentBpm;
    prevLinkIsPlaying = currentIsPlaying;
    sendLocalStateToWS();
  }
}, 20);

// Periodically print status reports
setInterval(() => {
  const peers = link.getNumPeers();
  const tempo = link.getTempo();
  const beat = link.getBeat();
  console.log(`[Status] Link Peers: ${peers} | Tempo: ${tempo.toFixed(1)} BPM | Beat: ${beat.toFixed(2)} | WS Connected: ${isConnected}`);
}, 10000);

// Connect to WS server
connectWebSocket();
