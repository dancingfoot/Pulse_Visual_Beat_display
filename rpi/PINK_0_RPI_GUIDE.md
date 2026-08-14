# 🍓 Raspberry Pi & Pink-0 Eurorack / Modular Clock Sync Guide

This guide explains how to use your Raspberry Pi to synchronize your **Pulse Beat Visualizer** with hardware modular synthesizers, Eurorack gear, drum machines, and Ableton Link peers using principles from the [shaduzlabs/pink-0](https://github.com/shaduzlabs/pink-0) architecture.

---

## 🎯 Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │           Central Pulse Link Server (Local LAN)        │
 │           • Web UI Beat Visualizer & Controller        │
 │           • Native Ableton Link UDP Sync Engine        │
 └───────────────────────▲────────────────────────────────┘
                         │
        WebSocket / UDP Multicast LAN Sync
                         │
 ┌───────────────────────▼────────────────────────────────┐
 │                 Raspberry Pi Client                    │
 │                                                        │
 │  1. Python High-Precision Client (pulse_link_client.py)│
 │     • Sub-millisecond timing offset compensation       │
 │     • GPIO Pin 18 (BCM) Clock Trigger Output           │
 │     • GPIO Pin 24 (BCM) Reset / Downbeat Trigger       │
 │     • Real-time CLI / SSH Visualizer                   │
 │                                                        │
 │  2. Native C++ Ableton Link Engine (pink-0 style)      │
 │     • Direct peer-to-peer Ableton Link UDP discovery   │
 │     • Hardware 0-5V pulse generation for modular gear  │
 └───────────────────────┬────────────────────────────────┘
                         │
                 GPIO / Audio Output
                         ▼
        ┌──────────────────────────────────┐
        │  Eurorack Clock / Reset (0-5V)   │
        │  LED Flasher / Synthesizers      │
        └──────────────────────────────────┘
```

---

## 🚀 Option 1: Pulse Link Python Client (Easiest & Fastest)

The included Python client connects directly to the Pulse server over your local Wi-Fi or Ethernet network.

### 1. On your Raspberry Pi, install prerequisites:
```bash
sudo apt update
sudo apt install -y python3-pip python3-numpy python3-pygame python3-rpi.gpio git
```

### 2. Set up a Python Virtual Environment:
```bash
python3 -m venv ~/pulse-env --system-site-packages
source ~/pulse-env/bin/activate
pip install websocket-client
```

### 3. Clone or copy this repository to your Pi:
```bash
git clone <your-repo-url> ~/Pulse_Visual_Beat_display
cd ~/Pulse_Visual_Beat_display
```

### 4. Run the Client:
```bash
# Connect to your Pulse server running on your computer or Pi
python3 rpi/pulse_link_client.py ws://<IP_OF_YOUR_PULSE_SERVER>:3000/ws
```

*(Replace `<IP_OF_YOUR_PULSE_SERVER>` with your host machine's local IP address, e.g., `192.168.1.50`, or `ws://localhost:3000/ws` if running directly on the Pi).*

---

## ⚡ Option 2: Native C++ Pink-0 (Ableton Link to Eurorack Clock/Reset)

If you have a **Raspberry Pi Zero / 3 / 4 / 5** and want direct hardware 0–5V analog clock and reset outputs for Eurorack or synthesizers using the `shaduzlabs/pink-0` firmware:

### 1. Install Build Dependencies on Raspberry Pi:
```bash
sudo apt update
sudo apt install -y build-essential cmake git libasound2-dev libportaudio2 portaudio19-dev libwiringpi-dev
```

### 2. Clone `pink-0` with Submodules (Ableton Link C++ SDK):
```bash
git clone --recursive https://github.com/shaduzlabs/pink-0.git ~/pink-0
cd ~/pink-0
```

### 3. Build with CMake:
```bash
mkdir build && cd build
cmake ..
make -j$(nproc)
```

### 4. Run the pink-0 daemon:
```bash
sudo ./pink0
```
- It will automatically join your local network's Ableton Link session.
- Pulse and any Link-enabled software (Ableton Live, Bespoke Synth, Bitwig, etc.) will instantly discover it as a peer.

---

## 🔌 Hardware GPIO Wiring Diagram

### 1. Standard Visual LED or Optocoupler Trigger
```
Raspberry Pi Header
─────────────────────────────────────────────
Pin 12 (BCM 18 - Clock Pulse)  ───[ 220Ω Resistor ]───( Anode ) LED
Pin 06 (GND)                   ───────────────────────( Cathode ) LED
```

### 2. Eurorack Modular Synth Clock & Reset Trigger (0–5V Level Shift)
Raspberry Pi GPIO outputs 3.3V. While many modern Eurorack modules recognize 3.3V pulses as clock triggers, for strict 5V standard compliance you can use a simple NPN transistor or 3.3V-to-5V level shifter (e.g., 74HCT14 or 2N3904):

```
       +5V (Pi Pin 2 or 4)
           │
         [1kΩ]
           │
           ├─── Clock Out (0-5V Eurorack Pulse)
           │
  GPIO 18 ─┤ NPN (2N3904)
  (Pin 12) │
          GND (Pi Pin 6)
```

---

## 🎹 Summary Comparison

| Feature | Pulse Python Client (`rpi/pulse_link_client.py`) | Native pink-0 C++ Daemon |
| :--- | :--- | :--- |
| **Setup Complexity** | Zero build time (Python 3) | Requires CMake build & C++ compilers |
| **Network Protocol** | WebSocket + SNTP sub-ms synchronization | Native Ableton Link UDP multicast |
| **Supported Devices** | Any Raspberry Pi (Zero, 1, 2, 3, 4, 5, Compute Modules) | Raspberry Pi Zero / 2 / 3 / 4 / 5 |
| **Outputs** | GPIO pulses, ASCII terminal visualizer, audio click synthesizer | Eurorack Clock + Reset CV signals |
| **Integration** | Syncs seamlessly with the Pulse web visualizer & mobile peers | Syncs with all Ableton Link peers on LAN |
