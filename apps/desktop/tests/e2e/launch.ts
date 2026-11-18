import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
}

/**
 * Launch the Electron app built by electron-vite for Playwright end-to-end tests.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: [resolve(desktopRoot, "out/main/index.js")],
    cwd: desktopRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}
