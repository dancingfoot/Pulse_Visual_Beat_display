# 🎹 Raspberry Pi Ableton Link to MIDI & Visual Beat Bridge

This guide explains how to use your **Raspberry Pi** as a dedicated **Ableton Link to MIDI Converter and Visual Beat Display** (similar to [codenuts42/modular-link](https://github.com/codenuts42/modular-link) and [shaduzlabs/pink-0](https://github.com/shaduzlabs/pink-0)).

---

## ⚡ What this does

1. **Ableton Link ➔ MIDI Clock (24 PPQN)**: Receives tempo and phase from any Ableton Link or Pulse peer on your network and generates real-time standard MIDI Clock (`0xF8`), MIDI Start (`0xFA`), and MIDI Stop (`0xFC`).
2. **MIDI Note Triggers**: Optionally outputs MIDI Note-On pulses (e.g. Note 36 / C1 Kick on Beat 1, Note 38 / D1 Snare on Beats 2, 3, 4) on any MIDI channel to trigger drum machines and sequencers directly.
3. **Hardware USB MIDI & 5-Pin DIN MIDI**: Works with plug-and-play USB MIDI interfaces or the Raspberry Pi's built-in serial UART.
4. **Visual Beat Display**: High-contrast, large graphical beat counter and pulse visualizer for Raspberry Pi HDMI monitors, TVs, or 7" DSI Touchscreens.
5. **Eurorack / Analog Clock (0–5V)**: Also outputs hardware GPIO trigger pulses on **BCM 18** (Clock) and **BCM 24** (Reset).

---

## 🚀 Quick Start on Raspberry Pi

### 1. Install System Packages & MIDI Libraries:
```bash
sudo apt update
sudo apt install -y python3-pip python3-numpy python3-pygame python3-rpi.gpio git libasound2-dev libasound2-plugins
```

### 2. Set up Python Virtual Environment:
```bash
python3 -m venv ~/pulse-env --system-site-packages
source ~/pulse-env/bin/activate
pip install websocket-client mido python-rtmidi pyserial
```

### 3. Run with Auto-Detected USB MIDI:
Plug your USB MIDI interface into any Raspberry Pi USB port, then start:
```bash
python3 rpi/pulse_link_client.py ws://<IP_OF_YOUR_PULSE_SERVER>:3000/ws
```

---

## 🎛️ Command-Line Options & Modes

| Command Flag | Description | Example |
| :--- | :--- | :--- |
| `ws://<IP>:3000/ws` | Pulse Link server URL (use `ws://localhost:3000/ws` if running on the Pi) | `python3 rpi/pulse_link_client.py ws://192.168.1.50:3000/ws` |
| `--gui` | Opens a graphical visualizer window (ideal for HDMI screens) | `python3 rpi/pulse_link_client.py --gui` |
| `--fullscreen` | Fullscreen beat visualizer (ideal for kiosk/touchscreen displays) | `python3 rpi/pulse_link_client.py --fullscreen` |
| `--midi-port <name>` | Target a specific MIDI interface (e.g., "UM-ONE", "MIDI 1x1") | `python3 rpi/pulse_link_client.py --midi-port "UM-ONE"` |
| `--midi-notes` | Sends MIDI Note-On drum triggers on each beat | `python3 rpi/pulse_link_client.py --midi-notes --midi-channel 10` |
| `--uart` | Outputs 5-pin DIN MIDI on `/dev/serial0` (GPIO 14 TXD @ 31250 baud) | `python3 rpi/pulse_link_client.py --uart` |

---

## 🔌 Hardware Setup: 2 Ways to Connect MIDI

### Option A: USB MIDI Interface (Easiest, Plug & Play)
- Plug any class-compliant USB MIDI interface (e.g., Roland UM-ONE, Midisport, Korg, Behringer, USB audio interface with MIDI DIN, or direct USB-B cable to your synth) into the Raspberry Pi.
- It will be **automatically detected** by `mido` / ALSA.
- Connect the **MIDI OUT** jack of your interface to the **MIDI IN** jack of your synth, drum machine, or sequencer.

---

### Option B: Built-in 5-Pin DIN MIDI Port (via Raspberry Pi GPIO)
You can build a native 5-pin DIN MIDI output using the Raspberry Pi's hardware serial UART (Pin 8 / GPIO 14 TXD):

#### 1. Wiring Schematic (5-Pin DIN MIDI OUT):
```
Raspberry Pi 40-Pin Header                  5-Pin DIN Female Jack
───────────────────────────────────         ──────────────────────
Pin 1 (3.3V)    ───[ 220Ω Resistor ]─────── Pin 4 (Source)
Pin 8 (GPIO 14) ───[ 220Ω Resistor ]─────── Pin 5 (Data / TXD)
Pin 6 (GND)     ─────────────────────────── Pin 2 (Shield / GND)
                                            Pin 1 & 3: Not Connected
```

#### 2. Configure 31,250 MIDI Baud Rate in Raspberry Pi OS:
Edit your Raspberry Pi config file (`/boot/firmware/config.txt` on Bookworm, or `/boot/config.txt` on older OS):
```bash
sudo nano /boot/firmware/config.txt
```
Add the following lines at the bottom:
```ini
# Enable Primary UART for MIDI 31250 Baud Rate
enable_uart=1
dtoverlay=uart0
init_uart_clock=38400000
```
Then disable the Linux serial console so it doesn't send text over the MIDI port:
```bash
sudo raspi-config
# Select: Interface Options -> Serial Port
# Would you like a login shell over serial? -> NO
# Would you like serial hardware enabled? -> YES
```
Reboot your Raspberry Pi:
```bash
sudo reboot
```
Now run with `--uart`:
```bash
python3 rpi/pulse_link_client.py --uart
```

---

## 📺 HDMI / Touchscreen Kiosk Display Mode

If you have a Raspberry Pi connected to an HDMI monitor, stage monitor, or the official 7" Touch Display:

```bash
python3 rpi/pulse_link_client.py ws://localhost:3000/ws --fullscreen
```

- **Space / P**: Toggle Play / Pause (synchronizes all peers and MIDI transport)
- **Up / Down Arrows**: Increase / Decrease BPM
- **F**: Toggle Fullscreen
- **ESC / Q**: Exit
