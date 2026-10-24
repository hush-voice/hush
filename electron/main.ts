import {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  shell,
  nativeImage,
} from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pythonProcess: ChildProcess | null = null;
let sessionAuthToken: string = "";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

app.commandLine.appendSwitch("wm-window-animations-disabled");

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getAppRoot(): string {
  return path.resolve(__dirname, "..");
}

function getAppIconPath(): string {
  const root = getAppRoot();
  const icoPath = path.join(root, "public", "icon.ico");
  const pngPath = path.join(root, "public", "icon.png");
  if (process.platform === "win32" && fs.existsSync(icoPath)) {
    return icoPath;
  }
  return pngPath;
}

process.on("uncaughtException", (err) => {
  console.error("[Hush] Uncaught exception in main process:", err);
});

function findPython(): { cmd: string; args: string[]; cwd?: string } {
  const root = getAppRoot();
  const engineCandidates = [
    path.join(process.resourcesPath, "engine", "hush-engine.exe"),
    path.join(process.resourcesPath, "engine", "Hush.exe"),
    path.join(process.resourcesPath, "hush-engine.exe"),
    path.join(process.resourcesPath, "Hush.exe"),
    path.join(root, "dist", "hush-engine", "hush-engine.exe"),
    path.join(root, "dist", "hush-engine", "Hush.exe"),
    path.join(root, "dist", "Hush", "Hush.exe"),
    path.join(root, "hush-engine.exe"),
    path.join(root, "Hush.exe"),
  ];
  const engine = engineCandidates.find((c) => fs.existsSync(c));
  if (engine) return { cmd: engine, args: [], cwd: path.dirname(engine) };

  const venvCandidates = [
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(process.resourcesPath, ".venv", "Scripts", "python.exe"),
  ];
  const venv = venvCandidates.find((c) => fs.existsSync(c));
  if (venv) return { cmd: venv, args: ["-m", "hush.service"], cwd: root };

  const localApp = process.env.LOCALAPPDATA || "";
  for (const v of ["Python313", "Python312", "Python311", "Python310"]) {
    const p = path.join(localApp, "Programs", "Python", v, "python.exe");
    if (fs.existsSync(p)) return { cmd: p, args: ["-m", "hush.service"], cwd: isDev ? root : process.resourcesPath };
  }

  for (const v of ["Python313", "Python312", "Python311", "Python310"]) {
    const p = path.join("C:\\", v, "python.exe");
    if (fs.existsSync(p)) return { cmd: p, args: ["-m", "hush.service"], cwd: isDev ? root : process.resourcesPath };
  }

  const winDir = process.env.WINDIR || "C:\\Windows";
  const pyLauncher = path.join(winDir, "py.exe");
  if (fs.existsSync(pyLauncher)) {
    return { cmd: pyLauncher, args: ["-3", "-m", "hush.service"], cwd: isDev ? root : process.resourcesPath };
  }

  return { cmd: "python", args: ["-m", "hush.service"], cwd: isDev ? root : process.resourcesPath };
}

