import React, { useState, useEffect } from "react";
import { Mic, Copy, Trash2, Check, Sparkles, Volume2, Cpu, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DictationState, EngineState } from "@/types/hush";

interface DictationPadTabProps {
  state: DictationState;
  recording: boolean;
  streamingText: string;
  lastTranscription: { text: string; duration: number; success: boolean } | null;
  micLevel: number;
  holdChord: string;
  toggleCombo: string;
  activeModel: string;
  onToggleDictation: () => void;
}

export function DictationPadTab({
  state,
  recording,
  streamingText,
  lastTranscription,
  micLevel,
  holdChord,
  toggleCombo,
  activeModel,
  onToggleDictation,
}: DictationPadTabProps) {
  const [padText, setPadText] = useState(
    "Hold your global shortcut (Ctrl+Win) or click Dictate to transcribe speech anywhere in Windows. You can also test dictation live inside this scratchpad."
  );

  // When live streaming text updates, update pad
  useEffect(() => {
    if (streamingText) {
      setPadText((prev) => {
        return streamingText;
      });
    }
  }, [streamingText]);

  // When a batch transcription finishes, append if not empty
  useEffect(() => {
    if (lastTranscription?.text) {
      setPadText((prev) => {
        if (prev.includes("Hold your global shortcut")) {
          return lastTranscription.text;
        }
        return prev ? `${prev}\n\n${lastTranscription.text}` : lastTranscription.text;
      });
    }
  }, [lastTranscription]);

  const handleCopy = async () => {
    if (!padText) return;
    try {
      await navigator.clipboard.writeText(padText);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Could not copy to clipboard. Check clipboard permissions and try again.");
    }
  };

  const handleClear = () => {
    setPadText("");
    toast.info("Scratchpad cleared");
  };

  const wordCount = padText.trim() ? padText.trim().split(/\s+/).length : 0;
  const charCount = padText.length;

  return (
    <div className="space-y-4">
      {/* Top Status Indicators Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: Active Shortcut */}
        <Card className="bg-neutral-900/60 border-white/5 p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-neutral-300" />
              Hotkey Chords
            </span>
            <span className="text-[10px] bg-white/10 text-neutral-300 px-2 py-0.5 rounded-full font-mono">
              Global
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Hold to talk:</span>
              <span className="text-xs font-mono font-bold text-white bg-neutral-800 px-2 py-0.5 rounded-full">
                {holdChord}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">Toggle mode:</span>
              <span className="text-xs font-mono text-neutral-300 bg-neutral-800/80 px-2 py-0.5 rounded-full">
                {toggleCombo}
              </span>
            </div>
          </div>
        </Card>

        {/* Card 2: AI Engine */}
        <Card className="bg-neutral-900/60 border-white/5 p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-neutral-300" />
              Active AI Model
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              OpenVINO int8
            </span>
          </div>
          <p className="text-sm font-semibold text-white truncate">
            {activeModel || "Loading…"}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">
            Intel optimized · Zero cloud telemetry
          </p>
        </Card>

        {/* Card 3: Live Microphone Level */}
        <Card className="bg-neutral-900/60 border-white/5 p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-neutral-300" />
              Live Microphone
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                recording
                  ? "bg-red-500/10 text-red-400 animate-pulse"
                  : "bg-neutral-800 text-neutral-400"
              )}
            >
              {recording ? "Recording" : "Standby"}
            </span>
          </div>
          {/* Audio level meter bar */}
          <div className="h-3 w-full bg-neutral-800 rounded-full overflow-hidden p-0.5">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-75 ease-out",
                recording
                  ? "bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"
                  : "bg-neutral-600"
              )}
              style={{ width: `${Math.min(100, Math.round(micLevel * 100))}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-400 mt-1.5 flex justify-between">
            <span>Level: {Math.round(micLevel * 100)}%</span>
            <span>16kHz Mono</span>
          </p>
        </Card>
      </div>

      {/* Main Interactive Dictation Scratchpad */}
      <Card className="border-white/5 bg-neutral-900/70 rounded-2xl overflow-hidden shadow-lg">
        <CardHeader className="p-4 pb-3 border-b border-white/5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span>Dictation Scratchpad</span>
              {recording && (
                <span className="flex items-center gap-1 text-xs text-red-400 font-normal bg-red-500/10 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                  Live Recording
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Type or speak — real-time transcription appears here
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!padText}
              className="gap-1.5 text-xs h-8 border-white/10 hover:bg-neutral-800"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={!padText}
              className="gap-1.5 text-xs h-8 border-white/10 hover:bg-neutral-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <textarea
            value={padText}
            onChange={(e) => setPadText(e.target.value)}
            placeholder="Dictate with your hotkey or click Dictate Now to test speech-to-text here..."
            className="w-full h-56 bg-neutral-950/60 rounded-xl p-4 text-neutral-200 text-sm leading-relaxed border border-white/5 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 font-sans"
          />

          <div className="flex items-center justify-between mt-3 text-xs text-neutral-400">
            <div className="flex items-center gap-4">
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500">
                Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">{holdChord}</kbd> in any app to paste directly.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
