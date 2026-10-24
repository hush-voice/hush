import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DictationState,
  EngineState,
  HushConfig,
  HistoryEntry,
  ModelDetail,
  DownloadProgress,
  SessionStats,
  InitialStateData,
} from "@/types/hush";

const WS_URL = "ws://127.0.0.1:4874";

const DEFAULT_CONFIG: HushConfig = {
  config_version: 3,
  model: "small (multilingual)",
  compute_device: "Auto",
  language: "auto",
  hold_chord: "Ctrl+Win",
  toggle_combo: "Ctrl+Alt+D",
  input_device: null,
  strip_fillers: true,
  sounds: true,
  history_enabled: true,
  live_typing: true,
  paste_threshold: 400,
  injection: "type",
  start_with_windows: false,
  hands_free_mode: false,
  dictionary: ["Suryansh"],
  stats: { words: 0, utterances: 0, audio_seconds: 0.0 },
};

const DEFAULT_MODELS: Record<string, ModelDetail> = {
  "tiny.en": { repo: "OpenVINO/whisper-tiny.en-int8-ov", size: "75 MB", note: "Fastest, lowest RAM (~300 MB), English only", downloaded: false },
  "base.en": { repo: "OpenVINO/whisper-base.en-int8-ov", size: "140 MB", note: "Sweet spot for speed on older laptops, English only", downloaded: false },
  "small.en": { repo: "OpenVINO/whisper-small.en-int8-ov", size: "460 MB", note: "High accuracy, English only", downloaded: false },
  "base (multilingual)": { repo: "OpenVINO/whisper-base-int8-ov", size: "140 MB", note: "Basic multilingual + English/Hindi", downloaded: false },
  "small (multilingual)": { repo: "OpenVINO/whisper-small-int8-ov", size: "460 MB", note: "Default — high accuracy English + Hindi", downloaded: false },
  "large-v3-turbo (multilingual)": { repo: "OpenVINO/whisper-large-v3-turbo-int8-ov", size: "800 MB", note: "Best accuracy, best on Intel iGPU", downloaded: false },
};

