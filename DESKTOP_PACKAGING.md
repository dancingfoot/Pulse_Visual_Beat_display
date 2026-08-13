# Pulse Link — Desktop Packaging & AppImage Guide

This guide describes how to package the browser-based **Pulse Link** application and its local native **Ableton Link Bridge** into a single-file desktop application installer (such as a Linux **AppImage**, Windows **EXE**, or macOS **DMG**).

By bundling everything with **Electron**, you can distribute a fully self-contained desktop software package that automatically launches the Express WebSockets server, hosts the interactive browser metronome, and binds to native desktop DAWs (like Ableton Live, Bespoke Synth, Traktor, etc.) on the local network.

---

## 🏗️ Architectural Overview

The desktop wrapper leverages a multi-process architecture to run all backend services entirely offline on the user's local machine:

```
                  +-----------------------------------+
                  |         Electron Shell            |
                  |  (Launches main controller)       |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
+-----------v-----------+                       +-----------v-----------+
|  Express Web Server   |                       |  Ableton Link Bridge  |
|  • Serves React UI    | <--- WebSockets --->  |  • Spawns C++ Native  |
|  • Listens on :3000   |        (/ws)          |    link network port  |
+-----------------------+                       +-----------------------+
```

1. **Main Process (`electron-main.cjs`)**: Spawns two isolated Node.js child processes when started:
   - **Express Web Server** (`server.ts` or `dist/server.cjs`): Powers the local API and serves the production-compiled frontend assets.
   - **Ableton Link WebSocket Bridge** (`ableton-link-bridge.cjs`): Binds local UDP ports to the native Link multicast group and mirrors states to the browser via WebSockets.
2. **Browser Window**: Opens a sleek, frameless hardware-accelerated Chromium view that automatically connects to the server at `http://localhost:3000`.

---

## 📋 Requirements

Before building, ensure your local development machine has:
* **Node.js** (v18 or newer recommended)
* **npm** or **yarn**
* **Native C++ Compilers** (required by Node to compile local C++ bindings):
  * **Linux (Debian/Ubuntu/Pop!_OS)**: `sudo apt install build-essential python3 libasound2-dev`
  * **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  * **Windows**: Visual Studio Build Tools with "Desktop development with C++" workload

---

## ⚡ Step-by-Step Setup

Follow these commands on your **local machine** (after cloning/downloading the workspace files):

### 1. Install Workspace Dependencies
Install standard full-stack packages first:
```bash
npm install
```

### 2. Install Desktop Packaging Toolchain
Add Electron and `electron-builder` as development dependencies:
```bash
npm install --save-dev electron electron-builder @electron/rebuild
```

### 3. Register Desktop Scripts in `package.json`
Add the following commands to your `"scripts"` block in `/package.json`:
```json
"scripts": {
  "dev": "tsx server.ts",
  "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
  "start": "node dist/server.cjs",
  "clean": "rm -rf dist dist-desktop",
  "lint": "tsc --noEmit",
  
  "desktop:dev": "npm run build && electron .",
  "desktop:rebuild": "electron-rebuild",
  "desktop:build": "npm run build && electron-builder"
}
```

*Note: Set `"main": "electron-main.cjs"` at the top level of your `package.json` so Electron knows where to boot.*

---

## 💻 Running the App Locally in Dev Mode

To test the desktop window and bridge live on your machine:
```bash
npm run desktop:dev
```
This command compiles the web app, boots the backend, spawns the Ableton Link connector, and opens the dark-themed **Pulse Link Desktop** interface.

---

## 📦 Creating the Installers (AppImage, DMG, EXE)

We use `electron-builder` with automatic native module rebuilding. It compiles C++ code for your targeted system on the fly.

### 🐧 Build Linux AppImage & Debian package (PC / x86_64)
To compile a single-file `.AppImage` executable and `.deb` for standard 64-bit Linux PCs (Ubuntu, Pop!_OS, Debian, Mint, Fedora, Arch):
```bash
npm run desktop:build:linux
```
The outputs will appear in the `./dist-desktop` directory:
* `PulseLink-0.0.0.AppImage` (Executable portable application)
* `PulseLink_0.0.0_amd64.deb` (Debian/Ubuntu/Mint installer package)

### 🍓 Build for Raspberry Pi (Raspberry Pi OS / ARM64 & ARMv7)
To package an Electron build for **Raspberry Pi 3, 4, 5, or Zero 2W**:

1. On your Raspberry Pi (running 64-bit or 32-bit Raspberry Pi OS):
```bash
# Install system build tools
sudo apt update
sudo apt install -y build-essential python3 libasound2-dev libgtk-3-dev libnss3 libxss1

# Build the ARM package directly on the Pi
npm run desktop:build:rpi
```

2. Output packages will be generated in `./dist-desktop`:
* `PulseLink_0.0.0_arm64.deb` (For 64-bit Raspberry Pi OS)
* `PulseLink-0.0.0-arm64.AppImage` (Self-contained portable AppImage for ARM64)

To install the `.deb` on your Raspberry Pi:
```bash
sudo dpkg -i dist-desktop/PulseLink_0.0.0_arm64.deb
```
Or run the portable AppImage:
```bash
chmod +x dist-desktop/*.AppImage
./dist-desktop/*.AppImage
```

### 🪟 Build Windows Installer (PC)
To build a standalone Windows NSIS installer `.exe`:
```bash
npm run desktop:build:win
```

### 🍏 Build macOS Disk Image (Mac)
To build a macOS `.dmg` file for Apple Silicon or Intel chips:
```bash
npm run desktop:build:mac
```

---

## 🛡️ Compiling Native Ableton Link Bindings

Because Ableton Link utilizes real-time C++ network thread schedulers, the native bindings (`abletonlink` or `@ktamas77/abletonlink`) must be rebuilt for Electron's internal Node.js ABI (application binary interface).

`electron-builder` performs this automatically. However, if you see dependency errors like `Module did not self-register` during manual startup, force a native rebuild using:
```bash
npm run desktop:rebuild
```

---

## 🚀 Distributing the App

The produced **AppImage** acts exactly like **Ghost Arcade**'s desktop application:
1. Double-clicking the **AppImage** boots the server and bridge in the background silently.
2. The UI renders smoothly inside hardware-accelerated Chromium.
3. Users do not need to install Node.js, run manual commands in a terminal, or type network ports!
