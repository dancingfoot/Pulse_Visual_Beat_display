#!/usr/bin/env node

/**
 * Pulse Link Bridge — Standalone Headless CLI Daemon
 * 
 * Runs without a GUI window, perfect for terminal sessions, systemd services, or lightweight usage.
 */

const WebSocket = require('ws');

const serverUrl = process.env.WS_SERVER_URL || process.argv[2] || 'ws://localhost:3000/ws';

console.log('==============================================');
console.log('⚡ Pulse Link — Ableton Link CLI Bridge');
console.log(`📡 Targeting WebSocket Server: ${serverUrl}`);
console.log('==============================================\n');

let AbletonLink;
let isKtamasBinding = false;

try {
  AbletonLink = require('abletonlink');
  console.log('✓ Loaded abletonlink (2bbb) native bindings.');
} catch (err) {
  try {
    AbletonLink = require('@ktamas77/abletonlink');
    isKtamasBinding = true;
    console.log('✓ Loaded @ktamas77/abletonlink native bindings.');
  } catch (err2) {
    console.error('❌ Native abletonlink bindings not found. Please install: npm install abletonlink');
    process.exit(1);
  }
}

class AbletonLinkAdapter {
  constructor(bpm = 120) {
    this.bpm = bpm;
    if (isKtamasBinding) {
      this.link = new AbletonLink(bpm);
    } else {
      this.link = new AbletonLink();
      this.link.bpm = bpm;
    }
    this.enable(true);
    this.enableStartStopSync(true);
  }
  enable(v) {
    try {
      if (isKtamasBinding) this.link.enable(v);
      else this.link.isLinkEnable = v;
    } catch(e) {}
  }
  enableStartStopSync(v) {
    try {
      if (isKtamasBinding) this.link.enableStartStopSync(v);
      else this.link.isPlayStateSync = v;
    } catch(e) {}
  }
  getNumPeers() {
    try {
      if (isKtamasBinding) return this.link.getNumPeers();
      return this.link.numPeers || 0;
    } catch(e) { return 0; }
  }
  getTempo() {
    try {
      if (isKtamasBinding) return this.link.getTempo();
      return this.link.bpm;
    } catch(e) { return this.bpm; }
  }
  setTempo(b) {
    this.bpm = b;
    try {
      if (isKtamasBinding) this.link.setTempo(b);
      else this.link.bpm = b;
    } catch(e) {}
  }
  isPlayingState() {
    try {
      if (isKtamasBinding) return this.link.isPlaying();
      return false;
    } catch(e) { return false; }
  }
  play() {
    try { if (isKtamasBinding) this.link.play(); } catch(e) {}
  }
  stop() {
    try { if (isKtamasBinding) this.link.stop(); } catch(e) {}
  }
}

const link = new AbletonLinkAdapter(120);

let ws = null;
let isConnected = false;
let globalBpm = 120;
let globalIsPlaying = false;
let prevPeers = -1;
let prevTempo = 120;
let prevPlayState = false;
let isUpdatingFromWS = false;

function connect() {
  console.log(`[WS] Connecting to ${serverUrl}...`);
  ws = new WebSocket(serverUrl);

  ws.on('open', () => {
    isConnected = true;
    console.log(`[WS] ✓ Connected to Pulse Link WebSocket Server!`);
    ws.send(JSON.stringify({
      type: 'REGISTER',
      clientType: 'Link Bridge',
      name: 'Ableton Link CLI Bridge'
    }));
    ws.send(JSON.stringify({
      type: 'UPDATE_PEERS',
      numPeers: link.getNumPeers()
    }));
    syncToWS();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', clientTime: msg.clientTime, serverTime: Date.now() }));
      } else if (msg.type === 'WELCOME' || msg.type === 'SYNC_STATE' || msg.type === 'UPDATE_STATE') {
        const s = msg.state || msg;
        if (!s) return;
        isUpdatingFromWS = true;
        if (typeof s.bpm === 'number' && Math.abs(s.bpm - globalBpm) > 0.05) {
          globalBpm = s.bpm;
          link.setTempo(globalBpm);
          console.log(`[LINK] ← Synced Tempo from Web: ${globalBpm.toFixed(1)} BPM`);
        }
        if (typeof s.isPlaying === 'boolean' && s.isPlaying !== globalIsPlaying) {
          globalIsPlaying = s.isPlaying;
          if (globalIsPlaying) link.play();
          else link.stop();
          console.log(`[LINK] ← Synced Play State from Web: ${globalIsPlaying ? 'PLAY' : 'STOP'}`);
        }
        setTimeout(() => { isUpdatingFromWS = false; }, 60);
      }
    } catch(e) {}
  });

  ws.on('close', () => {
    if (isConnected) console.log('[WS] Disconnected. Reconnecting in 3s...');
    isConnected = false;
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error: ${err.message}`);
  });
}

function syncToWS() {
  if (!isConnected || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'UPDATE_STATE',
    state: {
      bpm: link.getTempo(),
      isPlaying: link.isPlayingState(),
      timeSignature: '4/4',
      subdivision: 1,
      source: 'cli-bridge'
    }
  }));
}

setInterval(() => {
  const peers = link.getNumPeers();
  const tempo = link.getTempo();
  const playState = link.isPlayingState();

  if (peers !== prevPeers) {
    console.log(`[LINK] 👥 Active Local Link Peers: ${peers}`);
    prevPeers = peers;
    if (isConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'UPDATE_PEERS', numPeers: peers }));
    }
  }

  if (!isUpdatingFromWS) {
    if (Math.abs(tempo - prevTempo) > 0.05 || playState !== prevPlayState) {
      prevTempo = tempo;
      prevPlayState = playState;
      globalBpm = tempo;
      globalIsPlaying = playState;
      console.log(`[LINK] → Broadcasting to Web: ${tempo.toFixed(1)} BPM, ${playState ? 'PLAYING' : 'STOPPED'}`);
      syncToWS();
    }
  }
}, 20);

connect();