export function useHush() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<DictationState>("idle");
  const [stateMessage, setStateMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [isHandsFreeSession, setIsHandsFreeSession] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("unloaded");
  const [micLevel, setMicLevel] = useState(0.0);
  const [meterLevel, setMeterLevel] = useState(0.0);
  const [config, setConfig] = useState<HushConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<Record<string, ModelDetail>>(DEFAULT_MODELS);
  const [holdChords, setHoldChords] = useState<string[]>([]);
  const [toggleCombos, setToggleCombos] = useState<string[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>(DEFAULT_CONFIG.stats);
  const [streamingText, setStreamingText] = useState("");
  const [lastTranscription, setLastTranscription] = useState<{
    text: string;
    duration: number;
    success: boolean;
  } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);

  // Play chimes via Web Audio / HTML5 Audio (used as offline fallback)
  const playLocalSound = useCallback((which: "start" | "stop") => {
    try {
      const audio = new Audio(`./sounds/${which}.wav`);
      audio.volume = 0.25;
      audio.play().catch(() => {});
    } catch {}
  }, []);

  const send = useCallback((payload: Record<string, any>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      let token = "";
      try {
        token = window.electronAPI?.getAuthToken?.() || "";
      } catch {}
      const targetUrl = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        retryCountRef.current = 0;
        setConnected(true);
        if (token) {
          send({ action: "auth", token });
        }
        send({ action: "get_initial_state" });
      };

      ws.onclose = () => {
        setConnected(false);
        setRecording(false);
        setBusy(false);
        setState("idle");

        if (isUnmountedRef.current) return;

        // Exponential backoff: 1s, 1.5s, 2.25s up to 10s max with randomized jitter
        const count = retryCountRef.current;
        retryCountRef.current = Math.min(count + 1, 10);
        const delay = Math.min(10000, Math.round(1000 * Math.pow(1.5, count))) + Math.floor(Math.random() * 500);

        if (reconnectTimeoutRef.current) {
          window.clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          // Handle initial data response
          if (msg.action === "get_initial_state" && msg.data) {
            const d: InitialStateData = msg.data;
            setState(d.state || "idle");
            setStateMessage(d.state_message || "");
            setRecording(d.recording || false);
            setBusy(d.busy || false);
            setEnabled(d.enabled ?? true);
            setEngineState(d.engine_state || "ready");
            if (d.config) setConfig(d.config);
            if (d.models) setModels(d.models);
            if (d.hold_chords) setHoldChords(d.hold_chords);
            if (d.toggle_combos) setToggleCombos(d.toggle_combos);
            if (d.devices) setDevices(d.devices);
            if (d.history) setHistory(d.history);
            if (d.stats) setStats(d.stats);
            return;
          }

          // Handle broadcast events
          switch (msg.type) {
            case "state_change":
              setState(msg.state);
              setStateMessage(msg.message || "");
              setRecording(msg.recording ?? false);
              setBusy(msg.busy ?? false);
              if (msg.hands_free !== undefined) {
                setIsHandsFreeSession(Boolean(msg.hands_free));
              }
              if (msg.state === "listening") {
                setStreamingText("");
              }
              break;

            case "engine_state":
              setEngineState(msg.state);
              break;

            case "mic_level":
              setMicLevel(msg.level);
              break;

            case "meter_level":
              setMeterLevel(msg.level);
              break;

            case "stream_chunk":
              setStreamingText(msg.full_text || "");
              break;

            case "transcription_finished":
              setLastTranscription({
                text: msg.text,
                duration: msg.duration,
                success: msg.success,
              });
              if (msg.stats) setStats(msg.stats);
              if (msg.text) {
                setHistory((prev) => [
                  { ts: Date.now() / 1000, text: msg.text, seconds: msg.duration },
                  ...prev,
                ]);
              }
              break;

            case "download_progress":
              setDownloadProgress({
                model: msg.model,
                downloaded_bytes: msg.downloaded_bytes,
                total_bytes: msg.total_bytes,
                percent: msg.percent,
                is_alive: msg.is_alive,
                error: msg.error,
                done: msg.done,
              });
              if (msg.done) {
                setModels((prev) => ({
                  ...prev,
                  [msg.model]: {
                    ...(prev[msg.model] || {}),
                    downloaded: !msg.error,
                  },
                }));
              }
              break;

            case "config_updated":
              setConfig((prev) => ({ ...prev, [msg.key]: msg.value }));
              break;

            case "config_all_updated":
              if (msg.config) setConfig(msg.config);
              break;

            case "history_cleared":
              setHistory([]);
              break;

            case "history_item_deleted":
              if (msg.ts !== undefined) {
                setHistory((prev) => prev.filter((item) => Math.abs(item.ts - msg.ts) >= 1e-4));
              }
              break;

            case "enabled_state":
              setEnabled(msg.enabled);
              break;
          }
        } catch (e) {
          console.error("Error parsing WebSocket message", e);
        }
      };
    } catch (err) {
      console.error("Failed to construct WebSocket client", err);
    }
  }, [send]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();
    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Actions - backend is single source of truth for audio chimes when connected
  const startDictation = useCallback((mode: "hold" | "toggle" = "hold") => {
    if (!connected && config.sounds) playLocalSound("start");
    send({ action: "start_dictation", mode });
  }, [config.sounds, connected, playLocalSound, send]);

  const stopDictation = useCallback(() => {
    if (!connected && config.sounds) playLocalSound("stop");
    send({ action: "stop_dictation" });
  }, [config.sounds, connected, playLocalSound, send]);

  const cancelDictation = useCallback(() => {
    send({ action: "cancel_dictation" });
  }, [send]);

  const toggleDictation = useCallback(() => {
    if (!connected && config.sounds) {
      playLocalSound(recording ? "stop" : "start");
    }
    send({ action: "toggle_dictation" });
  }, [config.sounds, connected, playLocalSound, recording, send]);

  const updateConfig = useCallback((key: keyof HushConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    send({ action: "set_config", key, value });
  }, [send]);

  const updateConfigs = useCallback((updates: Partial<HushConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    send({ action: "set_configs", updates });
  }, [send]);

  const loadModel = useCallback((model: string, compute_device?: string) => {
    send({ action: "load_model", model, compute_device: compute_device || config.compute_device });
  }, [config.compute_device, send]);

  const downloadModel = useCallback((model: string) => {
    send({ action: "download_model", model });
  }, [send]);

  const cancelModelDownload = useCallback(() => {
    send({ action: "cancel_model_download" });
    setDownloadProgress(null);
  }, [send]);

  const startMeter = useCallback(() => {
    send({ action: "start_meter" });
  }, [send]);

  const stopMeter = useCallback(() => {
    send({ action: "stop_meter" });
  }, [send]);

  const clearHistory = useCallback(() => {
    send({ action: "clear_history" });
  }, [send]);

  const deleteHistoryItem = useCallback((ts: number) => {
    setHistory((prev) => prev.filter((item) => Math.abs(item.ts - ts) >= 1e-4));
    send({ action: "delete_history_item", ts });
  }, [send]);

  const pauseHotkeys = useCallback((paused: boolean) => {
    send({ action: "pause_hotkeys", paused });
  }, [send]);

  const playSound = useCallback((which: "start" | "stop") => {
    if (connected) {
      send({ action: "play_sound", which });
    } else {
      playLocalSound(which);
    }
  }, [connected, playLocalSound, send]);

  const toggleHandsFreeMode = useCallback(() => {
    const nextVal = !config.hands_free_mode;
    updateConfig("hands_free_mode", nextVal);
  }, [config.hands_free_mode, updateConfig]);

  return {
    connected,
    state,
    stateMessage,
    recording,
    busy,
    enabled,
    isHandsFreeSession,
    handsFreeMode: Boolean(config.hands_free_mode),
    engineState,
    micLevel,
    meterLevel,
    config,
    models,
    holdChords,
    toggleCombos,
    devices,
    history,
    stats,
    streamingText,
    lastTranscription,
    downloadProgress,
    startDictation,
    stopDictation,
    cancelDictation,
    toggleDictation,
    toggleHandsFreeMode,
    updateConfig,
    updateConfigs,
    loadModel,
    downloadModel,
    cancelModelDownload,
    startMeter,
    stopMeter,
    clearHistory,
    deleteHistoryItem,
    pauseHotkeys,
    playSound,
  };
}
