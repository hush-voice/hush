import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  showMainWindow: () => ipcRenderer.send("window:show-main"),
  openDataFolder: () => ipcRenderer.send("open:data-folder"),
  setAutostart: (enabled: boolean) => ipcRenderer.send("set:autostart", enabled),
  repositionOverlay: (dock?: "bottom" | "top") => ipcRenderer.send("overlay:reposition", dock),
  getAuthToken: () => ipcRenderer.sendSync("app:get-auth-token-sync"),
});
