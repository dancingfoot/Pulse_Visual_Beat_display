# 📱 Pulse Beat Sync — Android App

The `/android` directory contains the complete source code for a native Android application built with **Kotlin** and **Jetpack Compose**. It is engineered for high-performance mobile timing sync, tactile haptics, and low-latency audio.

---

## ✨ Features

- **Jetpack Compose UI**: Modern, fluid, dark-mode terminal UI styled with spring physics transitions, glowing pulse rings, and high-contrast downbeat flashes.
- **Ultra-low Latency AudioTrack Engine**: Android's `MediaPlayer` or `SoundPool` APIs suffer from variable 50-100ms startup latency. This app resolves this by using the **`AudioTrack` API**. We synthesize high-fidelity sine wave clicks (880Hz downbeat, 440Hz offbeats) directly into raw 16-bit PCM static buffers inside memory. Playback is triggered on a dedicated high-priority CPU thread with zero file-loading lag.
- **Synchronized Haptics**: Triggers precise physical vibration impulses on the beat (deep sustained rumble for downbeat accents, short tick for standard beats).
- **Latency Compensation (Bluetooth Offset)**: Bluetooth speakers or headphones (A2DP) introduce 100-300ms of lag. The app includes a micro-adjustment slider (-200ms to +200ms) to calibrate wireless audio outputs so physical clicks, visual flashes, and hardware rigs align perfectly.
- **Target IP Configurator**: Input fields to target your server's local IP address (e.g., `ws://192.168.1.50:3000`), allowing untethered performance across your Wi-Fi network.

---

## 🛠️ Requirements & Tooling

- **Android Studio** (Hedgehog or newer recommended)
- **Android SDK 34** (Compile and Target Sdk)
- **JDK 17** (Used by Gradle and Kotlin Compiler)
- **Minimum Android Version**: Android 8.0 (API Level 26)

---

## 🚀 Building & Installing

### Method A: Android Studio (Recommended)
1. Open Android Studio.
2. Select **Open an Existing Project** and navigate to the `/android` directory of this repository.
3. Allow Gradle to sync and fetch remote dependencies (OkHttp, Gson, AndroidX Compose, etc.).
4. Connect an Android phone via USB (with Developer Mode & USB Debugging enabled) or start a Virtual Device Emulator.
5. Click the **Run** (Green Play) button in Android Studio.

### Method B: Gradle Command Line
Ensure you have JDK 17 configured in your environment path, then build from the `/android` folder:

```bash
# On Linux / macOS
./gradlew assembleDebug

# On Windows
gradlew.bat assembleDebug
```
The compiled APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🔌 Connecting to your Server

To sync your mobile phone with other devices on your local Wi-Fi:

1. Determine the local IP address of your host PC running the central server (e.g., run `ipconfig` on Windows or `ip a` on Linux/macOS).
2. Open the **Pulse Beat Sync** app on your phone.
3. Tap the **Settings (Gear icon)** in the top right corner.
4. Locate the **Pulse Link Server IP Address** field.
5. Replace `localhost` or `10.0.2.2` with your PC's local network IP. Example:
   ```
   ws://192.168.1.75:3000/ws
   ```
6. Return to the main screen and tap the **LINK** button. The indicator will turn blue and display `SYNCED (X PEERS)`.

---

## 📁 Source Code Structure

- `app/src/main/AndroidManifest.xml` — Declares required permissions (`INTERNET`, `VIBRATE`) and activity orientation settings.
- `app/src/main/java/com/pulse/visualbeat/MainActivity.kt` — Core Compose UI, spring layouts, slider states, and user interaction handlers.
- `app/src/main/java/com/pulse/visualbeat/audio/MetronomeEngine.kt` — High-priority thread metronome loop, raw PCM click oscillators, and physical haptic vibration controller.
- `app/src/main/java/com/pulse/visualbeat/network/PulseLinkClient.kt` — OkHttp-powered WebSocket engine executing the SNTP sync and latency polling logic.
