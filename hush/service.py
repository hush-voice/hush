"""Hush headless background service: coordinates engine, audio, hotkeys, injection,
and communicates with Electron via a local WebSocket connection (ws://127.0.0.1:4874).
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import threading
import time
from typing import Dict, Any, Set

import numpy as np
import websockets

from . import APP_NAME, APP_VERSION, history, inject, sounds, textproc
from .audio import Recorder, resolve_device, list_input_devices, open_input_stream, SILENCE_PEAK
from .config import Config, MODELS, HOLD_CHORDS, TOGGLE_COMBOS, LOG_PATH, APP_DIR
from .engine import Engine, DictationSession, is_downloaded, expected_bytes, downloaded_bytes, download_model

log = logging.getLogger("hush.service")

DEFAULT_PORT = 4874
MIN_UTTERANCE_S = 0.35
STREAM_MIN_S, STREAM_MAX_S = 4, 24
BATCH_MIN_S, BATCH_MAX_S = 14, 26
MAX_SESSION_S = 20 * 60


class HushService:
    def __init__(self, port: int = DEFAULT_PORT):
        self.port = port
        self.cfg = Config()
        self.recording = False
        self.busy = False
        self.enabled = True
        self.session = None
        self._feeder = None
        self._feeder_stop = threading.Event()
        self._streaming = False
        self._stream_full = ""
        self._stream_any_ok = False
        self._last_peak = 0.0
        self._state = "idle"
        self._state_message = ""
        self._t0 = 0.0
        self._clients: Set[websockets.WebSocketServerProtocol] = set()
        self._loop: asyncio.AbstractEventLoop = None

        # Mic meter for settings UI calibration
        self._meter_stream = None

        # Download tracking
        self._dl_model = None
        self._dl_thread = None
        self._dl_total = None
        self._dl_error = None

        # Core components
        self.engine = Engine(on_state=self._on_engine_state)
        self.recorder = Recorder(on_level=self._on_mic_level)
        self.hook = None
        self._init_hotkeys()

        # Warm up mic
        self._warm_mic()

        # Auto-load configured model
        initial_model = self.cfg.get("model")
        initial_device = self.cfg.get("compute_device")
        if is_downloaded(initial_model):
            self.engine.load(initial_model, initial_device)

    def _init_hotkeys(self):
        from .hotkey import HotkeyHook
        self.hook = HotkeyHook(
            on_hold_down=self._on_hotkey_hold_down,
            on_hold_up=self._on_hotkey_hold_up,
            on_toggle=self._on_hotkey_toggle,
        )
        if os.environ.get("HUSH_ACCEPT_INJECTED") == "1":
            self.hook.accept_injected = True
        self.hook.set_bindings(self.cfg.get("hold_chord"), self.cfg.get("toggle_combo"))
        self.hook.start()

    def _warm_mic(self):
        def work():
            time.sleep(0.35)
            for attempt in range(3):
                try:
                    dev = resolve_device(self.cfg.get("input_device"))
                    self.recorder.open(dev)
                    if self.recorder.ready:
                        log.info("mic warm-open succeeded on attempt %d (device=%s)", attempt + 1, dev)
                        break
                except Exception as e:
                    log.warning("mic warm-open attempt %d failed: %s", attempt + 1, e)
                    time.sleep(0.4)
        threading.Thread(target=work, name="mic-warm", daemon=True).start()

    # --- WebSocket Event Dispatching ---

    def broadcast(self, data: Dict[str, Any]):
        if not self._loop or not self._clients:
            return
        msg = json.dumps(data)
        asyncio.run_coroutine_threadsafe(self._broadcast_async(msg), self._loop)

    async def _broadcast_async(self, msg: str):
        dead = set()
        for client in self._clients:
            try:
                await client.send(msg)
            except Exception:
                dead.add(client)
        self._clients.difference_update(dead)

    def _set_state(self, state: str, message: str = "", **kwargs):
        self._state = state
        self._state_message = message
        payload = {
            "type": "state_change",
            "state": state,
            "message": message,
            "recording": self.recording,
            "busy": self.busy,
            "mode": getattr(self, "_current_mode", "hold"),
            "hands_free": getattr(self, "_current_mode", "hold") == "toggle" or bool(self.cfg.get("hands_free_mode")),
        }
        payload.update(kwargs)
        self.broadcast(payload)

    def _schedule_auto_clear(self, expected_state: str, delay_s: float = 2.0):
        """Schedule automatic return to 'idle' state unless new dictation begins."""
        def _worker():
            time.sleep(delay_s)
            if self._state == expected_state and not self.recording and not self.busy:
                self._set_state("idle", "")
        threading.Thread(target=_worker, name="auto-clear-state", daemon=True).start()

    def _on_engine_state(self, state: str):
        self.broadcast({
            "type": "engine_state",
            "state": state,
            "model": self.cfg.get("model"),
            "error": self.engine.error,
        })

    def _on_mic_level(self, level: float):
        self.broadcast({
            "type": "mic_level",
            "level": min(1.0, float(level)),
        })

    # --- Hotkey Callbacks ---

    def _on_hotkey_hold_down(self):
        self.start_dictation(mode="hold")

    def _on_hotkey_hold_up(self):
        self.stop_dictation()

    def _on_hotkey_toggle(self):
        self.toggle_dictation()

    # --- Dictation Workflow ---

    def start_dictation(self, mode: str = "hold"):
        if self.recording or self.busy or not self.enabled:
            return
        if self.engine.state != "ready":
            msg = "Model still loading…" if self.engine.state == "loading" else "No model ready — check Models"
            self._set_state("error", msg)
            return

        opened = False
        last_err = None
        dev = resolve_device(self.cfg.get("input_device"))
        for attempt in range(3):
            try:
                self.recorder.begin(dev)
                opened = True
                break
            except Exception as e:
                last_err = e
                log.warning("mic begin attempt %d failed: %s", attempt + 1, e)
                dev = None  # Fallback to system default on subsequent attempt
                time.sleep(0.12)

        if not opened:
            log.error("All mic begin attempts failed: %s", last_err)
            self._set_state("error", "Microphone unavailable")
            self._schedule_auto_clear("error", 2.5)
            return

        if self.cfg.get("hands_free_mode") and mode == "hold":
            mode = "toggle"
        self._current_mode = mode

        self._streaming = (mode == "toggle" and self.cfg.get("live_typing"))
        self._stream_full = ""
        self._stream_any_ok = False
        min_s, max_s = (STREAM_MIN_S, STREAM_MAX_S) if self._streaming else (BATCH_MIN_S, BATCH_MAX_S)

        self.recording = True
        self._t0 = time.monotonic()
        self.session = DictationSession(
            self.engine, self.recorder,
            self.cfg.get("language"),
            self.cfg.get("dictionary"),
            min_s, max_s
        )
        self._feeder_stop.clear()
        self._feeder = threading.Thread(target=self._feed_loop, daemon=True)
        self._feeder.start()

        if self.cfg.get("sounds"):
            sounds.play("start")

        self._set_state("listening", "Listening…")
        log.info("dictation started (mode=%s streaming=%s)", mode, self._streaming)

    def _feed_loop(self):
        while not self._feeder_stop.wait(0.25):
            try:
                raw = self.session.feed()
                if raw and self._streaming:
                    chunk = textproc.clean(
                        raw, self.cfg.get("strip_fillers"), self.cfg.get("dictionary")
                    )
                    if any(c.isalnum() for c in chunk):
                        self._emit_chunk(chunk)
            except Exception:
                log.exception("feed failed")

    def _emit_chunk(self, chunk: str):
        sep = ""
        if (self._stream_full and not self._stream_full.endswith((" ", "\n"))
                and not chunk.startswith(("\n", " "))):
            sep = " "
        ok = inject.insert_text(sep + chunk, self.cfg.get("injection"), self.cfg.get("paste_threshold"))
        self._stream_full += sep + chunk
        self._stream_any_ok = self._stream_any_ok or ok
        self.broadcast({
            "type": "stream_chunk",
            "chunk": chunk,
            "full_text": self._stream_full,
        })

    def stop_dictation(self):
        if not self.recording:
            return
        self.recording = False
        self._feeder_stop.set()
        duration = time.monotonic() - self._t0
        audio = self.recorder.end()
        self._last_peak = float(np.max(np.abs(audio))) if len(audio) else 0.0

        if self.cfg.get("sounds"):
            sounds.play("stop")

        if duration < MIN_UTTERANCE_S:
            self._set_state("idle", "")
            return

        self.busy = True
        self._set_state("transcribing", "Transcribing…")
        session = self.session
        threading.Thread(
            target=self._finish_worker,
            args=(session, audio, duration, self._feeder),
            daemon=True
        ).start()

    def cancel_dictation(self):
        if not self.recording and not self.busy:
            return
        self.recording = False
        self.busy = False
        self._feeder_stop.set()
        try:
            self.recorder.end()
        except Exception:
            pass
        self._set_state("idle", "Cancelled")

    def toggle_dictation(self):
        if self.recording:
            self.stop_dictation()
        else:
            self.start_dictation(mode="toggle")

    def _finish_worker(self, session, audio, duration, feeder):
        try:
            if feeder is not None:
                feeder.join(timeout=60)
            tail_raw = session.finish(audio)
            if self._streaming:
                tail = textproc.clean(
                    tail_raw, self.cfg.get("strip_fillers"), self.cfg.get("dictionary")
                )
                if any(c.isalnum() for c in tail):
                    self._emit_chunk(tail)
                full = self._stream_full.strip()
                self._on_finished(full, duration, self._stream_any_ok)
            else:
                text = textproc.clean(
                    session.full_text(), self.cfg.get("strip_fillers"), self.cfg.get("dictionary")
                )
                if not any(c.isalnum() for c in text):
                    text = ""
                ok = False
                if text:
                    ok = inject.insert_text(
                        text, self.cfg.get("injection"), self.cfg.get("paste_threshold")
                    )
                self._on_finished(text, duration, ok)
        except Exception:
            log.exception("transcription worker failed")
            self._on_finished("", duration, False)

    def _on_finished(self, text: str, duration: float, ok: bool):
        self.busy = False
        log.info("dictation finished: %d chars, %.1fs, inserted=%s", len(text), duration, ok)

        if not text:
            if self._last_peak < SILENCE_PEAK:
                self._set_state("error", "No mic signal — check mic mute")
            else:
                self._set_state("error", "No speech detected")
            self._schedule_auto_clear("error", 2.5)
        else:
            if not ok:
                if inject.foreground_injection_blocked():
                    msg = "Run Hush as admin — text copied"
                else:
                    msg = "Couldn't type — copied to clipboard"
                self._set_state("error", msg)
                inject._set_clipboard_text(text)
                self._schedule_auto_clear("error", 3.0)
            else:
                self._set_state("inserted", "✓ Inserted")
                self._schedule_auto_clear("inserted", 2.0)

            if self.cfg.get("history_enabled"):
                history.append(text, duration)
            self.cfg.add_stats(textproc.word_count(text), duration)

        self.broadcast({
            "type": "transcription_finished",
            "text": text,
            "duration": round(duration, 1),
            "success": ok,
            "stats": self.cfg.get("stats"),
        })

    # --- Model Download Operations ---

    def start_model_download(self, name: str):
        if not name or self._dl_model or name not in MODELS:
            return False
        self._dl_model = name
        self._dl_error = None
        self._dl_total = None

        def work():
            try:
                self._dl_total = expected_bytes(name)
                download_model(name)
                self._dl_error = None
            except Exception as e:
                self._dl_error = str(e) or e.__class__.__name__
                log.exception("model download failed: %s", name)

        self._dl_thread = threading.Thread(target=work, name="model-download", daemon=True)
        self._dl_thread.start()

        # Start poll timer thread
        threading.Thread(target=self._poll_download_loop, daemon=True).start()
        return True

    def _poll_download_loop(self):
        while self._dl_model:
            name = self._dl_model
            got = downloaded_bytes(name)
            total = self._dl_total
            alive = self._dl_thread.is_alive() if self._dl_thread else False
            pct = min(100, int(got * 100 / total)) if total else 0

            self.broadcast({
                "type": "download_progress",
                "model": name,
                "downloaded_bytes": got,
                "total_bytes": total,
                "percent": pct,
                "is_alive": alive,
                "error": self._dl_error,
                "done": not alive,
            })

            if not alive:
                if not self._dl_error and is_downloaded(name):
                    self.cfg.set("model", name)
                    self.engine.load(name, self.cfg.get("compute_device"))
                self._dl_model = None
                break

            time.sleep(0.4)

    # --- Mic Calibration Meter ---

    def start_meter(self):
        if self._meter_stream:
            return
        try:
            def cb(indata, frames, t, status):
                rms = float(np.sqrt(np.mean(indata[:, 0] ** 2)))
                self.broadcast({
                    "type": "meter_level",
                    "level": min(1.0, rms * 18.0),
                })
            self._meter_stream = open_input_stream(
                resolve_device(self.cfg.get("input_device")), cb
            )
            self._meter_stream.start()
        except Exception:
            log.exception("meter stream start failed")
            self._meter_stream = None

    def stop_meter(self):
        if self._meter_stream:
            try:
                self._meter_stream.stop()
                self._meter_stream.close()
            except Exception:
                pass
            self._meter_stream = None

    # --- Request Handler ---

    async def handle_message(self, ws: websockets.WebSocketServerProtocol, raw: str):
        try:
            req = json.loads(raw)
        except Exception:
            return

        action = req.get("action")
        reply = {"action": action, "status": "ok"}

        if action == "ping":
            reply["time"] = time.time()

        elif action == "get_initial_state":
            reply["data"] = {
                "app_name": APP_NAME,
                "app_version": APP_VERSION,
                "state": self._state,
                "state_message": self._state_message,
                "recording": self.recording,
                "busy": self.busy,
                "enabled": self.enabled,
                "engine_state": self.engine.state,
                "config": self.cfg._data,
                "models": {
                    k: {
                        "repo": v[0],
                        "size": v[1],
                        "note": v[2],
                        "downloaded": is_downloaded(k),
                    }
                    for k, v in MODELS.items()
                },
                "hold_chords": HOLD_CHORDS,
                "toggle_combos": TOGGLE_COMBOS,
                "devices": (lambda: [d[1] for d in list_input_devices()] if list_input_devices else [])(),
                "history": history.load(limit=100),
                "stats": self.cfg.get("stats"),
                "app_dir": APP_DIR,
            }

        elif action == "start_dictation":
            mode = req.get("mode", "hold")
            self.start_dictation(mode=mode)

        elif action == "stop_dictation":
            self.stop_dictation()

        elif action == "cancel_dictation":
            self.cancel_dictation()

        elif action == "toggle_dictation":
            self.toggle_dictation()

        elif action == "set_config":
            k, v = req.get("key"), req.get("value")
            if k:
                self.cfg.set(k, v)
                if k in ("hold_chord", "toggle_combo") and self.hook:
                    self.hook.set_bindings(self.cfg.get("hold_chord"), self.cfg.get("toggle_combo"))
                reply["key"] = k
                reply["value"] = v
                self.broadcast({"type": "config_updated", "key": k, "value": v, "config": self.cfg._data})

        elif action == "set_configs":
            updates = req.get("updates", {})
            for k, v in updates.items():
                self.cfg.set(k, v)
            if any(k in updates for k in ("hold_chord", "toggle_combo")) and self.hook:
                self.hook.set_bindings(self.cfg.get("hold_chord"), self.cfg.get("toggle_combo"))
            self.broadcast({"type": "config_all_updated", "config": self.cfg._data})

        elif action == "load_model":
            model = req.get("model")
            device = req.get("compute_device", self.cfg.get("compute_device"))
            if is_downloaded(model):
                self.cfg.set("model", model)
                self.cfg.set("compute_device", device)
                self.engine.load(model, device)
            else:
                reply["status"] = "not_downloaded"

        elif action == "download_model":
            model = req.get("model")
            ok = self.start_model_download(model)
            reply["status"] = "started" if ok else "failed"

        elif action == "play_sound":
            which = req.get("which", "start")
            sounds.play(which)

        elif action == "start_meter":
            self.start_meter()

        elif action == "stop_meter":
            self.stop_meter()

        elif action == "get_history":
            reply["history"] = history.load(limit=req.get("limit", 200))

        elif action == "clear_history":
            history.clear()
            reply["history"] = []
            self.broadcast({"type": "history_cleared"})

        elif action == "delete_history_item":
            ts = req.get("ts")
            deleted = False
            if ts is not None:
                deleted = history.delete_entry(float(ts))
            reply["deleted"] = deleted
            reply["ts"] = ts
            if deleted:
                self.broadcast({"type": "history_item_deleted", "ts": ts})

        elif action == "pause_hotkeys":
            self.enabled = not req.get("paused", False)
            reply["enabled"] = self.enabled
            self.broadcast({"type": "enabled_state", "enabled": self.enabled})

        await ws.send(json.dumps(reply))

    # --- Connection Lifecycle ---

    async def ws_handler(self, ws: websockets.WebSocketServerProtocol):
        self._clients.add(ws)
        try:
            async for message in ws:
                await self.handle_message(ws, message)
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)

    async def run_server(self):
        self._loop = asyncio.get_running_loop()
        log.info("Starting Hush WebSocket Service on ws://127.0.0.1:%d", self.port)
        async with websockets.serve(self.ws_handler, "127.0.0.1", self.port):
            print(f"[HUSH_SERVICE_READY] ws://127.0.0.1:{self.port}", flush=True)
            await asyncio.Future()  # run forever


def main():
    parser = argparse.ArgumentParser(description="Hush background service")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="WebSocket port")
    args = parser.parse_args()

    os.makedirs(APP_DIR, exist_ok=True)
    logging.basicConfig(
        filename=LOG_PATH, level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    service = HushService(port=args.port)
    try:
        asyncio.run(service.run_server())
    except KeyboardInterrupt:
        if service.hook:
            service.hook.stop()
        service.recorder.end()
        service.recorder.close()
        log.info("Hush service shut down cleanly.")


if __name__ == "__main__":
    main()
