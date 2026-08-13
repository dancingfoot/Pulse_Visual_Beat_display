/**
 * Pulse Link Bridge — Standalone Electron Main Process
 * 
 * Packages the native Ableton Link UDP multicast engine into a lightweight
 * standalone desktop AppImage with real-time HUD and WebSocket relaying.
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const WebSocket = require('ws');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let ws = null;
let serverUrl = process.env.WS_SERVER_URL || 'ws://localhost:3000/ws';
let isConnected = false;
let reconnectTimeout = null;

// Native Ableton Link Loader
let AbletonLink;
let isKtamasBinding = false;

try {
  AbletonLink = require('abletonlink');
  isKtamasBinding = false;
  console.log('[Bridge] Loaded abletonlink (2bbb) native bindings.');
} catch (err) {
  try {
    AbletonLink = require('@ktamas77/abletonlink');
    isKtamasBinding = true;
    console.log('[Bridge] Loaded @ktamas77/abletonlink native bindings.');
  } catch (err2) {
    console.warn('[Bridge] Native abletonlink not installed in dev environment. Falling back to internal mock engine for testing.');
  }
}

// Unified Link Adapter
class AbletonLinkAdapter {
  constructor(bpm = 120) {
    this.bpm = bpm;
    this.peers = 0;
    this.isPlaying = false;
    this.link = null;

    if (AbletonLink) {
      try {
        if (isKtamasBinding) {
          this.link = new AbletonLink(bpm);
        } else {
          this.link = new AbletonLink();
          this.link.bpm = bpm;
        }
        this.enable(true);
        this.enableStartStopSync(true);
      } catch (e) {
        console.error('[Bridge] Failed to init native Link:', e);
      }
    }
  }

  enable(val) {
    if (!this.link) return;
    try {
      if (isKtamasBinding) this.link.enable(val);
      else this.link.isLinkEnable = val;
    } catch (e) {}
  }

  enableStartStopSync(val) {
    if (!this.link) return;
    try {
      if (isKtamasBinding) this.link.enableStartStopSync(val);
      else this.link.isPlayStateSync = val;
    } catch (e) {}
  }

  getNumPeers() {
    if (!this.link) return 0;
    try {
      if (isKtamasBinding) return this.link.getNumPeers();
      return this.link.numPeers || 0;
    } catch (e) { return 0; }
  }

  getTempo() {
    if (!this.link) return this.bpm;
    try {
      if (isKtamasBinding) return this.link.getTempo();
      return this.link.bpm;
    } catch (e) { return this.bpm; }
  }

  setTempo(bpm) {
    this.bpm = bpm;
    if (!this.link) return;
    try {
      if (isKtamasBinding) this.link.setTempo(bpm);
      else this.link.bpm = bpm;
    } catch (e) {}
  }

  isPlayingState() {
    if (!this.link) return this.isPlaying;
    try {
      if (isKtamasBinding) return this.link.isPlaying();
      return !!this.isPlaying;
    } catch (e) { return false; }
  }

  play() {
    this.isPlaying = true;
    if (!this.link) return;
    try {
      if (isKtamasBinding) this.link.play();
    } catch (e) {}
  }

  stop() {
    this.isPlaying = false;
    if (!this.link) return;
    try {
      if (isKtamasBinding) this.link.stop();
    } catch (e) {}
  }
}

const link = new AbletonLinkAdapter(120);

// Global App State
let globalBpm = 120;
let globalIsPlaying = false;
let prevPeers = -1;
let prevTempo = 120;
let prevPlayState = false;
let isUpdatingFromWS = false;

function sendLog(msg, type = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', msg, type);
  }
}

function updateWsStatus(connected) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ws-status', { connected, url: serverUrl });
  }
  updateTrayMenu();
}

function connectWebSocket() {
  if (ws) {
    try { ws.terminate(); } catch (e) {}
  }

  sendLog(`Connecting to WebSocket: ${serverUrl}...`);
  updateWsStatus(false);

  try {
    ws = new WebSocket(serverUrl);
  } catch (err) {
    sendLog(`WebSocket connection error: ${err.message}`, 'error');
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    isConnected = true;
    sendLog(`Connected to Pulse Link Server at ${serverUrl}!`, 'success');
    updateWsStatus(true);

    // Register node identity
    ws.send(JSON.stringify({
      type: 'REGISTER',
      clientType: 'Link Bridge',
      name: 'Pulse Link Desktop Bridge (AppImage)'
    }));

    ws.send(JSON.stringify({
      type: 'UPDATE_PEERS',
      numPeers: link.getNumPeers()
    }));

    // Send initial link state
    syncToWebSocket();
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleWsMessage(message);
    } catch (e) {
      console.error('Failed to parse WS msg:', e);
    }
  });

  ws.on('close', () => {
    if (isConnected) {
      sendLog('Disconnected from WebSocket server. Reconnecting...', 'warn');
    }
    isConnected = false;
    updateWsStatus(false);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    sendLog(`Socket error: ${err.message}`, 'error');
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    connectWebSocket();
  }, 3000);
}

function syncToWebSocket() {
  if (!isConnected || ws.readyState !== WebSocket.OPEN) return;
  const currentBpm = link.getTempo();
  const currentPlaying = link.isPlayingState();

  ws.send(JSON.stringify({
    type: 'UPDATE_STATE',
    state: {
      bpm: currentBpm,
      isPlaying: currentPlaying,
      timeSignature: '4/4',
      subdivision: 1,
      source: 'ableton-link-bridge'
    }
  }));
}

function handleWsMessage(message) {
  if (message.type === 'PING') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'PONG',
        clientTime: message.clientTime,
        serverTime: Date.now()
      }));
    }
    return;
  }

  if (message.type === 'WELCOME' || message.type === 'SYNC_STATE' || message.type === 'UPDATE_STATE') {
    const state = message.state || message;
    if (!state) return;

    isUpdatingFromWS = true;

    if (typeof state.bpm === 'number' && Math.abs(state.bpm - globalBpm) > 0.05) {
      globalBpm = state.bpm;
      link.setTempo(globalBpm);
      sendLog(`Synced BPM from Web: ${globalBpm.toFixed(1)}`);
    }

    if (typeof state.isPlaying === 'boolean' && state.isPlaying !== globalIsPlaying) {
      globalIsPlaying = state.isPlaying;
      if (globalIsPlaying) link.play();
      else link.stop();
      sendLog(`Synced Play State from Web: ${globalIsPlaying ? 'PLAYING' : 'STOPPED'}`);
    }

    setTimeout(() => { isUpdatingFromWS = false; }, 60);
  }
}

// 20ms High-Resolution Polling Loop
let virtualPhase = 0;
setInterval(() => {
  const peers = link.getNumPeers();
  const currentTempo = link.getTempo();
  const currentPlayState = link.isPlayingState();

  // Advance virtual phase for display HUD
  const beatsPerSecond = currentTempo / 60;
  virtualPhase = (virtualPhase + beatsPerSecond * 0.02) % 4;

  // Send UI telemetry to HUD
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('link-metrics', {
      peers,
      bpm: currentTempo,
      isPlaying: currentPlayState,
      phase: virtualPhase
    });
  }

  if (peers !== prevPeers) {
    sendLog(`Link Network Peers changed: ${peers}`, peers > 0 ? 'success' : 'warn');
    prevPeers = peers;
    updateTrayMenu();
    if (isConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'UPDATE_PEERS',
        numPeers: peers
      }));
    }
  }

  if (!isUpdatingFromWS) {
    if (Math.abs(currentTempo - prevTempo) > 0.05 || currentPlayState !== prevPlayState) {
      prevTempo = currentTempo;
      prevPlayState = currentPlayState;
      globalBpm = currentTempo;
      globalIsPlaying = currentPlayState;
      updateTrayMenu();
      syncToWebSocket();
    }
  }
}, 20);

// IPC Handlers from HUD
ipcMain.on('change-server-url', (event, newUrl) => {
  serverUrl = newUrl;
  connectWebSocket();
});

ipcMain.on('toggle-link', (event, enable) => {
  link.enable(enable);
  sendLog(`Ableton Link ${enable ? 'Enabled' : 'Disabled'}`);
});

ipcMain.on('toggle-startstop', (event, enable) => {
  link.enableStartStopSync(enable);
  sendLog(`Start/Stop Sync ${enable ? 'Enabled' : 'Disabled'}`);
});

// System Tray Support
function createTrayIcon() {
  // 16x16 PNG with a red/orange pulse circle for the system tray
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAY0lEQVQ4T2NkoBAwUqifYdQAIgb8/8/AwMDBwcHAyMj4n5GRkYGbgeE/AwMDw39GRsa/jIyM/4k1gIuRkfE/AwMDwwcmJqb/jIyM/4k1AAQGQWw6GkAYDZjhGB4GDGEGsDExMDAAABg5EQG0Z0X3AAAAAElFTkSuQmCC';
  const imgBuffer = Buffer.from(iconBase64, 'base64');
  return nativeImage.createFromBuffer(imgBuffer);
}

function updateTrayMenu() {
  if (!tray) return;

  const peers = link.getNumPeers();
  const tempo = link.getTempo();
  const isPlaying = link.isPlayingState();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Pulse Link Bridge — ${isConnected ? '🟢 Connected' : '🔴 Offline'}`,
      enabled: false
    },
    {
      label: `Peers: ${peers} | Tempo: ${tempo.toFixed(1)} BPM`,
      enabled: false
    },
    {
      label: `State: ${isPlaying ? '▶ Playing' : '⏹ Stopped'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide HUD Window' : 'Show HUD Window',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
        updateTrayMenu();
      }
    },
    {
      label: isPlaying ? '⏹ Stop' : '▶ Play',
      click: () => {
        if (isPlaying) link.stop();
        else link.play();
        syncToWebSocket();
      }
    },
    {
      label: '🔄 Reconnect WebSocket',
      click: () => {
        connectWebSocket();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Pulse Link Bridge',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Pulse Link Bridge: ${tempo.toFixed(1)} BPM (${peers} peers)`);
}

function createTray() {
  try {
    const icon = createTrayIcon();
    tray = new Tray(icon);
    updateTrayMenu();

    tray.on('click', () => {
      if (!mainWindow) {
        createWindow();
      } else if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      updateTrayMenu();
    });
  } catch (err) {
    console.error('[Tray] Could not create system tray:', err);
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 480,
    height: 520,
    minWidth: 420,
    minHeight: 460,
    backgroundColor: '#0b0d11',
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Pulse Link — Ableton Link Bridge'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    connectWebSocket();
  });

  // Hide to tray on close instead of exiting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      sendLog('Minimized to system tray. Click the tray icon to restore.');
      updateTrayMenu();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep alive in the system tray even if window is closed!
});
