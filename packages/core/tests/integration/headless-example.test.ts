import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("examples/headless.ts", () => {
  it("drives the core without a UI and prints a successful run record", async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", join(repoRoot, "examples/headless.ts")],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const lines = stdout
      .trim()
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"));
    expect(lines.length).toBeGreaterThan(0);
    const payload = JSON.parse(lines[lines.length - 1] ?? "{}") as {
      ok?: boolean;
      productName?: string;
      run?: { outcome?: string; stopReason?: string };
      itemKinds?: string[];
    };

    expect(payload.ok).toBe(true);
    expect(payload.productName).toBe("Ster");
    expect(payload.run?.outcome).toBe("completed");
    expect(payload.run?.stopReason).toBe("end_turn");
    expect(payload.itemKinds).toContain("agent-message");
    // Logs may land on stderr; a crash would produce a non-zero exit (thrown by execFile).
    expect(typeof stderr).toBe("string");
  }, 60_000);
});
