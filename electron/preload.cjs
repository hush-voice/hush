const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  showMainWindow: () => ipcRenderer.send("window:show-main"),
  openDataFolder: () => ipcRenderer.send("open:data-folder"),
  openExternal: (url) => ipcRenderer.send("open:external", url),
  setAutostart: (enabled) => ipcRenderer.send("set:autostart", enabled),
  checkUpdate: () => ipcRenderer.send("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  getAuthToken: () => ipcRenderer.sendSync("app:get-auth-token-sync"),
  repositionOverlay: (dock) => ipcRenderer.send("overlay:reposition", dock),
  onUpdateChecking: (callback) => {
    ipcRenderer.on("update:checking", () => callback());
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update:available", (_event, data) => callback(data));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on("update:progress", (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update:downloaded", (_event, data) => callback(data));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update:not-available", (_event, info) => callback(info));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on("update:error", (_event, err) => callback(err));
  },
  restartEngine: () => ipcRenderer.send("engine:restart"),
  onEngineError: (callback) => {
    ipcRenderer.on("engine:error", (_event, err) => callback(err));
  },
});
