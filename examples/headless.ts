/**
 * Headless example (FR-061). Drives the core without a UI.
 * Session/prompt against mock-agent arrives with US1; this proves createCore + dispose.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE_VERSION, createCore, parseBrand } from "@ster/core";

const dataDir = mkdtempSync(join(tmpdir(), "ster-headless-"));

const brand = parseBrand({
  productName: "Ster",
  appId: "app.ster.desktop",
  dataDirName: "Ster",
  policyDirName: "SterPolicy",
  icon: "icon.png",
  colors: { accent: "#111111" },
});

const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === "string") {
    environment[key] = value;
  }
}

const core = await createCore({
  dataDir,
  brand,
  policySources: [],
  environment,
});

const settings = core.settings.get();
await core.dispose();
rmSync(dataDir, { recursive: true, force: true });

console.log(
  JSON.stringify({
    ok: true,
    coreVersion: CORE_VERSION,
    productName: brand.productName,
    language: settings.language,
    policyState: core.policy.state,
  }),
);
