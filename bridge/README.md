# 🌉 Pulse Link — Standalone Bridge AppImage

This directory provides a **standalone Linux AppImage** and desktop client for the **Ableton Link Bridge**.

It contains everything needed to bridge local native Ableton Link UDP multicast sessions with the web metronome, packaged into a single portable, double-clickable Linux `.AppImage`.

---

## ✨ Features

- **Single Portable File**: Zero install steps — run on Ubuntu, Pop!_OS, Debian, Fedora, Arch, Mint, etc.
- **System Tray Integration**:
  - Runs in the background in your Linux/PC system tray (top bar or taskbar notification area).
  - Hover tooltip displays live BPM and peer count (`Pulse Link Bridge: 120.0 BPM (1 peers)`).
  - Tray Context Menu with quick live status (`🟢 Connected / 🔴 Offline`), Play/Stop toggle, Reconnect trigger, and Hide/Show HUD.
  - Closing the HUD window minimizes seamlessly to the system tray so the Link bridge never drops sync.
- **Hardware Status HUD**:
  - Live Ableton Link Peer Counter & LAN status
  - Real-time BPM and 4-beat Phase progress visualizer
  - WebSocket Server selector (switch between local server and cloud URL with 1-click presets)
  - Ableton Link & Start/Stop Sync toggle buttons
  - Live activity console stream
- **Bidirectional Sync**: Changes in Ableton Live, Bespoke Synth, or Bitwig sync to the web app instantly, and web app tempo/play changes sync back to your DAWs.
- **Headless Mode**: Also includes a lightweight CLI daemon (`npm run cli`) for terminal sessions.

---

## 🛠️ How to Build the AppImage on Linux

### 1. Requirements
Ensure your Linux machine has Node.js and C++ build tools installed:
```bash
# On Ubuntu / Pop!_OS / Debian / Mint:
sudo apt install -y build-essential python3 libasound2-dev

# On Arch Linux:
sudo pacman -S base-devel python

# On Fedora:
sudo dnf install -y gcc-c++ python3
```

---

### 2. Build the AppImage (One Command)
Run the automated builder script:
```bash
chmod +x bridge/build-appimage.sh
./bridge/build-appimage.sh
```

Or step-by-step using npm:
```bash
cd bridge
npm install
npm run build:appimage
```

The resulting executable file will be generated in `bridge/dist-appimage/`:
```
bridge/dist-appimage/Pulse Link Bridge-1.0.0.AppImage
```

---

## 🚀 Running the AppImage

1. Make the AppImage executable:
```bash
chmod +x "dist-appimage/Pulse Link Bridge-1.0.0.AppImage"
```

2. Run it (or double-click it in your file manager):
```bash
./"dist-appimage/Pulse Link Bridge-1.0.0.AppImage"
```

3. Open **Ableton Live**, **Bespoke Synth**, or your favorite Link-enabled DAW on your computer or local network.
4. The bridge HUD will display **`1 active peer`** and sync tempo and phase continuously!

---

## 🌐 Connecting to Remote / Cloud Web Metronomes

If you are using the cloud version of the Pulse Link metronome:
1. Paste your cloud WebSocket URL (e.g. `wss://your-app-url.run.app/ws`) into the **Target WebSocket Server** box.
2. Click **Connect**.
3. Your local desktop DAWs will now sync in real-time with web metronomes anywhere in the world!
