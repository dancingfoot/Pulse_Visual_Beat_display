/**
 * Electron Main Controller Script for Pulse Link
 * 
 * This script runs in Electron's Main Process. It is responsible for:
 *   1. Launching the backend Express server on port 3000 (with native Ableton Link UDP sync).
 *   2. Creating a polished desktop window to display the React application.
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;

function startBackend() {
  console.log('Pulse Link Desktop: Starting backend server with native Ableton Link sync...');
  
  const compiledServer = path.join(__dirname, 'dist', 'server.cjs');
  const tsServer = path.join(__dirname, 'server.ts');
  
  // Prefer the bundled server if available for instant, crash-free startup
  const useCompiled = fs.existsSync(compiledServer);
  const serverPath = useCompiled ? compiledServer : tsServer;

  console.log(`Pulse Link Desktop: Launching server from ${serverPath}`);

  if (useCompiled) {
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit'
    });
  } else {
    serverProcess = fork(serverPath, [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'inherit'
    });
  }

  serverProcess.on('error', (err) => {
    console.error('Failed to start backend server:', err);
  });
}

function pollAndLoadURL(window, url, retries = 50, delay = 150) {
  let attempts = 0;

  const tryConnect = () => {
    if (!window || window.isDestroyed()) return;

    const req = http.get(url, (res) => {
      console.log(`Pulse Link Desktop: Backend server is ready! Loading ${url}`);
      window.loadURL(url);
    });

    req.on('error', () => {
      attempts++;
      if (attempts < retries) {
        setTimeout(tryConnect, delay);
      } else {
        console.error(`Pulse Link Desktop: Timed out waiting for ${url}`);
        window.loadURL(url); // Attempt load anyway
      }
    });

    req.setTimeout(500, () => {
      req.destroy();
    });
  };

  tryConnect();
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

  // Poll until the local backend server is ready, then load
  pollAndLoadURL(mainWindow, 'http://localhost:3000');

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
  console.log('Pulse Link Desktop: Shutting down backend...');
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
}

app.whenReady().then(() => {
  startBackend();
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

