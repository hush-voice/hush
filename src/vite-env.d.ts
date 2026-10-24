/// <reference types="vite/client" />

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.ico" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

interface Window {
  electronAPI?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    showMainWindow: () => void;
    openDataFolder: () => void;
    openExternal: (url: string) => void;
    setAutostart: (enabled: boolean) => void;
    checkUpdate: () => void;
    installUpdate: () => void;
    getAppVersion: () => Promise<string>;
    getAuthToken?: () => string;
    repositionOverlay?: (dock?: "bottom" | "top") => void;
    onUpdateChecking: (callback: () => void) => void;
    onUpdateAvailable: (callback: (data: { version: string; releaseDate?: string; releaseNotes?: any }) => void) => void;
    onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
    onUpdateDownloaded: (callback: (data: { version: string; releaseDate?: string }) => void) => void;
    onUpdateNotAvailable: (callback: (info: { currentVersion: string; latestVersion: string }) => void) => void;
    onUpdateError: (callback: (err: string) => void) => void;
    restartEngine: () => void;
    onEngineError: (callback: (err: string) => void) => void;
  };
}
