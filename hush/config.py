"""Config, paths, stats.

All app data lives under one directory: %LOCALAPPDATA%\\Hush on Windows,
$XDG_DATA_HOME/hush (default ~/.local/share/hush) elsewhere.
"""

import copy
import json
import logging
import os
import sys
import threading
import time

log = logging.getLogger("hush.config")


def _app_dir():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "Hush")
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"),
                                                           ".local", "share")
    return os.path.join(base, "hush")


APP_DIR = _app_dir()
MODELS_DIR = os.path.join(APP_DIR, "models")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
HISTORY_PATH = os.path.join(APP_DIR, "history.jsonl")
LOG_PATH = os.path.join(APP_DIR, "app.log")

# name -> (HF repo of official OpenVINO int8 conversion, approx size, note)
MODELS = {
    "tiny.en": ("OpenVINO/whisper-tiny.en-int8-ov", "~60 MB", "fastest, lowest accuracy"),
    "base.en": ("OpenVINO/whisper-base.en-int8-ov", "~95 MB", "recommended — fast & accurate"),
    "small.en": ("OpenVINO/whisper-small.en-int8-ov", "~300 MB", "most accurate English"),
    "base (multilingual)": ("OpenVINO/whisper-base-int8-ov", "~95 MB", "fast, any language"),
    "small (multilingual)": ("OpenVINO/whisper-small-int8-ov", "~300 MB", "accurate, any language"),
    "large-v3-turbo (multilingual)": ("OpenVINO/whisper-large-v3-turbo-int8-ov", "~830 MB",
                                      "best accuracy — fast on Intel graphics, slow without"),
}

# Hold-to-talk chord presets: name -> set of "sides" of modifiers, resolved in hotkey.py
HOLD_CHORDS = ["Ctrl+Win", "Alt+Win", "Ctrl+Alt", "F9 (hold)"]
TOGGLE_COMBOS = ["Ctrl+Alt+D", "Ctrl+Shift+Space", "Ctrl+Alt+Space", "F10", "Disabled"]

CONFIG_VERSION = 3               # bump to migrate existing installs (see Config.__init__)

DEFAULTS = {
    "config_version": CONFIG_VERSION,
    "model": "small (multilingual)",  # understands Hindi/Hinglish/English out of the box
    "compute_device": "Auto",    # Auto (per-model, see engine.resolve_compute_device) | CPU | GPU
    "language": "auto",          # "auto" (detect per chunk) or an ISO code; .en models force en
    "hold_chord": "Ctrl+Win",
    "toggle_combo": "Ctrl+Alt+D",
    "input_device": None,        # None = system default; else device name substring
    "strip_fillers": True,
    "sounds": True,
    "history_enabled": True,
    "live_typing": True,         # in toggle mode, insert text as you speak (not just at stop)
    "paste_threshold": 400,      # chars; above this use clipboard paste instead of typed input
    "injection": "type",         # "type" (SendInput unicode) or "paste"
    "start_with_windows": False,
    "hands_free_mode": False,
    "dictionary": ["Suryansh"],  # names/jargon to bias + post-correct
    "stats": {"words": 0, "utterances": 0, "audio_seconds": 0.0},
    "vad_sensitivity": "medium",  # "high" (0.005), "medium" (0.010), "low" (0.020)
}


class Config:
    """Thread-safe config backed by config.json with Windows file-lock resilience."""

    def __init__(self):
        self._lock = threading.Lock()
        os.makedirs(APP_DIR, exist_ok=True)
        os.makedirs(MODELS_DIR, exist_ok=True)
        self._data = copy.deepcopy(DEFAULTS)
        stored = {}
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                stored = json.load(f)
            for k, v in stored.items():
                if k in DEFAULTS:
                    self._data[k] = v
        except (OSError, ValueError):
            pass

        ver = stored.get("config_version", 1) if stored else CONFIG_VERSION
        if ver < 2:
            self._data["model"] = "small (multilingual)"
            self._data["language"] = "auto"
        if ver < 3:
            if self._data.get("compute_device") == "CPU":
                self._data["compute_device"] = "Auto"
        self._data["config_version"] = CONFIG_VERSION
        self.save()

    def get(self, key):
        with self._lock:
            return self._data[key]

    def set(self, key, value):
        with self._lock:
            self._data[key] = value
        self.save()

    def add_stats(self, words, audio_seconds):
        with self._lock:
            s = self._data["stats"]
            s["words"] += words
            s["utterances"] += 1
            s["audio_seconds"] = round(s["audio_seconds"] + float(audio_seconds), 2)
        self.save()

    def save(self):
        with self._lock:
            os.makedirs(APP_DIR, exist_ok=True)
            tmp = CONFIG_PATH + ".tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(self._data, f, indent=2)
            except OSError as e:
                log.error("Failed to write temporary config file %s: %s", tmp, e)
                return

            # On Windows, os.replace fails if another process (antivirus, indexer)
            # has config.json open. Retry with exponential backoff before fallback.
            replaced = False
            for attempt in range(5):
                try:
                    os.replace(tmp, CONFIG_PATH)
                    replaced = True
                    break
                except (PermissionError, OSError):
                    time.sleep(0.02 * (2 ** attempt))

            if not replaced:
                # Fallback to direct overwrite if replace remains locked
                try:
                    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                        json.dump(self._data, f, indent=2)
                    if os.path.exists(tmp):
                        os.remove(tmp)
                except Exception as e:
                    log.error("Config save fallback failed: %s", e)
