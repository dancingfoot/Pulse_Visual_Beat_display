/**
 * Electron Main Controller Script for Pulse Link
 * 
 * This script runs in Electron's Main Process. It is responsible for:
 *   1. Launching the backend Express server on port 3000.
 *   2. Initializing the native Ableton Link WebSocket Bridge.
 *   3. Creating a polished desktop browser window to display the React application.
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;
let bridgeProcess = null;

// Determine if running in development mode
const isDev = !app.isPackaged;

function startBackend() {
  console.log('Pulse Link Desktop: Starting backend server...');
  
  // In a packaged Electron app, we run the compiled JS server, otherwise we run the TS server
  const serverPath = isDev 
    ? path.join(__dirname, 'server.ts') 
    : path.join(__dirname, 'dist', 'server.cjs'); // Compiled production server

  if (isDev) {
    // In development, spawn using tsx to run server.ts
    serverProcess = fork(serverPath, [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, NODE_ENV: 'development' }
    });
  } else {
    // In production, run the compiled CJS file
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, NODE_ENV: 'production' }
    });
  }

  serverProcess.on('message', (msg) => {
    console.log('[Backend Server]:', msg);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start backend server:', err);
  });
}

function startLinkBridge() {
  console.log('Pulse Link Desktop: Starting native Ableton Link bridge...');
  
  const bridgePath = path.join(__dirname, 'ableton-link-bridge.cjs');

  bridgeProcess = fork(bridgePath, [], {
    env: { ...process.env }
  });

  bridgeProcess.on('error', (err) => {
    console.error('Failed to start Ableton Link bridge:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Pulse Link Desktop',
    backgroundColor: '#09090b', // Deep charcoal/black matches UI
    icon: path.join(__dirname, 'web', 'public', 'favicon.ico'), // Desktop app launcher icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  });

  // Hide the default application menu for a sleek minimal layout
  mainWindow.setMenuBarVisibility(false);

  // Wait 1.5s for the local express/vite server to boot, then load the local URL
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1500);

  // Open external links (e.g. documentation, github) in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure background servers are cleaned up when the desktop app is closed
function cleanUp() {
  console.log('Pulse Link Desktop: Shutting down background processes...');
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  if (bridgeProcess) {
    bridgeProcess.kill('SIGINT');
  }
}

app.whenReady().then(() => {
  startBackend();
  startLinkBridge();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cleanUp();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  cleanUp();
});
