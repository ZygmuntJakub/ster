#!/usr/bin/env node
/**
 * EN/PL key-parity check. Full i18n wiring lands in T033; until those files exist
 * this script reports a soft skip so `pnpm check` can run during Phase 1 setup.
 */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enPath = path.join(root, "apps/desktop/src/renderer/i18n/en.json");
const plPath = path.join(root, "apps/desktop/src/renderer/i18n/pl.json");

async function exists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function flattenKeys(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, next);
  });
}

const enExists = await exists(enPath);
const plExists = await exists(plPath);

if (!enExists || !plExists) {
  console.log("check-i18n: en.json/pl.json not present yet (expected until T033); skipping");
  process.exit(0);
}

const en = JSON.parse(await readFile(enPath, "utf8"));
const pl = JSON.parse(await readFile(plPath, "utf8"));
const enKeys = new Set(flattenKeys(en));
const plKeys = new Set(flattenKeys(pl));

const missingInPl = [...enKeys].filter((key) => !plKeys.has(key)).sort();
const missingInEn = [...plKeys].filter((key) => !enKeys.has(key)).sort();

if (missingInPl.length > 0 || missingInEn.length > 0) {
  if (missingInPl.length > 0) {
    console.error("Keys missing in pl.json:\n" + missingInPl.map((k) => `  - ${k}`).join("\n"));
  }
  if (missingInEn.length > 0) {
    console.error("Keys missing in en.json:\n" + missingInEn.map((k) => `  - ${k}`).join("\n"));
  }
  process.exit(1);
}

console.log(`check-i18n: ${String(enKeys.size)} keys match between en.json and pl.json`);
