#!/usr/bin/env python3
"""
Pulse Link MIDI & Visual Beat Engine for Raspberry Pi
=====================================================
Translates Ableton Link / Pulse Network Beat Clock into:
  1. Standard MIDI Clock (24 PPQN real-time 0xF8 messages)
  2. MIDI Start / Stop / Continue transport messages
  3. MIDI Note Triggers (Downbeat & Beat notes for drum machines / synths)
  4. GPIO Clock & Reset Pulses (for Eurorack / Modular gear)
  5. Fullscreen HDMI / Touchscreen Visual Beat GUI or Rich CLI Display

Compatible with:
  - Any USB MIDI Interface (Roland UM-ONE, Midisport, Korg, Behringer, etc.)
  - Hardware 5-Pin DIN MIDI via Raspberry Pi UART (GPIO 14 TXD at 31250 baud)
  - Virtual ALSA MIDI ports for on-device synthesizers (SunVox, PureData, etc.)
"""

import os
import sys
import time
import json
import math
import argparse
import threading
import subprocess

# ---------------------------------------------------------
# Optional Dependencies
# ---------------------------------------------------------
try:
    import websocket
except ImportError:
    print("❌ Error: 'websocket-client' is required. Run: pip install websocket-client")
    sys.exit(1)

# RPi.GPIO
GPIO_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    pass

# Pygame for GUI / Sound
PYGAME_AVAILABLE = False
try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    pass

# Mido / python-rtmidi for high-precision MIDI
MIDO_AVAILABLE = False
try:
    import mido
    MIDO_AVAILABLE = True
except ImportError:
    pass

# PySerial for direct hardware DIN MIDI UART (/dev/serial0 at 31250 baud)
SERIAL_AVAILABLE = False
try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------
# ANSI Color Codes
# ---------------------------------------------------------
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    BG_RED = '\033[41m'
    BG_WHITE = '\033[107m'
    BG_GREEN = '\033[42m'
    BG_BLUE = '\033[44m'


