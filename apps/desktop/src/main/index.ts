import { app, BrowserWindow } from "electron";
import { registerBridge } from "./bridge.js";
import { startCoreHost, type CoreHost } from "./core-host.js";
import { applySessionHardening, createMainWindow } from "./window.js";

let host: CoreHost | undefined;
let disposeBridge: (() => void) | undefined;

async function boot(): Promise<void> {
  applySessionHardening();
  host = await startCoreHost();
  disposeBridge = registerBridge(host);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

void app.whenReady().then(() => {
  void boot().catch((error: unknown) => {
    console.error("desktop boot failed", error);
    app.exit(1);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  disposeBridge?.();
  disposeBridge = undefined;
  if (host) {
    void host.dispose();
    host = undefined;
  }
});
