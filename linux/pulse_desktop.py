#!/usr/bin/env python3
"""
Pulse Link Desktop Client for Linux
==================================
A graphical user interface (GUI) desktop application for Linux desktops.
Displays synchronized beat visualizers and provides native audio click playback.

Requires:
  - tkinter (standard Python GUI library)
  - websocket-client (`pip install websocket-client`)
  - pygame (`pip install pygame`) (optional, for low-latency audio clicks)
"""

import os
import sys
import time
import json
import math
import threading
import tkinter as tk
from tkinter import ttk, messagebox

# Try importing websocket-client
try:
    import websocket
except ImportError:
    messagebox.showerror(
        "Dependency Missing",
        "The 'websocket-client' library is required.\n\nPlease install it using:\npip install websocket-client"
    )
    sys.exit(1)

# Try importing pygame for low-latency audio synthesis
SOUND_AVAILABLE = False
try:
    import pygame
    import numpy as np
    pygame.mixer.init(frequency=44100, size=-16, channels=1, buffer=512)
    SOUND_AVAILABLE = True
except Exception as e:
    print(f"Pygame audio not available: {e}. Falling back to visual-only mode.")


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
            except Exception as e:
                print(f"Failed to synthesize clicks: {e}")
                self.enabled = False

    def synthesize_clicks(self):
        sample_rate = 44100
        duration = 0.08
        num_samples = int(sample_rate * duration)
        t = np.linspace(0, duration, num_samples, False)

        # 880Hz downbeat click
        accent_wave = np.sin(2 * np.pi * 880.0 * t)
        decay = np.exp(-12 * (t / duration))
        accent_samples = (accent_wave * decay * 32767).astype(np.int16)
        self.accent_sound = pygame.mixer.Sound(buffer=accent_samples.tobytes())

        # 440Hz standard beat click
        normal_wave = np.sin(2 * np.pi * 440.0 * t)
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
                pass


