import React, { useEffect, useState } from "react";
import { Search, Copy, Check, Trash2, Download, Clock, MessageSquare, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { formatTimeSaved } from "@/lib/utils";
import type { HistoryEntry, SessionStats } from "@/types/hush";

type HistoryDateFilter = "all" | "today" | "thisWeek";

const toValidDate = (timestamp: unknown): Date | null => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface HistoryTabProps {
  history: HistoryEntry[];
  stats: SessionStats;
  onClearHistory: () => void;
  onDeleteHistoryItem?: (ts: number) => void;
}

export function HistoryTab({ history, stats, onClearHistory, onDeleteHistoryItem }: HistoryTabProps) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>("all");
  const [dateRefresh, setDateRefresh] = useState(0);

  useEffect(() => {
    if (dateFilter === "all") return;

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeoutId = window.setTimeout(() => {
      setDateRefresh((refresh) => refresh + 1);
    }, nextMidnight.getTime() - now.getTime());

    return () => window.clearTimeout(timeoutId);
  }, [dateFilter, dateRefresh]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const nextWeekStart = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 7
  );

  const filtered = history.filter((item) => {
    if (!item.text.toLowerCase().includes(query.toLowerCase())) return false;
    if (dateFilter === "all") return true;

    const date = toValidDate(item.ts);
    if (!date) return false;

    const rangeStart = dateFilter === "today" ? todayStart : weekStart;
    const rangeEnd = dateFilter === "today" ? tomorrowStart : nextWeekStart;
    return date >= rangeStart && date < rangeEnd;
  });

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (ts: number) => {
    if (onDeleteHistoryItem) {
      onDeleteHistoryItem(ts);
      toast.success("Dictation removed from history");
    }
  };

  const handleExport = () => {
    if (!history.length) return;
    const content = history
      .map(
        (h) => {
          const date = toValidDate(h.ts);
          return `[${date ? date.toLocaleString() : "Unknown date"}] (${h.seconds}s)\n${h.text}\n`;
        }
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
    const d = toValidDate(ts);
    if (!d) return "Unknown date";
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

      {/* Date Filters */}
      <div className="flex items-center gap-1 p-1 w-fit rounded-full border border-white/10 bg-neutral-900/60" role="group" aria-label="Filter history by date">
        {([
          ["all", "All"],
          ["today", "Today"],
          ["thisWeek", "This Week"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={dateFilter === value}
            onClick={() => setDateFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              dateFilter === value
                ? "bg-white text-black font-semibold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
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
              {query || dateFilter !== "all"
                ? "No dictations match these filters"
                : "No dictations yet"}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {query || dateFilter !== "all"
                ? "Try adjusting the search or date filter."
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

                  <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(item.text, index)}
                      className="h-8 px-2.5 rounded-full border border-white/5 hover:bg-white/10"
                      title="Copy to clipboard"
                    >
                      {copiedId === index ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-neutral-300" />
                      )}
                    </Button>
                    {onDeleteHistoryItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.ts)}
                        className="h-8 px-2.5 rounded-full border border-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                        title="Delete dictation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
