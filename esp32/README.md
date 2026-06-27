# 🔌 Pulse Beat Sync — ESP32 Wi-Fi Client

This directory contains a complete **C++ Arduino Sketch** designed to compile and run on **ESP32 Microcontrollers**.

It connects to the central server over Wi-Fi, implements the exact same high-precision NTP/SNTP timeline synchronization, and blinks the ESP32 board's built-in LED (or triggers custom relay/transistor boards) exactly on the beat.

---

## ✨ Features

- **Wireless Hardware Integration**: Drive high-intensity lights, stage strobe lights, solenoids, or drum triggers wirelessly on your stage or home studio!
- **NTP Time Synchronization**: Handles low-latency ping-pongs over Wi-Fi to calculate the millisecond offset between the microchip's hardware oscillator (`millis()`) and the server's master system timeline.
- **Non-Blocking Visual Triggers**: Flash durations are scheduled on separate timestamp checks, keeping the chip completely open to receive and parse incoming network packets without timing hiccups.
- **Auto-reconnection Loop**: Seamlessly attempts to reconnect to Wi-Fi and the central WebSocket server if power drops or routers reboot.

---

## 🛠️ Requirements & Library Setup

### 1. Arduino IDE
Download and install the [Arduino IDE](https://www.arduino.cc/en/software) (Version 2.0 or higher is recommended).

### 2. Configure ESP32 Board Manager
1. Open Arduino IDE and go to **File** > **Preferences**.
2. Paste the following URL into the **Additional Boards Manager URLs** field:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Go to **Tools** > **Board** > **Boards Manager...**, search for `esp32` by Espressif Systems, and click **Install**.

### 3. Install Required Libraries
Open the **Library Manager** (Ctrl+Shift+I or CMD+Shift+I) and search/install the following libraries:

1. **`WebSockets`** *(by Markus Sattler)* — Essential for managing the socket handshakes.
2. **`ArduinoJson`** *(by Benoit Blanchon)* — For parsing JSON frames.

---

## ⚙️ Board Configuration & Flashing

1. Open `pulse_beat_sync_esp32.ino` in your Arduino IDE.
2. Locate the **CONFIGURATIONS** section at the top of the file:
   ```cpp
   const char* ssid     = "YOUR_WIFI_SSID";         // Change to your home Wi-Fi SSID
   const char* password = "YOUR_WIFI_PASSWORD";     // Change to your Wi-Fi Password
   const char* host     = "192.168.1.50";           // Local IP address of your PC running the central server
   const uint16_t port  = 3000;                     // Central Pulse server port (default 3000)
   ```
3. Modify the values to match your wireless network credentials and host PC's local network IP.
4. Connect your ESP32 board to your PC via a Micro-USB / USB-C cable.
5. In the top dropdown of Arduino IDE, select your connected board (e.g., **ESP32 Dev Module**) and the active **COM/Serial Port**.
6. Click the **Upload** arrow button in the top left corner.

---

## 🔬 Monitoring & Hardware Wiring

Once flashing is complete:
1. Open the **Serial Monitor** in Arduino IDE (**Tools** > **Serial Monitor**) and set the baud rate to `115200`.
2. Watch the logs to confirm successful Wi-Fi connection and socket alignment:
   ```
   Connecting to Wi-Fi SSID: MyStudioWi-Fi
   .....
   ✓ Connected! IP Address: 192.168.1.92
   Connecting to Pulse Central Server at 192.168.1.50:3000
   [WS] Connected successfully!
   [WS] Welcome received. Synchronizing timeline...
   [Sync] RTT: 8 ms | Clock Offset: 172023948s
   [State] Synced -> Tempo: 128 BPM | Playing: YES
   ```
3. The built-in blue LED on the ESP32 (GPIO 2) will start flashing on every beat.
   - Downbeat / Accent Beat: Long, bright pulse (120ms).
   - Standard Beats: Short, snappy pulse (50ms).

---

## 💡 Advanced: Driving External Visual Loads

The onboard LED is convenient for testing, but you can drive larger loads (strobe lights, $12\text{V}$ high-intensity LED strips, solid-state relays, lasers) by using a simple N-Channel MOSFET circuit wired to **GPIO Pin 2**.

### Wiring Schematic

```
 ESP32 GPIO Header
 ─────────────────
 GPIO Pin 2 ─────────[ 220 Ohm ]──────── Gate (G)
                                        ┌───────┐
 GND Pin ───────────┬───────────────────┤Source │  MOSFET (e.g., IRLZ44N)
                    │                   └───────┘
                    │                      Drain (D)
                    │                        │
                    │                        ▼ (Negative Leg)
                    │                    ┌───────┐
                    │                    │  LED  │  External High-Power LED
                    │                    └───────┘
                    │                        ▲ (Positive Leg)
                    │                        │
  12V External ─────┴────────────────────────┴───────── 12V DC Adapter
  Ground (GND)                                          Positive Lead
```

- **Safety Note**: Always connect the ground (GND) of your ESP32 board to the ground of your external power supply to complete the circuit loop.
