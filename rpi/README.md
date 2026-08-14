# 🍓 Pulse Beat Sync — Raspberry Pi, MIDI & Modular Client

The `/rpi` directory contains a high-precision Python client and bridge for **Raspberry Pi** (and Linux), translating **Ableton Link & Pulse Beat synchronization** into **Hardware MIDI Clock (24 PPQN)**, **USB/DIN MIDI**, **Eurorack Clock/Reset pulses**, and an **HDMI/Touchscreen Visual Beat Display** (inspired by [codenuts42/modular-link](https://github.com/codenuts42/modular-link) and [shaduzlabs/pink-0](https://github.com/shaduzlabs/pink-0)).

---

## ✨ Features

- **Ableton Link to MIDI Clock**: Generates standard 24 PPQN real-time MIDI Clock (`0xF8`), MIDI Start (`0xFA`), and MIDI Stop (`0xFC`) synchronized to network peers.
- **USB MIDI & DIN MIDI Out**: Auto-detects USB MIDI interfaces or outputs directly via Raspberry Pi UART (GPIO 14 TXD at 31250 baud) to standard 5-pin DIN MIDI jacks.
- **MIDI Note Triggers**: Sends configurable MIDI Note-On pulses (e.g. Kick on beat 1, Snare on 2/3/4) to drive drum synths directly.
- **HDMI / Touchscreen GUI Visualizer**: Rich Pygame fullscreen beat counter with glowing pulse rings, tempo display, and tap controls for Raspberry Pi displays.
- **Eurorack / Modular GPIO Pulses**: Triggers **BCM Pin 18** (Clock) and **BCM Pin 24** (Reset / Downbeat).
- **Color ASCII Terminal Visualizer**: Clean ANSI bar visualizer for lightweight or headless SSH sessions.

---

## 📚 Guides & Documentation

- **[MIDI Setup Guide](MIDI_SETUP_GUIDE.md)**: Connecting USB MIDI interfaces, 5-pin DIN hardware circuits, 31250 baud configuration, and synth sync.
- **[Pink-0 & Eurorack Modular Guide](PINK_0_RPI_GUIDE.md)**: Eurorack 0–5V CV clock/reset level shifting and native C++ daemon builds.

---

## 🛠️ Quick Installation

```bash
# 1. System packages
sudo apt update
sudo apt install -y python3-pip python3-numpy python3-pygame python3-rpi.gpio git libasound2-dev

# 2. Virtual environment & MIDI libraries
python3 -m venv ~/pulse-env --system-site-packages
source ~/pulse-env/bin/activate
pip install websocket-client mido python-rtmidi pyserial
```

---

## 🚀 Running the Client

```bash
# Standard CLI with auto-detected USB MIDI
python3 rpi/pulse_link_client.py ws://<PULSE_SERVER_IP>:3000/ws

# With Fullscreen HDMI / Touchscreen GUI:
python3 rpi/pulse_link_client.py ws://<PULSE_SERVER_IP>:3000/ws --fullscreen

# With MIDI Drum Note Triggers:
python3 rpi/pulse_link_client.py ws://<PULSE_SERVER_IP>:3000/ws --midi-notes --midi-channel 10

# With Hardware 5-Pin DIN MIDI UART:
python3 rpi/pulse_link_client.py ws://<PULSE_SERVER_IP>:3000/ws --uart
```

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
