/**
 * Flip Electron fuses after packaging (research.md R9).
 * Wired as electron-builder `afterPack` hook.
 */
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const productName = packager.appInfo.productFilename;

  let electronBinary;
  if (electronPlatformName === "darwin") {
    electronBinary = join(appOutDir, `${productName}.app`, "Contents", "MacOS", productName);
  } else if (electronPlatformName === "win32") {
    electronBinary = join(appOutDir, `${productName}.exe`);
  } else {
    electronBinary = join(appOutDir, productName);
  }

  if (!existsSync(electronBinary)) {
    throw new Error(`Electron binary not found for fuse flip: ${electronBinary}`);
  }

  // Ensure the binary is writable before patching fuses.
  chmodSync(electronBinary, 0o755);

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  });
}