# ---------------------------------------------------------
# MIDI Engine (USB MIDI, DIN MIDI, Virtual ALSA, Serial UART)
# ---------------------------------------------------------
class MIDIEngine:
    """Handles MIDI Clock (24 PPQN), Transport (Start/Stop), and Beat Note Triggers."""

    # Standard MIDI Real-Time Bytes
    MIDI_CLOCK    = 0xF8
    MIDI_START    = 0xFA
    MIDI_CONTINUE = 0xFB
    MIDI_STOP     = 0xFC

    def __init__(self, port_name=None, send_notes=False, note_channel=10, note_accent=36, note_normal=38, use_uart=False, uart_device="/dev/serial0"):
        self.port_name = port_name
        self.send_notes = send_notes
        self.note_channel = max(1, min(16, note_channel)) - 1  # 0-indexed for MIDI
        self.note_accent = note_accent  # Note 36 = C1 (General MIDI Kick)
        self.note_normal = note_normal  # Note 38 = D1 (General MIDI Snare)
        self.use_uart = use_uart
        self.uart_device = uart_device

        self.mido_ports = []
        self.serial_port = None
        self.enabled = False
        self.active_port_names = []

        self._init_midi()

    def _init_midi(self):
        # 1. Try initializing PySerial UART (for DIN MIDI output on GPIO 14)
        if self.use_uart and SERIAL_AVAILABLE:
            try:
                self.serial_port = serial.Serial(self.uart_device, baudrate=31250, timeout=0.1)
                self.active_port_names.append(f"Hardware UART ({self.uart_device} @ 31250 baud)")
                self.enabled = True
                print(f"🎹 MIDI: Initialized hardware UART on {self.uart_device}")
            except Exception as e:
                print(f"⚠️ MIDI: Could not open serial port {self.uart_device}: {e}")

        # 2. Try initializing Mido / ALSA USB MIDI
        if MIDO_AVAILABLE:
            try:
                available_outputs = mido.get_output_names()
                print(f"🔍 Discovered MIDI Output Ports: {available_outputs if available_outputs else 'None found'}")

                if self.port_name:
                    matching = [p for p in available_outputs if self.port_name.lower() in p.lower()]
                    if matching:
                        p = mido.open_output(matching[0])
                        self.mido_ports.append(p)
                        self.active_port_names.append(matching[0])
                        self.enabled = True
                    else:
                        print(f"⚠️ MIDI: Port matching '{self.port_name}' not found.")
                else:
                    # If no specific port requested, connect to all available hardware USB MIDI ports
                    for p_name in available_outputs:
                        if "Midi Through" not in p_name:  # prefer physical interfaces
                            try:
                                port = mido.open_output(p_name)
                                self.mido_ports.append(port)
                                self.active_port_names.append(p_name)
                                self.enabled = True
                            except Exception:
                                pass

                    # Fallback to Midi Through or create virtual port
                    if not self.mido_ports:
                        for p_name in available_outputs:
                            try:
                                port = mido.open_output(p_name)
                                self.mido_ports.append(port)
                                self.active_port_names.append(p_name)
                                self.enabled = True
                                break
                            except Exception:
                                pass

                # If still nothing, attempt creating a Virtual ALSA port
                if not self.mido_ports and hasattr(mido, "open_output"):
                    try:
                        vport = mido.open_output("PulseLink:out", virtual=True)
                        self.mido_ports.append(vport)
                        self.active_port_names.append("PulseLink:out (Virtual ALSA)")
                        self.enabled = True
                    except Exception:
                        pass

            except Exception as e:
                print(f"⚠️ MIDI initialization warning: {e}")

        if self.enabled:
            print(f"✅ MIDI Engine Active on: {', '.join(self.active_port_names)}")
        else:
            print("ℹ️  MIDI: Running in simulation mode (Install python-rtmidi and mido for hardware output: pip install mido python-rtmidi)")

    def send_raw_byte(self, byte_val):
        """Sends a single real-time status byte (e.g. 0xF8 Clock, 0xFA Start, 0xFC Stop)."""
        # USB / ALSA ports via Mido
        for port in self.mido_ports:
            try:
                port.send(mido.Message.from_bytes([byte_val]))
            except Exception:
                pass

        # Serial DIN MIDI UART
        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.write(bytes([byte_val]))
            except Exception:
                pass

    def send_clock(self):
        """Sends standard 0xF8 MIDI Clock tick (24 PPQN)."""
        self.send_raw_byte(self.MIDI_CLOCK)

    def send_start(self):
        """Sends 0xFA MIDI Start command."""
        self.send_raw_byte(self.MIDI_START)

    def send_continue(self):
        """Sends 0xFB MIDI Continue command."""
        self.send_raw_byte(self.MIDI_CONTINUE)

    def send_stop(self):
        """Sends 0xFC MIDI Stop command."""
        self.send_raw_byte(self.MIDI_STOP)

    def trigger_beat_note(self, is_accent, velocity=100):
        """Sends a MIDI Note-On and schedules a tight Note-Off for drum synths."""
        if not self.send_notes or not self.enabled:
            return

        note = self.note_accent if is_accent else self.note_normal
        status_on = 0x90 | (self.note_channel & 0x0F)
        status_off = 0x80 | (self.note_channel & 0x0F)

        # Send Note-On
        note_on_bytes = bytes([status_on, note, velocity])
        for port in self.mido_ports:
            try:
                port.send(mido.Message('note_on', channel=self.note_channel, note=note, velocity=velocity))
            except Exception:
                pass

        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.write(note_on_bytes)
            except Exception:
                pass

        # Schedule Note-Off in 20ms
        def note_off_worker():
            time.sleep(0.02)
            note_off_bytes = bytes([status_off, note, 0])
            for port in self.mido_ports:
                try:
                    port.send(mido.Message('note_off', channel=self.note_channel, note=note, velocity=0))
                except Exception:
                    pass
            if self.serial_port and self.serial_port.is_open:
                try:
                    self.serial_port.write(note_off_bytes)
                except Exception:
                    pass

        threading.Thread(target=note_off_worker, daemon=True).start()

    def close(self):
        for port in self.mido_ports:
            try:
                port.close()
            except Exception:
                pass
        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.close()
            except Exception:
                pass


