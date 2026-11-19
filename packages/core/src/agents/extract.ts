import { execFile } from "node:child_process";
import { createGunzip } from "node:zlib";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { SterError } from "../errors.js";

const execFileAsync = promisify(execFile);

function assertSafeEntryName(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new SterError("invalid-argument", "Archive entry path is unsafe", { name });
  }
  return normalized;
}

async function readGunzipped(archivePath: string): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(archivePath);
    const gunzip = createGunzip();
    gunzip.on("data", (chunk: Buffer) => {
      chunks.push(Uint8Array.from(chunk));
    });
    gunzip.on("error", reject);
    gunzip.on("end", () => {
      resolve();
    });
    input.on("error", reject);
    input.pipe(gunzip);
  });
  return Buffer.concat(chunks);
}

/**
 * Minimal ustar .tar.gz extractor with path-traversal rejection (R6).
 */
export async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  const data = await readGunzipped(archivePath);
  let offset = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((b) => b === 0)) {
      break;
    }
    const name = assertSafeEntryName(header.subarray(0, 100).toString("utf8").replace(/\0.*$/, ""));
    if (!name) {
      continue;
    }
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeOctal || "0", 8);
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    const fileData = data.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (typeFlag === "5" || name.endsWith("/")) {
      mkdirSync(join(destDir, name), { recursive: true });
      continue;
    }
    if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "") {
      continue;
    }
    const outPath = join(destDir, name);
    const resolved = normalize(outPath);
    const root = normalize(destDir);
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw new SterError("invalid-argument", "Archive entry escapes destination", { name });
    }
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, fileData, { mode: 0o755 });
  }
}

/**
 * Extract a .zip archive (macOS/Windows registry binaries). Prefer `tar -xf`,
 * then `unzip`, PowerShell on Windows — same approach as managed Node install.
 */
export async function extractZip(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  try {
    await execFileAsync("tar", ["-xf", archivePath, "-C", destDir]);
  } catch {
    await execFileAsync("unzip", ["-o", archivePath, "-d", destDir]);
  }
}

/**
 * Copy a raw (non-archive) download into dest as the launch command path.
 */
export async function installRawBinary(
  archivePath: string,
  destDir: string,
  cmd: string,
): Promise<string> {
  const relative = assertSafeEntryName(cmd.replace(/^\.\//, ""));
  const outPath = join(destDir, relative);
  mkdirSync(dirname(outPath), { recursive: true });
  await pipeline(createReadStream(archivePath), createWriteStream(outPath, { mode: 0o755 }));
  if (!existsSync(outPath)) {
    throw new SterError("invalid-argument", "Failed to install raw binary", { outPath });
  }
  return outPath;
}

export function isTarGz(urlOrPath: string): boolean {
  return /\.tar\.gz($|\?)/i.test(urlOrPath) || /\.tgz($|\?)/i.test(urlOrPath);
}

export function isZip(urlOrPath: string): boolean {
  return /\.zip($|\?)/i.test(urlOrPath);
}

/** ZIP local-file header magic (`PK\x03\x04`). */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
