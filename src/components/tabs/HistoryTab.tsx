import React, { useState } from "react";
import { Search, Copy, Check, Trash2, Download, Clock, MessageSquare, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { formatTimeSaved } from "@/lib/utils";
import type { HistoryEntry, SessionStats } from "@/types/hush";

interface HistoryTabProps {
  history: HistoryEntry[];
  stats: SessionStats;
  onClearHistory: () => void;
}

export function HistoryTab({ history, stats, onClearHistory }: HistoryTabProps) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filtered = history.filter((item) =>
    item.text.toLowerCase().includes(query.toLowerCase())
  );

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExport = () => {
    if (!history.length) return;
    const content = history
      .map(
        (h) =>
          `[${new Date(h.ts * 1000).toLocaleString()}] (${h.seconds}s)\n${h.text}\n`
      )
      .join("\n---\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hush_dictation_history_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("History exported!");
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Session Stats Banner */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 bg-neutral-900/60 border-white/5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xl font-bold text-white tracking-tight">
              {stats.words.toLocaleString()}
            </p>
            <p className="text-xs text-neutral-400 font-medium">
              Words dictated ({stats.utterances} phrases)
            </p>
          </div>
        </Card>

        <Card className="p-4 bg-neutral-900/60 border-white/5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xl font-bold text-white tracking-tight">
              {(stats.audio_seconds / 60).toFixed(1)}m
            </p>
            <p className="text-xs text-neutral-400 font-medium">
              Speech time recorded
            </p>
          </div>
        </Card>

        <Card className="p-4 bg-neutral-900/60 border-white/5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-400 tracking-tight">
              {formatTimeSaved(stats.audio_seconds, stats.words)}
            </p>
            <p className="text-xs text-neutral-400 font-medium">
              Time saved vs typing
            </p>
          </div>
        </Card>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search through previous dictations…"
            className="pl-9 bg-neutral-900/60 border-white/10 rounded-full h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!history.length}
            className="gap-1.5 text-xs h-9 rounded-full border-white/10 hover:bg-neutral-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Are you sure you want to clear all dictation history?")) {
                onClearHistory();
                toast.info("Dictation history cleared");
              }
            }}
            disabled={!history.length}
            className="gap-1.5 text-xs h-9 rounded-full border-white/10 hover:bg-red-500/10 hover:text-red-400 text-neutral-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </Button>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="p-12 text-center border border-white/5 rounded-2xl bg-neutral-900/30">
            <MessageSquare className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
            <p className="text-sm font-semibold text-neutral-300">
              {query ? "No matching dictations found" : "No dictations yet"}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {query
                ? "Try searching for a different keyword"
                : "Hold your hotkey and dictate anywhere to build your history."}
            </p>
          </div>
        ) : (
          filtered.map((item, index) => {
            const wordCount = item.text.trim() ? item.text.trim().split(/\s+/).length : 0;
            return (
              <Card
                key={index}
                className="p-3.5 bg-neutral-900/60 hover:bg-neutral-900 border-white/5 transition-all group rounded-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-neutral-400 font-medium">
                        {formatTimestamp(item.ts)}
                      </span>
                      <span className="text-neutral-600">·</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono border-white/10 text-neutral-300">
                        {item.seconds}s
                      </Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-white/10 text-neutral-400">
                        {wordCount} {wordCount === 1 ? "word" : "words"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-white/10 text-neutral-400">
                        {item.text.length} {item.text.length === 1 ? "character" : "characters"}
                      </Badge>
                    </div>

                    <p className="text-sm text-neutral-200 leading-relaxed font-normal whitespace-pre-wrap select-text">
                      {item.text}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(item.text, index)}
                    className="h-8 px-2.5 rounded-full border border-white/5 opacity-80 group-hover:opacity-100 hover:bg-white/10"
                    title="Copy to clipboard"
                  >
                    {copiedId === index ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-neutral-300" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