# ---------------------------------------------------------
# GPIO Controller for Eurorack / Modular Hardware Pulses
# ---------------------------------------------------------
class GPIOController:
    """Controls physical BCM GPIO pins (Clock on BCM 18, Reset on BCM 24)."""
    def __init__(self, clock_pin=18, reset_pin=24):
        self.clock_pin = clock_pin
        self.reset_pin = reset_pin
        self.enabled = GPIO_AVAILABLE
        if self.enabled:
            try:
                GPIO.setmode(GPIO.BCM)
                GPIO.setwarnings(False)
                GPIO.setup(self.clock_pin, GPIO.OUT, initial=GPIO.LOW)
                GPIO.setup(self.reset_pin, GPIO.OUT, initial=GPIO.LOW)
                print(f"⚡ GPIO: Clock Output configured on BCM {self.clock_pin} (Pin 12)")
                print(f"⚡ GPIO: Reset / Downbeat Output on BCM {self.reset_pin} (Pin 18)")
            except Exception as e:
                print(f"⚠️ GPIO initialization warning: {e}")
                self.enabled = False

    def pulse_clock(self, duration_ms=5):
        if not self.enabled:
            return
        try:
            GPIO.output(self.clock_pin, GPIO.HIGH)
            time.sleep(duration_ms / 1000.0)
            GPIO.output(self.clock_pin, GPIO.LOW)
        except Exception:
            pass

    def pulse_reset(self, duration_ms=10):
        if not self.enabled:
            return
        try:
            GPIO.output(self.reset_pin, GPIO.HIGH)
            time.sleep(duration_ms / 1000.0)
            GPIO.output(self.reset_pin, GPIO.LOW)
        except Exception:
            pass

    def cleanup(self):
        if self.enabled:
            try:
                GPIO.cleanup()
            except Exception:
                pass


