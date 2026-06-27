# 🔴 Pulse Beat Sync Ecosystem

Welcome to **Pulse Beat Sync**, an ultra-precise, low-latency, multi-platform synchronized metronome ecosystem. This workspace provides a full-stack real-time clock synchronization server and five dedicated client implementations to run on your web browser, mobile phone, desktop environments, and hardware microcontrollers.

All devices connect to a central server and align their internal metronome clocks using an **NTP/SNTP-style clock-drift estimation algorithm**, enabling sub-millisecond precision.

---

## 🏗️ Ecosystem Architecture

```
                      ┌─────────────────────────────────────────────────────┐
                      │             Pulse Link Central Server               │
                      │          (Express + WS Server - Port 3000)          │
                      └──────────────────────────┬──────────────────────────┘
                                                 │
        ┌───────────────────┬────────────────────┼───────────────────┬───────────────────┐
        ▼                   ▼                    ▼                   ▼                   ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│  Web Client  │     │Android Client│     │  RPi Client  │     │ Linux Client │    │ ESP32 Client │
│ (React + TS) │     │(Kotlin/Comp.)│     │(Python CLI)  │     │ (Python GUI) │    │  (C++ sketch)│
└──────┬───────┘     └──────────────┘     └──────┬───────┘     └──────────────┘    └──────┬───────┘
       │ (WS Local)                              │ (GPIO 18)                              │ (GPIO 2)
┌──────▼──────────────────────────┐       ┌──────▼───────┐                        ┌──────▼───────┐
│ Ableton Link Local Bridge (CJS) │       │ Physical LED │                        │ On-board LED │
│ (Connects to DAWs / DJ Gear)    │       │  / Relay     │                        │  / Relays    │
└─────────────────────────────────┘       └──────────────┘                        └──────────────┘
```

1. **Central Synchronizer Server (`/server.ts`)**: Serves the React web app and hosts the low-latency WebSockets server. It handles sub-millisecond clock sync ping-pongs and broadcasts session state updates (`BPM`, `isPlaying`, `startTime` epoch, `timeSignature`).
2. **Web Client (`/web`)**: A web interface built with React 18, Vite, Tailwind CSS, and `motion`. Employs the Web Audio API for low-latency click synthesis and incorporates an **Ableton Link Local Bridge** to connect directly to Ableton Live, Serato, Traktor, or other hardware on your local network.
3. **Android App (`/android`)**: A native Android app built with Kotlin, Jetpack Compose, and OkHttp. Uses the Android `AudioTrack` API for ultra-low latency PCM audio clicks and triggers synchronized haptic vibration pulses for a tactile metronome.
4. **Raspberry Pi / Python CLI Client (`/rpi`)**: A lightweight Python terminal client designed for Linux/Raspberry Pi. Supports ASCII CLI animations, pygame-synthesized audio, and direct **GPIO physical triggers** to drive high-intensity LEDs, lasers, or mechanical relays synchronized on the beat.
5. **Linux Desktop Client (`/linux`)**: A desktop application built with Python and Tkinter. Provides a clean retro dark visual cockpit interface, Pygame low-latency click playbacks, and micro timing delay adjustments.
6. **ESP32 Wi-Fi Client (`/esp32`)**: A lightweight native C++ Arduino sketch for ESP32 microcontrollers. Syncs over Wi-Fi to blink the on-board blue LED (GPIO 2) or drive external solid-state relays precisely on the beat.

---

## ⚡ Precision Clock Synchronization Protocol

Metronomes running on separate devices are traditionally prone to drifting apart due to network jitter and client CPU clock differences. **Pulse Beat Sync** solves this by estimating the clock difference between each client and the server:

1. **NTP Ping-Pongs**: Every 2.5 seconds, clients send a `PING` containing their current local time (`clientTime`).
2. **Server Pong**: The server immediately responds with a `PONG` containing the client's original timestamp and the server's current high-resolution time (`serverTime`).
3. **Round-Trip Delay (RTT)**: The client receives the pong, records the current time, and calculates the network round-trip delay:
   $$\text{RTT} = \text{ReceiveTime} - \text{ClientTime}$$
4. **Clock Offset Estimation**: Assuming symmetric latency, the client calculates the absolute offset between its clock and the server's clock:
   $$\text{Offset} = \text{ServerTime} - \left(\text{ClientTime} + \frac{\text{RTT}}{2}\right)$$
5. **Moving Window Filter**: The client maintains a sliding window of recent sync pings. It selects the offset associated with the lowest RTT, filtering out network spikes and jitter.
6. **Timeline Alignment**: At any moment, the client can calculate the absolute synchronized server time:
   $$\text{SynchronizedNow} = \text{LocalTime} + \text{Offset}$$
7. **Absolute Quantization**: Because the server defines an absolute start time ($T_{\text{start}}$) in server epoch milliseconds, every device can calculate the current beat index and progress independently without passing sequential beat ticks over the wire:
   $$\text{ElapsedMs} = \text{SynchronizedNow} - T_{\text{start}} - \text{LatencyCompensation}$$
   $$\text{BeatProgress} = \frac{\text{ElapsedMs}}{\text{SecondsPerBeat} \times 1000}$$
   $$\text{BeatIndex} = \lfloor\text{BeatProgress}\rfloor \pmod{\text{BeatsPerMeasure}}$$

---

## 📂 Directories

- `/web` — Web browser metronome frontend & Ableton Link node bridge.
- `/android` — Native Android Kotlin Jetpack Compose app code.
- `/linux` — Python Tkinter-based Visual Desktop App for Linux environments.
- `/rpi` — Python CLI client for Raspberry Pi & custom hardware setups.
- `/esp32` — Arduino C++ WebSocket client for ESP32 boards with on-board LED blinking.
- `/server.ts` — The central Express + WebSocket broker server.

---

## 🚀 Quick Start (Running Server & Web App)

To run the central server and web application on your local machine:

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Run in Development mode**:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to `http://localhost:3000`.

*Refer to the respective subdirectories (`/web`, `/android`, `/linux`, `/rpi`, `/esp32`) for detailed installation, build, and hardware-wiring instructions!*
