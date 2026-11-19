#!/usr/bin/env node
/**
 * EN/PL key-parity check plus a hard-coded UI string scan for the renderer (T033 / T127).
 */
import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enPath = path.join(root, "apps/desktop/src/renderer/i18n/en.json");
const plPath = path.join(root, "apps/desktop/src/renderer/i18n/pl.json");
const rendererRoot = path.join(root, "apps/desktop/src/renderer");

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

async function collectTsxFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n" || entry.name === "node_modules") {
        continue;
      }
      files.push(...(await collectTsxFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Flag JSX text nodes that look like user-facing copy and are not clearly dynamic.
 * Allowlisted tokens cover brand, language endonyms, and intentional raw markers.
 */
const ALLOWED_TEXT = new Set(["Ster", "English", "Polski", "i18n", "OK", "USD"]);

// Only match text between a real JSX tag close (`…>` / `…/>`) and the next tag.
// Lookbehind avoids TypeScript generics such as `Promise<void>`.
const JSX_TEXT_RE = /(?<=[\w"'`/])>\s*([A-Za-zÀ-ÿ][^<>{}\n]*?)\s*</gu;

function scanHardCodedStrings(source, filePath) {
  const findings = [];
  for (const match of source.matchAll(JSX_TEXT_RE)) {
    const text = (match[1] ?? "").replace(/\s+/gu, " ").trim();
    if (!text) {
      continue;
    }
    // Skip pure punctuation, numbers, version chips, slash commands.
    if (!/[A-Za-zÀ-ÿ]{3,}/u.test(text)) {
      continue;
    }
    if (/^v?\d/u.test(text) || text.startsWith("/")) {
      continue;
    }
    if (ALLOWED_TEXT.has(text)) {
      continue;
    }
    // Skip code-like fragments that slipped through.
    if (/[=;]|useState|Promise|import |return /u.test(text)) {
      continue;
    }
    findings.push({ filePath, text });
  }
  return findings;
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

let failed = false;

if (missingInPl.length > 0 || missingInEn.length > 0) {
  failed = true;
  if (missingInPl.length > 0) {
    console.error("Keys missing in pl.json:\n" + missingInPl.map((k) => `  - ${k}`).join("\n"));
  }
  if (missingInEn.length > 0) {
    console.error("Keys missing in en.json:\n" + missingInEn.map((k) => `  - ${k}`).join("\n"));
  }
}

const tsxFiles = await collectTsxFiles(rendererRoot);
const hardCoded = [];
for (const file of tsxFiles) {
  const source = await readFile(file, "utf8");
  hardCoded.push(...scanHardCodedStrings(source, path.relative(root, file)));
}

if (hardCoded.length > 0) {
  failed = true;
  console.error(
    "Hard-coded UI strings in renderer (use t(...) / i18n keys):\n" +
      hardCoded.map((item) => `  - ${item.filePath}: "${item.text}"`).join("\n"),
  );
}

if (failed) {
  process.exit(1);
}

console.log(
  `check-i18n: ${String(enKeys.size)} keys match between en.json and pl.json; no hard-coded renderer UI strings`,
);
