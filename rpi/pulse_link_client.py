#!/usr/bin/env python3
"""
Pulse Link Client for Raspberry Pi
==================================
A high-precision, synchronized metronome client for Raspberry Pi.
Syncs beats with other web and Android peers via standard WebSockets.

Features:
  - Automated SNTP clock sync (calculates RTT & clock offset)
  - Ultra-precise high-resolution metronome polling loop
  - Visual terminal ASCII flashing
  - Pre-wired GPIO output for physical LED flashing
  - Robust error-handling and auto-reconnection
"""

import os
import sys
import time
import json
import math
import threading
import socket

# Try importing WebSocket client
try:
    import websocket
except ImportError:
    print("\n❌ Error: 'websocket-client' is not installed.")
    print("Please install it by running:")
    print("  pip install websocket-client\n")
    sys.exit(1)

# Try importing RPi.GPIO (optional, falls back gracefully)
GPIO_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    pass

# Try importing sound playback libraries (optional, fallback to stdout beep)
SOUND_AVAILABLE = False
try:
    # We can use standard simpleaudio or pygame or wave for sound
    import pygame
    pygame.mixer.init(frequency=44100, size=-16, channels=1, buffer=512)
    SOUND_AVAILABLE = True
except Exception:
    pass


# ---------------------------------------------------------
# Configurations
# ---------------------------------------------------------
DEFAULT_SERVER_URL = "ws://localhost:3000"
LED_PIN = 18  # Physical GPIO pin for blinking LED on beat (Broadcom GPIO 18, Pin 12)
BEATS_PER_MEASURE = 4

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    BG_RED = '\033[41m'
    BG_WHITE = '\033[107m'


# ---------------------------------------------------------
# Raspberry Pi GPIO Handler
# ---------------------------------------------------------
class GPIOController:
    def __init__(self, pin=LED_PIN):
        self.pin = pin
        self.enabled = GPIO_AVAILABLE
        if self.enabled:
            try:
                GPIO.setmode(GPIO.BCM)
                GPIO.setup(self.pin, GPIO.OUT)
                GPIO.output(self.pin, GPIO.LOW)
                print(f"📡 GPIO: Enabled on pin BCM {self.pin} (physical pin 12)")
            except Exception as e:
                print(f"⚠️ GPIO warning: Failed to initialize GPIO: {e}")
                self.enabled = False
        else:
            print("📡 GPIO: Simulated mode (RPi.GPIO not installed or not running on a Pi)")

    def flash(self, duration=0.08):
        if self.enabled:
            try:
                GPIO.output(self.pin, GPIO.HIGH)
                time.sleep(duration)
                GPIO.output(self.pin, GPIO.LOW)
            except Exception:
                pass

    def cleanup(self):
        if self.enabled:
            try:
                GPIO.cleanup()
                print("🧹 GPIO: Cleaned up pins.")
            except Exception:
                pass


# ---------------------------------------------------------
# Audio Click Synthesizer
# ---------------------------------------------------------
class AudioSynthesizer:
    def __init__(self):
        self.enabled = SOUND_AVAILABLE
        self.accent_sound = None
        self.normal_sound = None

        if self.enabled:
            try:
                self.synthesize_clicks()
                print("🔊 Sound: Pygame mixer initialized successfully.")
            except Exception as e:
                print(f"⚠️ Sound warning: Could not initialize synthesizer: {e}")
                self.enabled = False
        else:
            print("🔊 Sound: Simulated clicks (terminal bell fallback)")

    def synthesize_clicks(self):
        import numpy as np
        sample_rate = 44100
        duration = 0.08
        num_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, num_samples, False)

        # Downbeat Accent Click (880Hz sine wave with rapid decay)
        accent_freq = 880.0
        accent_wave = np.sin(2 * np.pi * accent_freq * t)
        decay = np.exp(-12 * (t / duration))
        accent_samples = (accent_wave * decay * 32767).astype(np.int16)
        self.accent_sound = pygame.mixer.Sound(buffer=accent_samples.tobytes())

        # Offbeat Normal Click (440Hz sine wave with rapid decay)
        normal_freq = 440.0
        normal_wave = np.sin(2 * np.pi * normal_freq * t)
        normal_samples = (normal_wave * decay * 32767).astype(np.int16)
        self.normal_sound = pygame.mixer.Sound(buffer=normal_samples.tobytes())

    def play(self, is_accent=False):
        if self.enabled:
            try:
                if is_accent:
                    self.accent_sound.play()
                else:
                    self.normal_sound.play()
            except Exception:
                # System bell fallback if playback fails
                print("\a", end="", flush=True)
        else:
            # Native terminal alert bell
            print("\a", end="", flush=True)


