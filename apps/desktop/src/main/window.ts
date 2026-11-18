import type { Brand } from "@ster/core";
import { BrowserWindow, session } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { windowTitleFromBrand } from "./brand-surface.js";

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return join(__dirname, "../preload/index.cjs");
}

/**
 * Apply session-level hardening once (CSP headers, permission denial, network filter).
 * Renderer traffic is limited to the app origin; registry/download HTTPS runs in main.
 */
export function applySessionHardening(): void {
  const ses = session.defaultSession;

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers["Content-Security-Policy"] = [CSP];
    callback({ responseHeaders: headers });
  });

  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === "file:" || url.protocol === "devtools:" || url.protocol === "data:") {
        callback({});
        return;
      }
      if (url.protocol === "http:" || url.protocol === "https:") {
        // Renderer must not reach the network; main-process Node fetch is separate.
        callback({ cancel: true });
        return;
      }
      callback({});
    } catch {
      callback({ cancel: true });
    }
  });

  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  ses.setPermissionCheckHandler(() => false);
}

/**
 * Create the main application window with sandbox + context isolation (research.md R9).
 */
export function createMainWindow(brand: Brand): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: windowTitleFromBrand(brand),
    backgroundColor: "#E7E7E4",
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.once("ready-to-show", () => {
    win.show();
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
