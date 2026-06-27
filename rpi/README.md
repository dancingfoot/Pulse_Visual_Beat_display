# 🍓 Pulse Beat Sync — Raspberry Pi & Python Client

The `/rpi` directory contains a high-precision Python client designed to run on Linux platforms, specifically the **Raspberry Pi**. It features a color-coded terminal visualizer, optional low-latency audio clicks, and **hardware GPIO triggers** to synchronize physical lights or electrical relays on the beat.

---

## ✨ Features

- **Lightweight & High-Precision**: Leverages high-resolution Python `time.time()` timers in a spinning metronome thread, ensuring timing accuracy without CPU starvation.
- **Color ASCII Visualization**: Prints dynamic terminal flashes utilizing ANSI background blocks. Excellent for headless SSH sessions!
- **GPIO Hardware Triggers**: Triggers standard GPIO output lines to drive physical LEDs, optocouplers, lasers, or electrical switches on the precise millisecond of the beat.
- **Dual-mode Audio**: Synthesizes custom sine waves using `pygame` and `numpy` if available, or falls back to system terminal bells (`\a`) for zero-dependency environments.
- **Auto-reconnection & Recovery**: Seamlessly tries to re-establish connections if the synchronizer server reboots or goes offline.

---

## 🛠️ Requirements & Installation

### 1. Python Environment
Make sure you have Python 3 installed. On Raspberry Pi (Raspbian / Raspberry Pi OS):
```bash
sudo apt update
sudo apt install python3-pip python3-numpy python3-pygame -y
```

### 2. Install Python Dependencies
Install the standard websocket client:
```bash
pip3 install websocket-client
```

---

## 🚀 Running the Client

Start the central server, then run the Python script. By default, it looks for a server running on `localhost`:

```bash
python3 rpi/pulse_link_client.py
```

### Target a Custom IP URL
If your central server is running on a different machine on your local Wi-Fi, pass the WebSocket address as a startup argument:

```bash
python3 rpi/pulse_link_client.py ws://192.168.1.75:3000/ws
```

### Keyboard Shortcuts
While the client is running, you can issue commands directly inside the terminal:
- **`Space` or `P` + `Enter`**: Toggle session playback (starts/stops metronomes on all connected phones and browsers!).
- **`bpm <number>` + `Enter`**: Change the global session speed. Example: `bpm 128`
- **`help` + `Enter`**: Print command help.
- **`q` or `exit` + `Enter`**: Safely close sockets, clean up GPIO pins, and exit.

---

## 🔌 Hardware Setup: Wiring a Physical LED

Using a Raspberry Pi, you can make a physical LED blink on the beat. The script is configured to trigger **BCM Pin 18** (which is **Physical Pin 12** on the Raspberry Pi GPIO Header).

### Wiring Diagram
Connect a standard LED and a $220\Omega$ current-limiting resistor to your Pi's header:

```
Raspberry Pi Header
───────────────────
Physical Pin 12 (BCM 18) ─────[ 220 Ohm Resistor ]─────( Anode / Long leg )
                                                             LED
Physical Pin 06 (GND)    ──────────────────────────────( Cathode / Short leg )
```

- When a beat occurs, the Python script drives Pin 18 `HIGH` ($3.3\text{V}$) for 80 milliseconds (accent beats) or 40 milliseconds (standard beats) and then returns it to `LOW` ($0\text{V}$).
- If you run the script on a standard laptop or PC, the program will automatically catch the missing hardware library warning and continue running in a **simulated CLI-only mode** without crashing!

---

## ⚙️ Customizing Port & Pin Configurations
To change the default GPIO pin, open `pulse_link_client.py` and modify the constant at the top:
```python
LED_PIN = 18  # Set to any BCM pin number on your Raspberry Pi
```
