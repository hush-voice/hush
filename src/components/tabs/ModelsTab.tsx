import React from "react";
import { Cpu, Download, Check, HardDrive, Globe, Sparkles, AlertCircle, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ModelDetail, DownloadProgress } from "@/types/hush";

const COMPUTE_DEVICES = [
  { label: "Auto (Recommended)", code: "Auto", note: "Optimized per-model" },
  { label: "CPU", code: "CPU", note: "Compatible with any PC" },
  { label: "GPU (Intel Graphics)", code: "GPU", note: "Fastest on Intel Iris/Arc" },
];

const LANGUAGES = [
  { label: "Auto — English + Hindi (Auto-fixes Devanagari)", code: "auto" },
  { label: "English only (Fastest & most accurate)", code: "en" },
  { label: "Hindi only (हिन्दी)", code: "hi" },
  { label: "Auto — All Languages (99 languages)", code: "auto-all" },
  { label: "Spanish (Español)", code: "es" },
  { label: "French (Français)", code: "fr" },
  { label: "German (Deutsch)", code: "de" },
  { label: "Portuguese (Português)", code: "pt" },
  { label: "Japanese (日本語)", code: "ja" },
  { label: "Chinese (中文)", code: "zh" },
  { label: "Russian (Русский)", code: "ru" },
  { label: "Arabic (العربية)", code: "ar" },
];

interface ModelsTabProps {
  activeModel: string;
  computeDevice: string;
  language: string;
  models: Record<string, ModelDetail>;
  downloadProgress: DownloadProgress | null;
  onSelectModel: (model: string) => void;
  onSelectComputeDevice: (device: string) => void;
  onSelectLanguage: (language: string) => void;
  onDownloadModel: (model: string) => void;
  onCancelDownloadModel?: () => void;
}

export function ModelsTab({
  activeModel,
  computeDevice,
  language,
  models,
  downloadProgress,
  onSelectModel,
  onSelectComputeDevice,
  onSelectLanguage,
  onDownloadModel,
  onCancelDownloadModel,
}: ModelsTabProps) {
  const isDownloading = downloadProgress && downloadProgress.is_alive;

  return (
    <div className="space-y-4">
      {/* Compute Device & Language Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Compute Device Card */}
        <Card className="p-4 bg-neutral-900/60 border-white/5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-neutral-300" />
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Acceleration Device
            </h4>
          </div>
          <div className="space-y-1.5">
            {COMPUTE_DEVICES.map((d) => (
              <button
                key={d.code}
                onClick={() => onSelectComputeDevice(d.code)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left",
                  computeDevice === d.code
                    ? "bg-white text-black border-transparent font-semibold shadow-sm"
                    : "bg-neutral-800/60 border-white/5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                )}
              >
                <span>{d.label}</span>
                <span className={cn("text-[10px]", computeDevice === d.code ? "text-neutral-600" : "text-neutral-500")}>
                  {d.note}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* Language Selection Card */}
        <Card className="p-4 bg-neutral-900/60 border-white/5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-neutral-300" />
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
              Language Recognition
            </h4>
          </div>
          <select
            value={language}
            onChange={(e) => onSelectLanguage(e.target.value)}
            className="w-full h-9 bg-neutral-800/80 border border-white/10 text-white rounded-xl px-3 text-xs focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-neutral-900 text-white">
                {l.label}
              </option>
            ))}
          </select>

          <p className="text-[11px] text-neutral-400 mt-3 leading-relaxed">
            Hush auto-detects English and Hindi per phrase and converts Devanagari script seamlessly.
          </p>
        </Card>
      </div>

      {/* Available Models Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            OpenVINO int8 Local Whisper Models
          </h4>
          <span className="text-[11px] text-neutral-500">
            Downloaded locally to %LOCALAPPDATA%\Hush\models
          </span>
        </div>

        <div className="space-y-2.5">
          {Object.entries(models).map(([name, details]) => {
            const isActive = name === activeModel;
            const isDownloaded = details.downloaded;
            const isCurrentDownload = downloadProgress?.model === name && isDownloading;

            return (
              <Card
                key={name}
                className={cn(
                  "p-4 bg-neutral-900/60 border-white/5 transition-all rounded-2xl",
                  isActive && "ring-1 ring-white/20 bg-neutral-900/90"
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tracking-tight">
                        {name}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 px-2 font-mono border-white/10 text-neutral-400">
                        {details.size}
                      </Badge>

                      {name.includes("small (multilingual)") && (
                        <Badge className="bg-white text-black text-[10px] font-semibold py-0 px-2">
                          Default
                        </Badge>
                      )}

                      {name === "base.en" && (
                        <Badge variant="outline" className="text-[10px] py-0 px-2 border-emerald-500/20 text-emerald-400">
                          Recommended English
                        </Badge>
                      )}

                      {isActive && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] py-0 px-2">
                          Active Model ✓
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-neutral-400">
                      {details.note}
                    </p>

                    {/* Download Progress Bar if in progress */}
                    {isCurrentDownload && (
                      <div className="pt-2 space-y-1">
                        <div className="flex justify-between text-[11px] text-neutral-300">
                          <span>Downloading from HuggingFace Hub…</span>
                          <span className="font-mono">{downloadProgress.percent}%</span>
                        </div>
                        <Progress value={downloadProgress.percent} className="h-1.5" />
                        <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                          <span>
                            {(downloadProgress.downloaded_bytes / 1e6).toFixed(0)} MB
                          </span>
                          <span>
                            {downloadProgress.total_bytes
                              ? `${(downloadProgress.total_bytes / 1e6).toFixed(0)} MB`
                              : "Fetching size…"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-2">
                    {isCurrentDownload ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-800 text-xs text-neutral-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Downloading…</span>
                        </div>
                        {onCancelDownloadModel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={onCancelDownloadModel}
                            className="h-8 px-2.5 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs"
                            title="Cancel download"
                          >
                            <X className="w-3.5 h-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    ) : isDownloaded ? (
                      <Button
                        size="sm"
                        variant={isActive ? "secondary" : "default"}
                        disabled={isActive}
                        onClick={() => {
                          onSelectModel(name);
                          toast.success(`Switched to ${name}`);
                        }}
                        className={cn(
                          "gap-1.5 h-8 px-4 rounded-full text-xs font-semibold",
                          isActive && "opacity-60 cursor-default"
                        )}
                      >
                        {isActive ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </>
                        ) : (
                          <span>Activate</span>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="dark"
                        onClick={() => {
                          onDownloadModel(name);
                          toast.info(`Starting download for ${name}…`);
                        }}
                        className="gap-1.5 h-8 px-4 rounded-full text-xs font-semibold border-white/20"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
