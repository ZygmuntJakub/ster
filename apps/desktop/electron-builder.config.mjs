/**
 * electron-builder config derived from `resources/brand.json` (T130 / FR-043).
 *
 * Signing: leave identity fields unset for unsigned / ad hoc builds. See docs/signing.md
 * for CSC_LINK / CSC_KEY_PASSWORD (Windows), APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD /
 * APPLE_TEAM_ID (macOS notarization), and when to set `forceCodeSigning`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(join(here, "resources/brand.json"), "utf8"));

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: brand.appId,
  productName: brand.productName,
  copyright: `Copyright © ${new Date().getFullYear()} ${brand.productName}`,
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  asar: true,
  asarUnpack: [],
  afterPack: "./scripts/fuses.mjs",
  // artifactName keeps the product name visible in draft release assets.
  artifactName: `${brand.productName}-\${version}-\${os}-\${arch}.\${ext}`,
  mac: {
    category: "public.app-category.developer-tools",
    // Ad hoc signature is applied by electron-builder on Apple silicon when no
    // CSC_LINK is present. release.yml runs `codesign --verify` after the build.
    identity: null,
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
  },
  win: {
    // CSC_LINK / CSC_KEY_PASSWORD — see docs/signing.md
    target: [{ target: "nsis", arch: ["x64", "arm64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    category: "Development",
    target: [
      { target: "AppImage", arch: ["x64", "arm64"] },
      { target: "deb", arch: ["x64", "arm64"] },
    ],
  },
};

export default config;