function startPythonService() {
  if (pythonProcess) {
    try {
      pythonProcess.kill("SIGTERM");
    } catch {}
    pythonProcess = null;
  }

  const root = getAppRoot();
  const py = findPython();
  const serviceCwd = py.cwd || (isDev ? root : process.resourcesPath);
  if (!sessionAuthToken) {
    sessionAuthToken = process.env.HUSH_AUTH_TOKEN || require("crypto").randomBytes(16).toString("hex");
  }
  const env = {
    ...process.env,
    PYTHONPATH: isDev ? root : process.resourcesPath,
    HUSH_AUTH_TOKEN: sessionAuthToken,
  };

  console.log(`[Hush] Launching Python backend: ${py.cmd} ${py.args.join(" ")} (cwd: ${serviceCwd})`);
  try {
    pythonProcess = spawn(py.cmd, py.args, {
      cwd: serviceCwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    pythonProcess.on("error", (err) => {
      console.error("[Hush] Python process error:", err.message);
      pythonProcess = null;
      mainWindow?.webContents.send("engine:error", err.message);
      overlayWindow?.webContents.send("engine:error", err.message);
    });

    pythonProcess.stdout?.on("data", (data) => {
      const str = data.toString().trim();
      console.log(`[Python] ${str}`);
    });

    pythonProcess.stderr?.on("data", (data) => {
      console.error(`[Python Err] ${data.toString().trim()}`);
    });

    pythonProcess.on("close", (code) => {
      console.log(`[Python] exited with code ${code}`);
      pythonProcess = null;
      if (!isQuitting) {
        mainWindow?.webContents.send("engine:error", `Engine stopped (code ${code})`);
        overlayWindow?.webContents.send("engine:error", `Engine stopped (code ${code})`);
      }
    });
  } catch (err: any) {
    console.error("[Hush] Failed to spawn Python service:", err.message);
    mainWindow?.webContents.send("engine:error", err.message);
    overlayWindow?.webContents.send("engine:error", err.message);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 880,
    height: 680,
    minWidth: 780,
    minHeight: 560,
    frame: false,
    backgroundColor: "#09090b",
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(getAppRoot(), "dist-app", "index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1500);

  mainWindow.on("close", (event) => {
    // Hide to tray instead of quitting
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function positionOverlay(dockPosition: "bottom" | "top" = "bottom") {
  if (!overlayWindow) return;
  try {
    const cursorPos = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPos) || screen.getPrimaryDisplay();
    const { x: workX, y: workY, width, height } = activeDisplay.workArea;

    const overlayWidth = 400;
    const overlayHeight = 76;
    const x = Math.round(workX + (width - overlayWidth) / 2);
    const y = dockPosition === "top"
      ? Math.round(workY + 20)
      : Math.round(workY + height - overlayHeight - 20);

    overlayWindow.setBounds({ x, y, width: overlayWidth, height: overlayHeight });
  } catch (err) {
    console.error("[Hush] Failed to reposition overlay window:", err);
  }
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const overlayWidth = 400;
  const overlayHeight = 76;
  const x = Math.round((width - overlayWidth) / 2);
  const y = Math.round(height - overlayHeight - 20);

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: false,
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setMenu(null);
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setAlwaysOnTop(true, "screen-saver");

  if (isDev) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}/?window=overlay#overlay`);
  } else {
    overlayWindow.loadFile(path.join(getAppRoot(), "dist-app", "index.html"), {
      query: { window: "overlay" },
      hash: "overlay",
    });
  }

  overlayWindow.once("ready-to-show", () => {
    positionOverlay();
    overlayWindow?.showInactive();
  });
}

function createTray() {
  const iconPath = getAppIconPath();
  let icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);

  tray.setToolTip("Hush — 100% Local Voice Engine");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Hush — Local Voice Engine",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "Toggle Floating Pill",
      click: () => {
        if (overlayWindow?.isVisible()) {
          overlayWindow.hide();
        } else {
          overlayWindow?.showInactive();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Hush",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// IPC handlers
ipcMain.on("window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  win?.minimize();
});

ipcMain.on("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win === mainWindow && !isQuitting) {
    win?.hide();
  } else {
    win?.close();
  }
});


ipcMain.on("window:show-main", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

ipcMain.on("overlay:reposition", (_event, dockPosition?: "bottom" | "top") => {
  positionOverlay(dockPosition);
});

ipcMain.on("open:data-folder", () => {
  const localAppData = process.env.LOCALAPPDATA || "";
  const hushDir = path.join(localAppData, "Hush");
  if (fs.existsSync(hushDir)) {
    shell.openPath(hushDir);
  }
});

ipcMain.on("open:external", (_event, url: string) => {
  if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
    shell.openExternal(url);
  }
});

ipcMain.on("set:autostart", (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
  });
});

ipcMain.handle("app:version", () => {
  return app.getVersion();
});

ipcMain.on("app:get-auth-token-sync", (event) => {
  event.returnValue = sessionAuthToken;
});

function initAutoUpdater() {
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.forceDevUpdateConfig = true;

  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "yashavsarmal30",
      repo: "hush",
    });
  } catch (e) {
    console.error("[Hush] Failed to set update feed URL:", e);
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[Hush] Checking for software update...");
    mainWindow?.webContents.send("update:checking");
  });

  autoUpdater.on("update-available", (info: any) => {
    console.log("[Hush] Update available:", info?.version);
    mainWindow?.webContents.send("update:available", {
      version: info?.version,
      releaseDate: info?.releaseDate,
      releaseNotes: info?.releaseNotes,
    });
  });

  autoUpdater.on("download-progress", (progress: any) => {
    const pct = progress?.percent || 0;
    console.log(`[Hush] Download progress: ${Math.round(pct)}%`);
    mainWindow?.webContents.send("update:progress", {
      percent: pct,
      bytesPerSecond: progress?.bytesPerSecond || 0,
      transferred: progress?.transferred || 0,
      total: progress?.total || 0,
    });
  });

  autoUpdater.on("update-downloaded", (info: any) => {
    console.log("[Hush] Update successfully downloaded:", info?.version);
    mainWindow?.webContents.send("update:downloaded", {
      version: info?.version,
      releaseDate: info?.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (info: any) => {
    console.log("[Hush] Update not available. Already on latest version:", app.getVersion());
    mainWindow?.webContents.send("update:not-available", {
      currentVersion: app.getVersion(),
      latestVersion: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on("error", (err: any) => {
    console.error("[Hush] autoUpdater encountered error:", err);
    mainWindow?.webContents.send("update:error", err?.message || String(err));
  });
}

ipcMain.on("update:check", async () => {
  console.log("[Hush] Received manual update:check");
  mainWindow?.webContents.send("update:checking");
  try {
    const checkResult = await autoUpdater.checkForUpdates();
    console.log("[Hush] checkForUpdates finished, updateInfo:", checkResult?.updateInfo?.version);
  } catch (err: any) {
    console.error("[Hush] checkForUpdates error:", err);
    mainWindow?.webContents.send("update:error", err?.message || String(err));
  }
});

ipcMain.on("update:install", () => {
  console.log("[Hush] User requested update:install. Terminating engine and installing...");
  isQuitting = true;
  if (pythonProcess) {
    try {
      pythonProcess.kill("SIGTERM");
    } catch {}
    pythonProcess = null;
  }
  // isSilent = false (show installer), isForceRunAfter = true (relaunch app)
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on("engine:restart", () => {
  startPythonService();
});

let isQuitting = false;

app.whenReady().then(() => {
  startPythonService();
  createMainWindow();
  createOverlayWindow();
  createTray();

  screen.on("display-metrics-changed", () => {
    positionOverlay();
  });
  screen.on("display-removed", () => {
    positionOverlay();
  });

  initAutoUpdater();
  // Auto-check on launch after 3 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: any) => {
      console.log("[Hush] Background initial update check note:", err?.message || err);
    });
  }, 3000);


  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createOverlayWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (pythonProcess) {
    console.log("[Hush] Terminating Python service on quit...");
    pythonProcess.kill("SIGTERM");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});