# ---------------------------------------------------------
# Pulse Link Client & Metronome Engine
# ---------------------------------------------------------
class PulseLinkClient:
    def __init__(self, server_url=DEFAULT_SERVER_URL):
        self.server_url = server_url
        self.ws = None
        self.client_id = None
        self.is_connected = False
        self.is_running = True

        # Synchronized state
        self.bpm = 120
        self.is_playing = False
        self.start_time_ms = int(time.time() * 1000)
        self.time_signature = "4/4"
        self.beats_per_measure = 4

        # Latency / SNTP state
        self.clock_offset_ms = 0
        self.rtt_history = []  # List of (rtt, offset) tuples

        # Peripherals
        self.gpio = GPIOController()
        self.audio = AudioSynthesizer()

        # Threads
        self.ping_thread = None
        self.metronome_thread = None

    def start(self):
        # Create and start high-resolution metronome thread
        self.metronome_thread = threading.Thread(target=self._metronome_loop, daemon=True)
        self.metronome_thread.start()

        # Connect to websocket
        self._connect()

    def _connect(self):
        print(f"\n🔄 Connecting to Pulse Link server at: {self.server_url} ...")
        
        # Setup WebSocket callbacks
        websocket.enableTrace(False)
        self.ws = websocket.WebSocketApp(
            self.server_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )

        # Run socket connection in a separate thread to keep CLI responsive
        ws_thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        ws_thread.start()

    def _on_open(self, ws):
        self.is_connected = True
        self.rtt_history.clear()
        print(f"{Colors.GREEN}✓ Connected to Synchronizer!{Colors.ENDC}")
        
        # Start Clock Sync Ping thread
        self.ping_thread = threading.Thread(target=self._ping_loop, daemon=True)
        self.ping_thread.start()

    def _on_message(self, ws, message_str):
        try:
            message = json.loads(message_str)
            msg_type = message.get("type")

            if msg_type == "WELCOME":
                self.client_id = message.get("clientId")
                self.print_status()

            elif msg_type == "PONG":
                receive_time_ms = int(time.time() * 1000)
                client_time_ms = message.get("clientTime", 0)
                server_time_ms = message.get("serverTime", 0)

                # Round Trip Time (RTT) and offset calculation
                rtt = receive_time_ms - client_time_ms
                offset = server_time_ms - (client_time_ms + rtt // 2)

                self.rtt_history.append((rtt, offset))
                if len(self.rtt_history) > 10:
                    self.rtt_history.pop(0)

                # Use the offset from the sample with the lowest RTT for optimal accuracy
                best_sample = min(self.rtt_history, key=lambda x: x[0])
                self.clock_offset_ms = best_sample[1]

            elif msg_type == "SYNC_STATE":
                state = message.get("state", {})
                last_updated_by = state.get("lastUpdatedBy")

                # Sync state if changed by someone else
                if last_updated_by != self.client_id:
                    self.bpm = state.get("bpm", 120)
                    self.is_playing = state.get("isPlaying", False)
                    self.start_time_ms = state.get("startTime", int(time.time() * 1000))
                    self.time_signature = state.get("timeSignature", "4/4")
                    
                    try:
                        self.beats_per_measure = int(self.time_signature.split("/")[0])
                    except Exception:
                        self.beats_per_measure = 4

                    self.print_status()

            elif msg_type == "PEER_COUNT":
                count = message.get("count", 0)
                # Just log or store it
                self.print_status(peer_count=count)

        except Exception as e:
            pass

    def _on_error(self, ws, error):
        pass

    def _on_close(self, ws, close_status_code, close_msg):
        self.is_connected = False
        print(f"\n{Colors.FAIL}✖ Connection closed. Retrying in 3s...{Colors.ENDC}")
        time.sleep(3)
        if self.is_running:
            self._connect()

    def _ping_loop(self):
        """Sends periodical pings to estimate SNTP-style clock drift."""
        while self.is_connected and self.is_running:
            try:
                ping_payload = {
                    "type": "PING",
                    "clientTime": int(time.time() * 1000)
                }
                self.ws.send(json.dumps(ping_payload))
            except Exception:
                break
            time.sleep(2.5)

    def _metronome_loop(self):
        """Ultra-accurate high resolution metronome thread"""
        last_scheduled_beat = -1

        while self.is_running:
            if not self.is_playing:
                time.sleep(0.01)
                continue

            try:
                # 1. Fetch current synced parameters
                current_bpm = self.bpm
                start_time = self.start_time_ms
                offset = self.clock_offset_ms
                beats_per_measure = self.beats_per_measure

                seconds_per_beat = 60.0 / current_bpm
                beat_interval_ms = int(seconds_per_beat * 1000)

                # 2. Synchronized absolute system time
                synchronized_now = int(time.time() * 1000) + offset

                # 3. Calculate absolute elapsed beats since start timeline
                elapsed_ms = synchronized_now - start_time
                current_beat_index = elapsed_ms // beat_interval_ms

                # Target click time
                target_beat_time_ms = start_time + (current_beat_index * beat_interval_ms)

                # If this beat is in front of our scheduled index, prepare to fire!
                if current_beat_index > last_scheduled_beat:
                    # Sleep until precise target millisecond
                    time_to_wait = (target_beat_time_ms - (int(time.time() * 1000) + offset)) / 1000.0
                    if time_to_wait > 0:
                        time.sleep(time_to_wait)

                    # Trigger Downbeat or Standard Click
                    beat_in_measure = int(current_beat_index % beats_per_measure)
                    is_accent = (beat_in_measure == 0)

                    # Play Audio sound & Toggle physical GPIO pin on background thread
                    threading.Thread(target=self.audio.play, args=(is_accent,), daemon=True).start()
                    threading.Thread(target=self.gpio.flash, daemon=True).start()

                    # Render terminal flash visualizer
                    self._render_beat_flash(beat_in_measure + 1, is_accent)

                    last_scheduled_beat = current_beat_index
                else:
                    # High resolution spin sleep to avoid CPU lock while staying exact (1 millisecond)
                    time.sleep(0.001)

            except Exception as e:
                time.sleep(0.01)

    def _render_beat_flash(self, beat_num, is_accent):
        """Prints a visual layout flash to the terminal."""
        accent_color = Colors.BG_RED if is_accent else Colors.BG_WHITE
        reset = Colors.ENDC
        
        # Build standard flash dots
        dots = []
        for i in range(1, self.beats_per_measure + 1):
            if i == beat_num:
                dots.append(f"{accent_color} {i} {reset}")
            else:
                dots.append(f" • ")
        
        flash_bar = "".join(dots)
        
        # Carriage return to redraw line cleanly
        sys.stdout.write(f"\r  SYNC BEAT: [ {flash_bar} ]  (Offset: {self.clock_offset_ms}ms)   ")
        sys.stdout.flush()

    def print_status(self, peer_count=None):
        """Displays formatted CLI session details."""
        if peer_count is None:
            peer_count = len(self.rtt_history) # fallback estimate
        
        # Clear screen and draw menu header
        os.system('cls' if os.name == 'nt' else 'clear')
        print("=" * 60)
        print(f" {Colors.BOLD}PULSE // BEAT SYNCHRONIZER - RASPBERRY PI CLIENT{Colors.ENDC} ")
        print("=" * 60)
        print(f"  • Connection URL: {self.server_url}")
        print(f"  • Connection:     {Colors.GREEN if self.is_connected else Colors.FAIL}{'ONLINE' if self.is_connected else 'OFFLINE'}{Colors.ENDC}")
        print(f"  • Active Peers:   {peer_count}")
        print(f"  • Current Tempo:  {Colors.CYAN}{self.bpm} BPM{Colors.ENDC}")
        print(f"  • Time Signature: {self.time_signature}")
        print(f"  • Play State:     {Colors.GREEN if self.is_playing else Colors.FAIL}{'PLAYING' if self.is_playing else 'PAUSED'}{Colors.ENDC}")
        print("-" * 60)
        print(f"  • Sound Output:   {'Pygame Mixers' if self.audio.enabled else 'Stdout Audio Bell'}")
        print(f"  • GPIO Pin:       {'BCM ' + str(LED_PIN) if self.gpio.enabled else 'Disabled (Simulated)'}")
        print("=" * 60)
        print("\n  Running metronome synchronized with network timeline...\n")

    def toggle_play(self, play_state):
        """Pushes state change to the server to change everyone's playback."""
        if not self.is_connected:
            return
        
        server_now = int(time.time() * 1000) + self.clock_offset_ms
        update_payload = {
            "type": "UPDATE_STATE",
            "state": {
                "bpm": self.bpm,
                "isPlaying": play_state,
                "startTime": server_now if play_state else self.start_time_ms,
                "timeSignature": self.time_signature
            }
        }
        try:
            self.ws.send(json.dumps(update_payload))
        except Exception as e:
            print(f"Error toggle play: {e}")

    def change_bpm(self, new_bpm):
        """Pushes new BPM tempo to server."""
        if not self.is_connected:
            return
        
        clamped_bpm = max(20, min(300, new_bpm))
        server_now = int(time.time() * 1000) + self.clock_offset_ms
        
        # Calculate current global beat position to preserve relative phase
        seconds_per_beat = 60.0 / self.bpm
        elapsed_beats = (server_now - self.start_time_ms) / 1000.0 / seconds_per_beat
        new_start_time = server_now - int(elapsed_beats * (60.0 / clamped_bpm) * 1000.0)

        update_payload = {
            "type": "UPDATE_STATE",
            "state": {
                "bpm": clamped_bpm,
                "isPlaying": self.is_playing,
                "startTime": new_start_time,
                "timeSignature": self.time_signature
            }
        }
        try:
            self.ws.send(json.dumps(update_payload))
        except Exception as e:
            print(f"Error updating BPM: {e}")

    def close(self):
        self.is_running = False
        if self.ws:
            self.ws.close()
        self.gpio.cleanup()


# ---------------------------------------------------------
# Main Launcher
# ---------------------------------------------------------
if __name__ == "__main__":
    # Load custom URL if specified in arguments
    url = DEFAULT_SERVER_URL
    if len(sys.argv) > 1:
        url = sys.argv[1]

    client = PulseLinkClient(url)

    try:
        client.start()
        
        # Keep client running in interactive main thread
        print("Press Ctrl+C to terminate the client.")
        while True:
            # Interactive Terminal CLI Menu Options
            cmd = input().strip().lower()
            if cmd == 'q' or cmd == 'exit':
                break
            elif cmd == 'p' or cmd == 'play' or cmd == ' ':
                client.toggle_play(not client.is_playing)
            elif cmd.startswith('bpm '):
                try:
                    target_bpm = int(cmd.split(' ')[1])
                    client.change_bpm(target_bpm)
                except Exception:
                    print("Usage: bpm <number>")
            elif cmd == 'help':
                print("\n⌨️  Keys: [Space/P] - Toggle Play | [bpm <num>] - Change Speed | [q/Exit] - Quit\n")
            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\n\nDisconnecting safely...")
    finally:
        client.close()
        print("Goodbye!")
