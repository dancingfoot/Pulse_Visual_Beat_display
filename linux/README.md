# 🐧 Pulse Beat Sync — Linux Desktop Client

This directory contains the graphical desktop client built using **Python** and **Tkinter**, designed for Linux systems running standard X11 or Wayland desktop environments (Ubuntu, Debian, Fedora, Arch, Pop!_OS, Mint, etc.).

---

## ✨ Features

- **Modern Retro Cyberpunk GUI**: Sleek dark interface showing the current beat, synced BPM, connection details, and visual feedback circles.
- **Low-latency Pygame Clicks**: Synthesizes custom 16-bit PCM sound pulses (high pitch for accent beat, low pitch for offbeats) through Pygame's mixer for stable timing.
- **Micro Latency Controls**: Onboard sliders and micro-adjust buttons (-200ms to +200ms) to sync audio seamlessly with external headphone outputs or speakers.
- **Bi-directional Controls**: Initiate, play, pause, tap, and change tempos locally or broadcast changes across the Wi-Fi network instantly.

---

## 🛠️ Requirements & Installation

Before running the application, make sure Python 3 and Tkinter are installed on your Linux system.

### 1. Install System Dependencies
Depending on your package manager:

* **On Debian/Ubuntu/Pop!_OS/Mint**:
  ```bash
  sudo apt update
  sudo apt install python3-tk python3-pip python3-numpy python3-pygame -y
  ```

* **On Fedora/RedHat**:
  ```bash
  sudo dnf install python3-tkinter python3-pip python3-numpy python3-pygame -y
  ```

* **On Arch Linux**:
  ```bash
  sudo pacman -S tk python-pip python-numpy python-pygame --noconfirm
  ```

### 2. Install WebSocket Client
Install the standard websocket connector library:
```bash
pip3 install websocket-client
```

---

## 🚀 Running the Desktop Client

Start the central server, then launch the Python desktop app:

```bash
python3 linux/pulse_desktop.py
```

### Direct Configuration & Targeting
By default, the client is pre-configured to look for the central server on `ws://localhost:3000/ws`.

* To target a central synchronizer running on another machine on your Wi-Fi network (e.g. `ws://192.168.1.75:3000/ws`), edit the `self.server_url` field inside `linux/pulse_desktop.py`:
  ```python
  self.server_url = "ws://192.168.1.75:3000/ws"
  ```
* Alternatively, toggle the **LINK** button on the UI to initiate connection handshake.
