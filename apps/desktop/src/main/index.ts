import { app, BrowserWindow } from "electron";
import { aboutTextFromBrand } from "./brand-surface.js";
import { registerBridge } from "./bridge.js";
import { startCoreHost, type CoreHost } from "./core-host.js";
import { applySessionHardening, createMainWindow } from "./window.js";

let host: CoreHost | undefined;
let disposeBridge: (() => void) | undefined;

async function boot(): Promise<void> {
  applySessionHardening();
  host = await startCoreHost();
  disposeBridge = registerBridge(host);

  app.setName(host.brand.productName);
  if (process.platform === "darwin") {
    app.setAboutPanelOptions({
      applicationName: host.brand.productName,
      applicationVersion: host.version,
      copyright: aboutTextFromBrand(host.brand, host.version),
    });
  }

  createMainWindow(host.brand);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && host) {
      createMainWindow(host.brand);
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
