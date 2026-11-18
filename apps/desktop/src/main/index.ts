import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Electron main entry. Hardening (sandbox, CSP, navigation denial) lands in T029.
 */
function resolvePreloadPath(): string {
  const mjs = join(__dirname, "../preload/index.mjs");
  if (existsSync(mjs)) {
    return mjs;
  }
  return join(__dirname, "../preload/index.js");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