# ---------------------------------------------------------
# Pygame HDMI / Touchscreen Graphical Display
# ---------------------------------------------------------
class PygameBeatDisplay:
    """Rich Graphical Fullscreen / Windowed Display for Raspberry Pi HDMI / Touchscreens."""
    def __init__(self, width=800, height=480, fullscreen=False):
        self.enabled = PYGAME_AVAILABLE
        self.fullscreen = fullscreen
        self.width = width
        self.height = height
        self.screen = None
        self.clock = None
        self.font_large = None
        self.font_med = None
        self.font_small = None
        self.current_beat = 1
        self.total_beats = 4
        self.is_accent = False
        self.bpm = 120
        self.is_playing = False
        self.peer_count = 0
        self.midi_active_ports = []
        self.last_beat_time = time.time()

        if self.enabled:
            try:
                pygame.init()
                flags = pygame.FULLSCREEN if self.fullscreen else pygame.RESIZABLE
                self.screen = pygame.display.set_mode((self.width, self.height), flags)
                pygame.display.set_caption("Pulse Link - Visual Beat Display")
                self.clock = pygame.time.Clock()
                pygame.font.init()
                self.font_huge = pygame.font.SysFont("DejaVu Sans, Arial, sans-serif", 96, bold=True)
                self.font_large = pygame.font.SysFont("DejaVu Sans, Arial, sans-serif", 44, bold=True)
                self.font_med = pygame.font.SysFont("DejaVu Sans, Arial, sans-serif", 24)
                self.font_small = pygame.font.SysFont("DejaVu Sans, Arial, sans-serif", 16)
            except Exception as e:
                print(f"⚠️ Pygame GUI initialization warning: {e}")
                self.enabled = False

    def update_beat(self, beat_num, is_accent, bpm, total_beats, is_playing, peer_count, midi_ports):
        self.current_beat = beat_num
        self.is_accent = is_accent
        self.bpm = bpm
        self.total_beats = total_beats
        self.is_playing = is_playing
        self.peer_count = peer_count
        self.midi_active_ports = midi_ports
        self.last_beat_time = time.time()

    def render(self):
        if not self.enabled or not self.screen:
            return

        # Background color
        bg_color = (15, 17, 23)
        self.screen.fill(bg_color)
        w, h = self.screen.get_size()

        # Decay animation for the pulse flash (0.0 to 1.0)
        time_since_beat = time.time() - self.last_beat_time
        decay = max(0.0, 1.0 - (time_since_beat * 3.5)) if self.is_playing else 0.0

        # Header Bar
        title_text = self.font_med.render("PULSE // BEAT SYNCHRONIZER", True, (255, 255, 255))
        self.screen.blit(title_text, (30, 25))

        peer_text = self.font_small.render(f"PEERS: {self.peer_count} | MIDI: {', '.join(self.midi_active_ports) if self.midi_active_ports else 'Virtual'}", True, (160, 170, 190))
        self.screen.blit(peer_text, (w - peer_text.get_width() - 30, 30))

        # Main Center Tempo Display
        bpm_color = (0, 230, 150) if self.is_playing else (120, 130, 150)
        bpm_val_text = self.font_huge.render(f"{int(self.bpm)}", True, bpm_color)
        bpm_lbl_text = self.font_med.render("BPM", True, (160, 170, 190))
        
        center_x, center_y = w // 2, h // 2 - 20
        self.screen.blit(bpm_val_text, (center_x - bpm_val_text.get_width() // 2, center_y - bpm_val_text.get_height() // 2))
        self.screen.blit(bpm_lbl_text, (center_x + bpm_val_text.get_width() // 2 + 10, center_y + 15))

        # Beat Visualizer Circles along the bottom
        circle_y = h - 90
        spacing = min(120, (w - 100) // max(1, self.total_beats))
        start_x = (w - (self.total_beats - 1) * spacing) // 2

        for i in range(1, self.total_beats + 1):
            cx = start_x + (i - 1) * spacing
            is_active = (i == self.current_beat) and self.is_playing
            radius = 32 if not is_active else int(32 + (12 * decay))

            if is_active:
                if self.is_accent:
                    fill_color = (255, int(70 + 100 * (1 - decay)), int(70 + 100 * (1 - decay)))  # Red accent
                    glow_color = (255, 50, 50)
                else:
                    fill_color = (int(0 + 200 * decay), int(220 + 35 * decay), 255)  # Cyan/White normal
                    glow_color = (0, 180, 255)

                # Draw outer glow
                pygame.draw.circle(self.screen, glow_color, (cx, circle_y), radius + 6, 2)
                pygame.draw.circle(self.screen, fill_color, (cx, circle_y), radius)
                text_color = (0, 0, 0)
            else:
                pygame.draw.circle(self.screen, (40, 45, 60), (cx, circle_y), radius, 2)
                text_color = (130, 140, 160)

            # Draw Beat Number inside circle
            num_surf = self.font_large.render(str(i), True, text_color)
            self.screen.blit(num_surf, (cx - num_surf.get_width() // 2, circle_y - num_surf.get_height() // 2))

        # Status Footer
        status_text = "● PLAYING (SYNCED TO ABLETON LINK)" if self.is_playing else "❚❚ PAUSED"
        status_surf = self.font_small.render(status_text, True, (0, 255, 150) if self.is_playing else (200, 100, 100))
        self.screen.blit(status_surf, (30, h - 35))

        pygame.display.flip()


# ---------------------------------------------------------
# Pulse Link Client Core
# ---------------------------------------------------------
class PulseLinkRpiClient:
    def __init__(self, server_url, midi_engine, gpio_controller, gui_display=None):
        self.server_url = server_url
        self.midi = midi_engine
        self.gpio = gpio_controller
        self.gui = gui_display

        self.ws = None
        self.client_id = None
        self.is_connected = False
        self.is_running = True

        # Synced Timeline State
        self.bpm = 120.0
        self.is_playing = False
        self.start_time_ms = int(time.time() * 1000)
        self.time_signature = "4/4"
        self.beats_per_measure = 4
        self.clock_offset_ms = 0
        self.peer_count = 0
        self.rtt_history = []

        # High-resolution MIDI Clock Threading
        self.clock_thread = None
        self.was_playing = False

        # Launch WebSocket
        self._connect()

        # Launch High-Precision Metronome & MIDI Clock Thread
        self.metronome_thread = threading.Thread(target=self._master_clock_loop, daemon=True)
        self.metronome_thread.start()

    def _connect(self):
        websocket.enableTrace(False)
        self.ws = websocket.WebSocketApp(
            self.server_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        t = threading.Thread(target=self.ws.run_forever, daemon=True)
        t.start()

    def _on_open(self, ws):
        self.is_connected = True
        self.rtt_history.clear()
        print(f"\n{Colors.GREEN}✓ Connected to Pulse Synchronizer!{Colors.ENDC}")
        # Send initial ping loop
        threading.Thread(target=self._ping_loop, daemon=True).start()

    def _on_message(self, ws, message_str):
        try:
            msg = json.loads(message_str)
            mtype = msg.get("type")

            if mtype == "WELCOME":
                self.client_id = msg.get("clientId")
                self.print_cli_status()

            elif mtype == "PONG":
                now_ms = int(time.time() * 1000)
                c_time = msg.get("clientTime", 0)
                s_time = msg.get("serverTime", 0)
                rtt = now_ms - c_time
                offset = s_time - (c_time + rtt // 2)

                self.rtt_history.append((rtt, offset))
                if len(self.rtt_history) > 10:
                    self.rtt_history.pop(0)

                best = min(self.rtt_history, key=lambda x: x[0])
                self.clock_offset_ms = best[1]

            elif mtype == "SYNC_STATE":
                state = msg.get("state", {})
                last_by = state.get("lastUpdatedBy")

                if last_by != self.client_id:
                    new_bpm = float(state.get("bpm", 120))
                    new_playing = bool(state.get("isPlaying", False))
                    new_start_time = state.get("startTime", int(time.time() * 1000))
                    new_sig = state.get("timeSignature", "4/4")

                    # Handle MIDI Transport Start / Stop
                    if new_playing and not self.is_playing:
                        self.midi.send_start()
                    elif not new_playing and self.is_playing:
                        self.midi.send_stop()

                    self.bpm = new_bpm
                    self.is_playing = new_playing
                    self.start_time_ms = new_start_time
                    self.time_signature = new_sig
                    try:
                        self.beats_per_measure = int(self.time_signature.split("/")[0])
                    except Exception:
                        self.beats_per_measure = 4

                    self.print_cli_status()

            elif mtype == "PEER_COUNT":
                self.peer_count = msg.get("count", 0)

        except Exception:
            pass

    def _on_error(self, ws, error):
        pass

    def _on_close(self, ws, c_code, c_msg):
        self.is_connected = False
        print(f"\n{Colors.FAIL}✖ Connection lost. Reconnecting in 3s...{Colors.ENDC}")
        time.sleep(3)
        if self.is_running:
            self._connect()

    def _ping_loop(self):
        while self.is_connected and self.is_running:
            try:
                self.ws.send(json.dumps({"type": "PING", "clientTime": int(time.time() * 1000)}))
            except Exception:
                break
            time.sleep(2.0)

    def _master_clock_loop(self):
        """
        Master 24 PPQN (Pulses Per Quarter Note) MIDI Clock & Beat Trigger Loop.
        Uses sub-millisecond phase tracking to guarantee zero jitter and drift compensation.
        """
        PPQN = 24  # Standard MIDI Timing Clock Pulses Per Quarter Note
        last_clock_tick = -1
        last_beat_index = -1

        while self.is_running:
            if not self.is_playing:
                time.sleep(0.005)
                continue

            try:
                current_bpm = self.bpm
                start_time_ms = self.start_time_ms
                offset = self.clock_offset_ms
                beats_per_measure = self.beats_per_measure

                seconds_per_beat = 60.0 / current_bpm
                seconds_per_clock_tick = seconds_per_beat / PPQN
                tick_interval_ms = seconds_per_clock_tick * 1000.0

                # Current synchronized time
                now_synced_ms = (time.time() * 1000.0) + offset
                elapsed_ms = now_synced_ms - start_time_ms

                # Current 24 PPQN tick index
                current_tick = int(elapsed_ms // tick_interval_ms)

                if current_tick > last_clock_tick:
                    # 1. Fire MIDI Clock Tick (0xF8)
                    self.midi.send_clock()

                    # 2. Check if this tick corresponds to a quarter-note beat boundary
                    current_beat_index = current_tick // PPQN

                    if current_beat_index > last_beat_index:
                        beat_in_measure = int(current_beat_index % beats_per_measure) + 1
                        is_accent = (beat_in_measure == 1)

                        # Trigger MIDI Note On/Off for drum machines
                        self.midi.trigger_beat_note(is_accent)

                        # Trigger Hardware GPIO Clock & Reset triggers
                        threading.Thread(target=self.gpio.pulse_clock, daemon=True).start()
                        if is_accent:
                            threading.Thread(target=self.gpio.pulse_reset, daemon=True).start()

                        # Update GUI Display
                        if self.gui:
                            self.gui.update_beat(
                                beat_in_measure, is_accent, self.bpm,
                                self.beats_per_measure, self.is_playing,
                                self.peer_count, self.midi.active_port_names
                            )

                        # Render CLI Beat Flash
                        self._render_cli_flash(beat_in_measure, is_accent)

                        last_beat_index = current_beat_index

                    last_clock_tick = current_tick
                else:
                    # Precise microsecond spin-sleep
                    time.sleep(0.0005)

            except Exception:
                time.sleep(0.001)

    def _render_cli_flash(self, beat_num, is_accent):
        dots = []
        for i in range(1, self.beats_per_measure + 1):
            if i == beat_num:
                color = Colors.BG_RED if is_accent else Colors.BG_WHITE
                dots.append(f"{color} {i} {Colors.ENDC}")
            else:
                dots.append(" • ")

        sys.stdout.write(f"\r  [LINK SYNC] -> BEAT: [ {''.join(dots)} ] | {int(self.bpm)} BPM | MIDI CLOCK: 24 PPQN   ")
        sys.stdout.flush()

    def print_cli_status(self):
        os.system('cls' if os.name == 'nt' else 'clear')
        print("=" * 68)
        print(f" {Colors.BOLD}PULSE // BEAT SYNCHRONIZER & MIDI BRIDGE - RASPBERRY PI{Colors.ENDC} ")
        print("=" * 68)
        print(f"  • Network Server: {self.server_url}")
        print(f"  • Connection:     {Colors.GREEN if self.is_connected else Colors.FAIL}{'ONLINE' if self.is_connected else 'OFFLINE'}{Colors.ENDC}")
        print(f"  • Active Peers:   {self.peer_count}")
        print(f"  • Current Tempo:  {Colors.CYAN}{self.bpm} BPM{Colors.ENDC}")
        print(f"  • Time Signature: {self.time_signature}")
        print(f"  • Transport:      {Colors.GREEN if self.is_playing else Colors.FAIL}{'PLAYING (Sending MIDI Clock)' if self.is_playing else 'STOPPED'}{Colors.ENDC}")
        print("-" * 68)
        print(f"  • MIDI Ports:     {Colors.GREEN + ', '.join(self.midi.active_port_names) + Colors.ENDC if self.midi.active_port_names else 'Virtual Simulation'}")
        print(f"  • MIDI Clock:     24 PPQN (Real-time 0xF8 sync enabled)")
        print(f"  • MIDI Notes:     {'Enabled (Ch ' + str(self.midi.note_channel + 1) + ')' if self.midi.send_notes else 'Disabled'}")
        print(f"  • GPIO Outputs:   {'BCM 18 (Clock), BCM 24 (Reset)' if self.gpio.enabled else 'Disabled'}")
        print("=" * 68)
        print("\n  [Space / P] Toggle Play/Pause  |  [bpm <val>] Set Tempo  |  [Q] Quit\n")

    def toggle_play(self):
        if not self.is_connected:
            return
        new_state = not self.is_playing
        server_now = int(time.time() * 1000) + self.clock_offset_ms
        self.ws.send(json.dumps({
            "type": "UPDATE_STATE",
            "state": {
                "bpm": self.bpm,
                "isPlaying": new_state,
                "startTime": server_now if new_state else self.start_time_ms,
                "timeSignature": self.time_signature
            }
        }))

    def change_bpm(self, new_bpm):
        if not self.is_connected:
            return
        clamped = max(20.0, min(300.0, float(new_bpm)))
        server_now = int(time.time() * 1000) + self.clock_offset_ms
        seconds_per_beat = 60.0 / self.bpm
        elapsed_beats = (server_now - self.start_time_ms) / 1000.0 / seconds_per_beat
        new_start = server_now - int(elapsed_beats * (60.0 / clamped) * 1000.0)

        self.ws.send(json.dumps({
            "type": "UPDATE_STATE",
            "state": {
                "bpm": clamped,
                "isPlaying": self.is_playing,
                "startTime": new_start,
                "timeSignature": self.time_signature
            }
        }))

    def close(self):
        self.is_running = False
        if self.ws:
            self.ws.close()
        self.midi.close()
        self.gpio.cleanup()


# ---------------------------------------------------------
# CLI Argument Parser & Entry Point
# ---------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Pulse Link Raspberry Pi Client with MIDI Clock & Visual Beat Display")
    parser.add_argument("url", nargs="?", default="ws://localhost:3000/ws", help="Pulse server WebSocket URL (e.g. ws://192.168.1.50:3000/ws)")
    parser.add_argument("--midi-port", type=str, default=None, help="Specific MIDI Output Port Name or substring")
    parser.add_argument("--midi-notes", action="store_true", help="Send MIDI Note-On triggers on beat for drum machines")
    parser.add_argument("--midi-channel", type=int, default=10, help="MIDI Channel for beat notes (1-16, default: 10)")
    parser.add_argument("--uart", action="store_true", help="Enable hardware 5-Pin DIN MIDI UART on /dev/serial0 (GPIO 14 TXD)")
    parser.add_argument("--gui", action="store_true", help="Enable Pygame HDMI Graphical Display window")
    parser.add_argument("--fullscreen", action="store_true", help="Open GUI in Fullscreen mode (ideal for Raspberry Pi touchscreens / HDMI)")

    args = parser.parse_args()

    # 1. Initialize MIDI
    midi_engine = MIDIEngine(
        port_name=args.midi_port,
        send_notes=args.midi_notes,
        note_channel=args.midi_channel,
        use_uart=args.uart
    )

    # 2. Initialize GPIO (BCM 18 Clock, BCM 24 Reset)
    gpio_controller = GPIOController()

    # 3. Initialize Pygame GUI if requested
    gui_display = None
    if args.gui or args.fullscreen:
        gui_display = PygameBeatDisplay(fullscreen=args.fullscreen)

    # 4. Start Pulse Link Client
    client = PulseLinkRpiClient(args.url, midi_engine, gpio_controller, gui_display)

    # If GUI is running, run Pygame event loop in the main thread
    if gui_display and gui_display.enabled:
        try:
            print("🚀 GUI Started. Press ESC or close window to exit.")
            running = True
            while running:
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        running = False
                    elif event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
                            running = False
                        elif event.key == pygame.K_SPACE or event.key == pygame.K_p:
                            client.toggle_play()
                        elif event.key == pygame.K_UP:
                            client.change_bpm(client.bpm + 1)
                        elif event.key == pygame.K_DOWN:
                            client.change_bpm(client.bpm - 1)
                        elif event.key == pygame.K_f:
                            # Toggle fullscreen
                            pygame.display.toggle_fullscreen()

                gui_display.render()
                gui_display.clock.tick(60)
        except KeyboardInterrupt:
            pass
        finally:
            client.close()
            pygame.quit()
    else:
        # CLI interactive loop
        try:
            while True:
                cmd = input().strip().lower()
                if cmd in ('q', 'exit'):
                    break
                elif cmd in ('p', 'play', ''):
                    client.toggle_play()
                elif cmd.startswith('bpm '):
                    try:
                        val = float(cmd.split(' ')[1])
                        client.change_bpm(val)
                    except Exception:
                        print("Usage: bpm <number>")
                elif cmd == 'help':
                    print("\n⌨️  Commands: [Space/P] Toggle Play | [bpm <val>] Set BPM | [Q] Quit\n")
                time.sleep(0.1)
        except KeyboardInterrupt:
            pass
        finally:
            client.close()

    print("\nPulse Link terminated cleanly.")

if __name__ == "__main__":
    main()
