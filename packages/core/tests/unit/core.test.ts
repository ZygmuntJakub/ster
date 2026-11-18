import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCore, isSterError, parseBrand } from "../../src/index.js";

const brand = parseBrand({
  productName: "Ster",
  appId: "com.example.ster",
  dataDirName: "Ster",
  policyDirName: "SterPolicy",
  icon: "icon.png",
  colors: { accent: "#000000" },
});

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ster-core-"));
  tempDirs.push(dir);
  return dir;
}

describe("createCore", () => {
  it("opens the store, exposes settings/policy/events, and dispose is idempotent", async () => {
    const dataDir = tempDataDir();
    const core = await createCore({
      dataDir,
      brand,
      policySources: [],
      environment: { PATH: "/usr/bin", HOME: dataDir },
      includeMockAgent: false,
    });

    expect(core.brand.productName).toBe("Ster");
    expect(core.policy.state).toBe("absent");
    expect(core.settings.get().language).toBe("en");
    expect(core.environment.PATH).toBe("/usr/bin");
    expect(await core.agents.list()).toEqual([]);
    expect(await core.sessions.list()).toEqual([]);

    core.settings.set({ theme: "dark" });
    expect(core.settings.get().theme).toBe("dark");

    await core.dispose();
    await core.dispose();
  });

  it("loads policy sources without failing creation when a document is present", async () => {
    const dataDir = tempDataDir();
    const core = await createCore({
      dataDir,
      brand,
      policySources: [
        {
          kind: "builtin",
          label: "test",
          load: () => Promise.resolve({ version: 1 }),
        },
      ],
      environment: { PATH: "/usr/bin" },
      includeMockAgent: false,
    });

    expect(core.policy.state).toBe("valid");
    await core.dispose();
  });

  it("rejects an unusable data directory", async () => {
    const parent = tempDataDir();
    const asFile = join(parent, "not-a-dir");
    writeFileSync(asFile, "x");

    await expect(
      createCore({
        dataDir: join(asFile, "child"),
        brand,
        policySources: [],
        environment: { PATH: "/usr/bin" },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => isSterError(error) && error.code === "invalid-argument",
    );
  });
});
