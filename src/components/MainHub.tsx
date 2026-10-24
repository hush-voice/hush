import React, { useState, useEffect } from "react";
import { Mic, History, BookA, Cpu, Keyboard, Settings, ShieldCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { DictationPadTab } from "@/components/tabs/DictationPadTab";
import { HistoryTab } from "@/components/tabs/HistoryTab";
import { DictionaryTab } from "@/components/tabs/DictionaryTab";
import { ModelsTab } from "@/components/tabs/ModelsTab";
import { HotkeysTab } from "@/components/tabs/HotkeysTab";
import { PreferencesTab } from "@/components/tabs/PreferencesTab";
import { Toaster } from "@/components/ui/sonner";
import type { useHush } from "@/hooks/useHush";

interface MainHubProps {
  hush: ReturnType<typeof useHush>;
}

export function MainHub({ hush }: MainHubProps) {
  const [activeTab, setActiveTab] = useState("dictation");
  const [appVersion, setAppVersion] = useState("1.0.3");

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 overflow-hidden select-none">
      <Toaster position="bottom-right" theme="dark" />

      {/* Top Titlebar / Header */}
      <Header
        state={hush.state}
        stateMessage={hush.stateMessage}
        engineState={hush.engineState}
        recording={hush.recording}
        activeModel={hush.config.model}
        connected={hush.connected}
        handsFreeMode={hush.handsFreeMode}
        onToggleDictation={hush.toggleDictation}
        onToggleHandsFree={hush.toggleHandsFreeMode}
      />

      {/* Main Tabs and Content Area */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Navigation Pill Bar */}
          <div className="flex items-center justify-between pb-3">
            <TabsList className="bg-neutral-900/90 border border-white/5 p-1 rounded-full">
              <TabsTrigger value="dictation" className="gap-2 text-xs">
                <Mic className="w-3.5 h-3.5" />
                <span>Dictation Pad</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 text-xs">
                <History className="w-3.5 h-3.5" />
                <span>History</span>
              </TabsTrigger>
              <TabsTrigger value="dictionary" className="gap-2 text-xs">
                <BookA className="w-3.5 h-3.5" />
                <span>Dictionary</span>
              </TabsTrigger>
              <TabsTrigger value="models" className="gap-2 text-xs">
                <Cpu className="w-3.5 h-3.5" />
                <span>AI Models</span>
              </TabsTrigger>
              <TabsTrigger value="hotkeys" className="gap-2 text-xs">
                <Keyboard className="w-3.5 h-3.5" />
                <span>Hotkeys</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-2 text-xs">
                <Settings className="w-3.5 h-3.5" />
                <span>Preferences</span>
              </TabsTrigger>
            </TabsList>

            {/* Hold hotkey reminder */}
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>Press</span>
              <kbd className="px-2 py-0.5 rounded-full bg-neutral-800 text-white font-mono font-bold text-[11px] border border-white/10 shadow-sm">
                {hush.config.hold_chord}
              </kbd>
              <span>to talk</span>
            </div>
          </div>

          {/* Scrollable Tab Views */}
          <div className="flex-1 overflow-y-auto pr-1">
            <TabsContent value="dictation" className="m-0 focus-visible:outline-none">
              <DictationPadTab
                state={hush.state}
                recording={hush.recording}
                streamingText={hush.streamingText}
                lastTranscription={hush.lastTranscription}
                micLevel={hush.micLevel}
                holdChord={hush.config.hold_chord}
                toggleCombo={hush.config.toggle_combo}
                activeModel={hush.config.model}
                onToggleDictation={hush.toggleDictation}
              />
            </TabsContent>

            <TabsContent value="history" className="m-0 focus-visible:outline-none">
              <HistoryTab
                history={hush.history}
                stats={hush.stats}
                onClearHistory={hush.clearHistory}
                onDeleteHistoryItem={hush.deleteHistoryItem}
              />
            </TabsContent>

            <TabsContent value="dictionary" className="m-0 focus-visible:outline-none">
              <DictionaryTab
                dictionary={hush.config.dictionary}
                onUpdateDictionary={(words) => hush.updateConfig("dictionary", words)}
              />
            </TabsContent>

            <TabsContent value="models" className="m-0 focus-visible:outline-none">
              <ModelsTab
                activeModel={hush.config.model}
                computeDevice={hush.config.compute_device}
                language={hush.config.language}
                models={hush.models}
                downloadProgress={hush.downloadProgress}
                onSelectModel={(m) => hush.loadModel(m)}
                onSelectComputeDevice={(d) => hush.updateConfig("compute_device", d)}
                onSelectLanguage={(l) => hush.updateConfig("language", l)}
                onDownloadModel={(m) => hush.downloadModel(m)}
              />
            </TabsContent>

            <TabsContent value="hotkeys" className="m-0 focus-visible:outline-none">
              <HotkeysTab
                holdChord={hush.config.hold_chord}
                toggleCombo={hush.config.toggle_combo}
                holdChordsList={hush.holdChords}
                toggleCombosList={hush.toggleCombos}
                onUpdateBindings={(hold, toggle) =>
                  hush.updateConfigs({ hold_chord: hold, toggle_combo: toggle })
                }
              />
            </TabsContent>

            <TabsContent value="preferences" className="m-0 focus-visible:outline-none">
              <PreferencesTab
                config={hush.config}
                devices={hush.devices}
                meterLevel={hush.meterLevel}
                onUpdateConfig={hush.updateConfig}
                onStartMeter={hush.startMeter}
                onStopMeter={hush.stopMeter}
                onPlaySound={hush.playSound}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Subtle Footer Bar */}
      <footer className="px-6 py-2 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-500 bg-neutral-950/60">
        <div className="flex items-center gap-3">
          <span>Hush v{appVersion}</span>
          <span>·</span>
          <span>OpenVINO Whisper int8</span>
          <span>·</span>
          <span className="text-emerald-500/90 font-medium">100% Offline Edge Native</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Your voice never leaves this computer</span>
        </div>
      </footer>
    </div>
  );
}