# ---------------------------------------------------------
# Main Desktop GUI Application
# ---------------------------------------------------------
class PulseDesktopApp(tk.Tk):
    def __init__(self):
        super().__init__()

        # Window Configurations
        self.title("Pulse // Beat Sync Desktop")
        self.geometry("460x640")
        self.configure(bg="#0A0A0A")
        self.resizable(False, False)

        # App Session State
        self.bpm = 120
        self.is_playing = False
        self.start_time_ms = int(time.time() * 1000)
        self.time_signature = "4/4"
        self.beats_per_measure = 4
        self.active_beat = 0
        self.last_scheduled_beat = -1

        # Network Synced Sockets
        self.server_url = "ws://localhost:3000/ws"
        self.ws = None
        self.is_connected = False
        self.is_link_enabled = False
        self.client_id = None
        self.clock_offset_ms = 0
        self.rtt_history = []
        self.peer_count = 0

        # Latency / Audio Engine
        self.audio = AudioSynthesizer()
        self.sound_enabled = tk.BooleanVar(value=SOUND_AVAILABLE)
        self.latency_compensation = tk.IntVar(value=0)

        # Style layout setup
        self._setup_styles()
        self._build_ui()

        # Start standard background Metronome scheduling loop
        self.is_running = True
        self.metronome_thread = threading.Thread(target=self._metronome_loop, daemon=True)
        self.metronome_thread.start()

        # Handle close safety
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _setup_styles(self):
        self.style = ttk.Style()
        self.style.theme_use("clam")
        
        # Configure dark themes
        self.style.configure(".", background="#0A0A0A", foreground="#FFFFFF")
        self.style.configure("TLabel", background="#0A0A0A", foreground="#FFFFFF", font=("Courier", 11))
        self.style.configure("TButton", background="#1A1A1A", foreground="#FFFFFF", borderwidth=1, focuscolor="none")
        self.style.map("TButton", background=[("active", "#333333")], foreground=[("active", "#00BFFF")])

    def _build_ui(self):
        # Header Margin
        header_frame = tk.Frame(self, bg="#0A0A0A", pady=15)
        header_frame.pack(fill=tk.X, padx=20)

        # Logo Red Dot
        dot_canvas = tk.Canvas(header_frame, width=12, height=12, bg="#0A0A0A", highlightthickness=0)
        dot_canvas.pack(side=tk.LEFT)
        dot_canvas.create_oval(2, 2, 10, 10, fill="#FF3B30", outline="")

        header_lbl = tk.Label(
            header_frame, 
            text=" PULSE // DESKTOP CLIENT", 
            fg="#888888", 
            bg="#0A0A0A", 
            font=("Courier", 10, "bold")
        )
        header_lbl.pack(side=tk.LEFT)

        # Connection Status Capsule
        self.status_frame = tk.Frame(self, bg="#0A0A0A")
        self.status_frame.pack(pady=5)
        
        self.status_canvas = tk.Canvas(self.status_frame, width=8, height=8, bg="#0A0A0A", highlightthickness=0)
        self.status_canvas.pack(side=tk.LEFT, padx=5)
        self.status_dot = self.status_canvas.create_oval(1, 1, 7, 7, fill="#FF3B30", outline="")

        self.status_lbl = tk.Label(
            self.status_frame,
            text="LOCAL FALLBACK (LINK DISCONNECTED)",
            fg="#FF3B30",
            bg="#0A0A0A",
            font=("Courier", 8, "bold")
        )
        self.status_lbl.pack(side=tk.LEFT)

        # Central Visualizer Disk Panel
        self.viz_canvas = tk.Canvas(self, width=220, height=220, bg="#0A0A0A", highlightthickness=0)
        self.viz_canvas.pack(pady=30)
        
        # Draw nested static aesthetic circles
        self.viz_canvas.create_oval(10, 10, 210, 210, outline="#1C1C1C", width=1)
        self.pulse_circle = self.viz_canvas.create_oval(30, 30, 190, 190, fill="#151515", outline="")
        self.beat_text = self.viz_canvas.create_text(
            110, 110, 
            text="-", 
            fill="#333333", 
            font=("Courier", 64, "bold")
        )

        # Main Dynamic BPM Counter Display
        self.bpm_frame = tk.Frame(self, bg="#0A0A0A")
        self.bpm_frame.pack(pady=10)

        self.bpm_val_lbl = tk.Label(
            self.bpm_frame,
            text="120",
            fg="#FFFFFF",
            bg="#0A0A0A",
            font=("Courier", 72)
        )
        self.bpm_val_lbl.pack(side=tk.LEFT, anchor=tk.S)

        bpm_tag_lbl = tk.Label(
            self.bpm_frame,
            text=" BPM",
            fg="#555555",
            bg="#0A0A0A",
            font=("Courier", 14)
        )
        bpm_tag_lbl.pack(side=tk.LEFT, padx=5, pady=20, anchor=tk.S)

        # Signature Capsule
        self.sig_lbl = tk.Label(
            self,
            text="4/4",
            fg="#888888",
            bg="#141414",
            font=("Courier", 10),
            padx=12,
            pady=4,
            relief=tk.FLAT
        )
        self.sig_lbl.pack(pady=5)

        # Control Panel Sliders & Toggles
        self.ctrl_frame = tk.Frame(self, bg="#0A0A0A")
        self.ctrl_frame.pack(fill=tk.X, padx=40, pady=20)

        # Speed Slider
        self.bpm_slider = ttk.Scale(
            self.ctrl_frame,
            from_=20,
            to=300,
            value=120,
            orient=tk.HORIZONTAL,
            command=self._on_slider_move
        )
        self.bpm_slider.pack(fill=tk.X, pady=10)

        # Buttons Control Bar
        btn_frame = tk.Frame(self, bg="#0A0A0A")
        btn_frame.pack(fill=tk.X, padx=35, pady=15)

        # Tap Button
        self.tap_times = []
        tap_btn = tk.Button(
            btn_frame,
            text="TAP",
            bg="#0E0E0E",
            fg="#FFFFFF",
            activebackground="#222222",
            activeforeground="#FFFFFF",
            relief=tk.FLAT,
            font=("Courier", 11, "bold"),
            command=self._on_tap,
            width=10,
            height=2
        )
        tap_btn.pack(side=tk.LEFT, expand=True, padx=5)

        # Play / Pause Center Button
        self.play_btn = tk.Button(
            btn_frame,
            text="PLAY",
            bg="#FF3B30",
            fg="#FFFFFF",
            activebackground="#E03025",
            activeforeground="#FFFFFF",
            relief=tk.FLAT,
            font=("Courier", 12, "bold"),
            command=self._on_toggle_play,
            width=10,
            height=2
        )
        self.play_btn.pack(side=tk.LEFT, expand=True, padx=5)

        # Link Button
        self.link_btn = tk.Button(
            btn_frame,
            text="LINK",
            bg="#0E0E0E",
            fg="#FFFFFF",
            activebackground="#222222",
            activeforeground="#FFFFFF",
            relief=tk.FLAT,
            font=("Courier", 11, "bold"),
            command=self._on_toggle_link,
            width=10,
            height=2
        )
        self.link_btn.pack(side=tk.LEFT, expand=True, padx=5)

        # Bottom Options Panel
        options_frame = tk.Frame(self, bg="#0F0F0F", pady=10)
        options_frame.pack(fill=tk.X, side=tk.BOTTOM, padx=20, pady=15)

        # Sound Checkbox toggle
        sound_cb = tk.Checkbutton(
            options_frame,
            text=" Audio Clicks",
            variable=self.sound_enabled,
            bg="#0F0F0F",
            fg="#888888",
            selectcolor="#0A0A0A",
            activebackground="#0F0F0F",
            activeforeground="#FFFFFF",
            font=("Courier", 9)
        )
        sound_cb.pack(side=tk.LEFT, padx=15)

        # Latency adjustment label & micro offset slider
        lat_frame = tk.Frame(options_frame, bg="#0F0F0F")
        lat_frame.pack(side=tk.RIGHT, padx=15)
        
        tk.Label(lat_frame, text="Delay: ", bg="#0F0F0F", fg="#888888", font=("Courier", 9)).pack(side=tk.LEFT)
        self.lat_val_lbl = tk.Label(lat_frame, text="0 ms", bg="#0F0F0F", fg="#00BFFF", font=("Courier", 9, "bold"))
        self.lat_val_lbl.pack(side=tk.LEFT)

        # Small micro offset adjustments
        tk.Button(
            lat_frame, text="-", bg="#1A1A1A", fg="#FFFFFF", relief=tk.FLAT, font=("Courier", 8),
            command=lambda: self._adjust_latency(-10), width=2
        ).pack(side=tk.LEFT, padx=2)
        tk.Button(
            lat_frame, text="+", bg="#1A1A1A", fg="#FFFFFF", relief=tk.FLAT, font=("Courier", 8),
            command=lambda: self._adjust_latency(10), width=2
        ).pack(side=tk.LEFT, padx=2)

    def _adjust_latency(self, amount):
        new_val = self.latency_compensation.get() + amount
        new_val = max(-200, min(200, new_val))
        self.latency_compensation.set(new_val)
        self.lat_val_lbl.config(text=f"{new_val} ms")

    def _on_slider_move(self, val):
        target_bpm = int(float(val))
        if target_bpm != self.bpm:
            self._change_bpm_state(target_bpm)

    def _change_bpm_state(self, target_bpm):
        clamped_bpm = max(20, min(300, target_bpm))
        
        if self.is_link_enabled:
            server_now = int(time.time() * 1000) + self.clock_offset_ms
            seconds_per_beat = 60.0 / self.bpm
            elapsed_beats = (server_now - self.start_time_ms) / 1000.0 / seconds_per_beat
            new_start_time = server_now - int(elapsed_beats * (60.0 / clamped_bpm) * 1000.0)

            self._send_socket_update(clamped_bpm, self.is_playing, new_start_time, self.time_signature)
        else:
            now = int(time.time() * 1000)
            seconds_per_beat = 60.0 / self.bpm
            elapsed_beats = (now - self.start_time_ms) / 1000.0 / seconds_per_beat
            new_start_time = now - int(elapsed_beats * (60.0 / clamped_bpm) * 1000.0)

            self.start_time_ms = new_start_time
            self.bpm = clamped_bpm
            self._update_bpm_displays()

    def _update_bpm_displays(self):
        self.bpm_val_lbl.config(text=str(self.bpm))
        self.bpm_slider.set(self.bpm)

    def _on_tap(self):
        now = int(time.time() * 1000)
        self.tap_times.append(now)
        if len(self.tap_times) > 4:
            self.tap_times.pop(0)
        
        if len(self.tap_times) >= 2:
            diffs = [self.tap_times[i] - self.tap_times[i-1] for i in range(1, len(self.tap_times))]
            avg_diff = sum(diffs) / len(diffs)
            tapped_bpm = int(60000 / avg_diff)
            if 20 <= tapped_bpm <= 300:
                self._change_bpm_state(tapped_bpm)

    def _on_toggle_play(self):
        next_playing = not self.is_playing
        if self.is_link_enabled:
            server_now = int(time.time() * 1000) + self.clock_offset_ms
            new_start_time = server_now if next_playing else self.start_time_ms
            self._send_socket_update(self.bpm, next_playing, new_start_time, self.time_signature)
        else:
            if next_playing:
                self.start_time_ms = int(time.time() * 1000)
            self.is_playing = next_playing
            self._update_play_state_ui()

    def _update_play_state_ui(self):
        if self.is_playing:
            self.play_btn.config(text="PAUSE", bg="#FFFFFF", fg="#000000", activebackground="#DDDDDD")
        else:
            self.play_btn.config(text="PLAY", bg="#FF3B30", fg="#FFFFFF", activebackground="#E03025")
            self.viz_canvas.itemconfig(self.pulse_circle, fill="#151515")
            self.viz_canvas.itemconfig(self.beat_text, text="-", fill="#333333")

    def _on_toggle_link(self):
        if not self.is_link_enabled:
            # Enable link connection flow
            self.is_link_enabled = True
            self.link_btn.config(text="DISCONN", bg="#00BFFF", fg="#000000")
            
            # Reset offsets
            self.rtt_history.clear()
            self.clock_offset_ms = 0

            # Connect socket in separate thread
            threading.Thread(target=self._connect_socket, daemon=True).start()
        else:
            self.is_link_enabled = False
            self.is_connected = False
            self.link_btn.config(text="LINK", bg="#0E0E0E", fg="#FFFFFF")
            self._close_socket()
            self._update_status_bar_ui()

    def _connect_socket(self):
        websocket.enableTrace(False)
        try:
            self.ws = websocket.WebSocketApp(
                self.server_url,
                on_open=self._on_socket_open,
                on_message=self._on_socket_message,
                on_error=self._on_socket_error,
                on_close=self._on_socket_close
            )
            # Background block loop
            self.ws.run_forever()
        except Exception as e:
            print(f"Socket run error: {e}")

    def _close_socket(self):
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None

    def _on_socket_open(self, ws):
        self.is_connected = True
        self._update_status_bar_ui()
        
        # Start Clock Sync Ping Loop thread
        threading.Thread(target=self._socket_ping_loop, daemon=True).start()

    def _on_socket_message(self, ws, message_str):
        try:
            msg = json.loads(message_str)
            m_type = msg.get("type")

            if m_type == "WELCOME":
                self.client_id = msg.get("clientId")

            elif m_type == "PONG":
                recv_time = int(time.time() * 1000)
                client_time = msg.get("clientTime", 0)
                server_time = msg.get("serverTime", 0)

                rtt = recv_time - client_time
                offset = server_time - (client_time + rtt // 2)

                self.rtt_history.append((rtt, offset))
                if len(self.rtt_history) > 10:
                    self.rtt_history.pop(0)

                best_sample = min(self.rtt_history, key=lambda x: x[0])
                self.clock_offset_ms = best_sample[1]

            elif m_type == "SYNC_STATE":
                state = msg.get("state", {})
                last_updated_by = state.get("lastUpdatedBy")

                if last_updated_by != self.client_id:
                    self.bpm = state.get("bpm", 120)
                    self.is_playing = state.get("isPlaying", False)
                    self.start_time_ms = state.get("startTime", int(time.time() * 1000))
                    self.time_signature = state.get("timeSignature", "4/4")
                    
                    try:
                        self.beats_per_measure = int(self.time_signature.split("/")[0])
                    except Exception:
                        self.beats_per_measure = 4

                    # Sync UI
                    self.after(0, self._sync_incoming_state_ui)

            elif m_type == "PEER_COUNT":
                self.peer_count = msg.get("count", 0)
                self.after(0, self._update_status_bar_ui)

        except Exception as e:
            pass

    def _sync_incoming_state_ui(self):
        self._update_bpm_displays()
        self._update_play_state_ui()
        self.sig_lbl.config(text=self.time_signature)

    def _on_socket_error(self, ws, error):
        pass

    def _on_socket_close(self, ws, close_status_code, close_msg):
        self.is_connected = False
        self.after(0, self._update_status_bar_ui)
        
        # Auto-reconnection backoff
        if self.is_link_enabled and self.is_running:
            time.sleep(3.0)
            if self.is_link_enabled and not self.is_connected:
                threading.Thread(target=self._connect_socket, daemon=True).start()

    def _socket_ping_loop(self):
        while self.is_connected and self.is_link_enabled and self.is_running:
            try:
                ping_payload = {
                    "type": "PING",
                    "clientTime": int(time.time() * 1000)
                }
                if self.ws:
                    self.ws.send(json.dumps(ping_payload))
            except Exception:
                break
            time.sleep(2.5)

    def _send_socket_update(self, bpm, is_playing, start_time, signature):
        if not self.is_connected or not self.ws:
            return
        
        payload = {
            "type": "UPDATE_STATE",
            "state": {
                "bpm": bpm,
                "isPlaying": is_playing,
                "startTime": start_time,
                "timeSignature": signature
            }
        }
        try:
            self.ws.send(json.dumps(payload))
        except Exception as e:
            print(f"Failed to transmit update: {e}")

    def _update_status_bar_ui(self):
        if not self.is_link_enabled:
            self.status_canvas.itemconfig(self.status_dot, fill="#FF3B30")
            self.status_lbl.config(text="LOCAL FALLBACK (LINK DISCONNECTED)", fg="#FF3B30")
        elif self.is_connected:
            self.status_canvas.itemconfig(self.status_dot, fill="#00BFFF")
            self.status_lbl.config(text=f"SYNCED ({self.peer_count} PEERS)", fg="#00BFFF")
        else:
            self.status_canvas.itemconfig(self.status_dot, fill="#FF9500")
            self.status_lbl.config(text="CONNECTING...", fg="#FF9500")

    def _metronome_loop(self):
        while self.is_running:
            if not self.is_playing:
                time.sleep(0.01)
                continue

            try:
                current_bpm = self.bpm
                start_time = self.start_time_ms
                offset = self.clock_offset_ms if self.is_link_enabled else 0
                latency = self.latency_compensation.get()

                seconds_per_beat = 60.0 / current_bpm
                beat_interval_ms = int(seconds_per_beat * 1000)

                synchronized_now = int(time.time() * 1000) + offset
                elapsed_ms = synchronized_now - start_time - latency
                current_beat_index = elapsed_ms // beat_interval_ms

                target_beat_time_ms = start_time + (current_beat_index * beat_interval_ms) + latency

                if current_beat_index > self.last_scheduled_beat:
                    time_to_wait = (target_beat_time_ms - (int(time.time() * 1000) + offset)) / 1000.0
                    if time_to_wait > 0:
                        time.sleep(time_to_wait)

                    beat_in_measure = int(current_beat_index % self.beats_per_measure)
                    is_accent = (beat_in_measure == 0)

                    # Trigger audio click
                    if self.sound_enabled.get():
                        threading.Thread(target=self.audio.play, args=(is_accent,), daemon=True).start()

                    # Trigger TK UI Flash
                    self.after(0, self._flash_ui, beat_in_measure + 1, is_accent)

                    self.last_scheduled_beat = current_beat_index
                else:
                    time.sleep(0.001)

            except Exception as e:
                time.sleep(0.01)

    def _flash_ui(self, beat_num, is_accent):
        if not self.is_playing:
            return
            
        color = "#FF3B30" if is_accent else "#FFFFFF"
        self.viz_canvas.itemconfig(self.pulse_circle, fill=color)
        self.viz_canvas.itemconfig(self.beat_text, text=str(beat_num), fill="#000000")
        
        # Micro animation fade-out
        self.after(80, self._dim_ui)

    def _dim_ui(self):
        if self.is_playing:
            self.viz_canvas.itemconfig(self.pulse_circle, fill="#151515")
            self.viz_canvas.itemconfig(self.beat_text, fill="#333333")

    def _on_close(self):
        self.is_running = False
        self._close_socket()
        self.destroy()


if __name__ == "__main__":
    app = PulseDesktopApp()
    app.mainloop()
