# 🌐 Pulse Beat Sync — Web App & Ableton Link Bridge

The `/web` directory contains the modern React 18 frontend web client, designed with a dark cyberpunk visual style, responsive animations, and integration with local DAWs and performance gear.

---

## ✨ Features

- **Web Audio API Engine**: High-fidelity, low-latency audio click synthesis using custom oscillator waves. Does not rely on sample loading, preventing lag or glitching.
- **Micro-animations**: Staggered beat indicators and spring-based center visualizers powered by `motion/react`.
- **Clock Sync NTP Module**: Implements high-precision socket synchronization to measure server clock drift.
- **Ableton Link Local Bridge**: Bridges your web metronome timeline into Ableton Link on your local network, enabling seamless tempo sync with **Ableton Live, Serato DJ, Traktor, Pioneer CDJs, Logic Pro, and iOS music apps**.

---

## 🚀 Running the Web App Locally

1. **Install Dependencies**:
   From the project's root folder, install the NPM packages:
   ```bash
   npm install
   ```
2. **Start Server & Web App**:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` on your browser.

---

## 🎛️ Ableton Link Local Bridge Setup

The bridge is a lightweight Node.js script (`ableton-link-bridge.cjs`) that connects as a peer to the local WebSockets server on one side and hooks into the native **Ableton Link C++ loop** on your local network on the other side. 

This enables you to use the web interface (or connected mobile devices) to change tempos on professional DJ decks and DAWs in real-time.

### 1. Prerequisites
You must install the native bindings appropriate for your operating system:

* **On Linux (Ubuntu, Debian, Fedora, Pop!_OS, etc.)**:
  ```bash
  npm install abletonlink ws
  ```
  *(Note: Linux systems should use the clean C++ precompiled `abletonlink` package).*

* **On macOS and Windows**:
  ```bash
  npm install @ktamas77/abletonlink ws
  ```

### 2. Running the Bridge
Start the central server first, then run the bridge locally in a separate terminal:

```bash
node web/ableton-link-bridge.cjs
```

When successful, you will see output confirming connections on both sides:
```
Using abletonlink native bindings (highly recommended for Linux).
Connecting to Pulse Link server at: ws://localhost:3000/ws...
[Ableton Link] Peer count changed: 1
Pulse Link: Connected to WebSocket server.
```

Now, any connected web peer, Android peer, or Python CLI client will stay in perfect alignment with any DAW running Ableton Link on your home network!

---

## 🛠️ Architecture

- `src/App.tsx` — The main single-page cockpit visual interface and controls.
- `src/hooks/useMetronome.ts` — High-precision audio scheduling loop utilizing the browser's `AudioContext.currentTime` timeline (locks ahead of the JS main thread for absolute stability).
- `src/hooks/usePulseLink.ts` — Socket state manager, SNTP ping estimator, and network broadcast broker.
- `src/components/TesterPeer.tsx` — Visual debug tools to simulate additional local peers and network latency.
- `ableton-link-bridge.cjs` — Native Ableton Link C++ to WebSocket state translator.
