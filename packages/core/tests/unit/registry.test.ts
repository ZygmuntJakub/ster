import { describe, expect, it } from "vitest";
import { parseRegistryDocument } from "../../src/agents/registry.js";
import {
  detectMusl,
  resolvePlatformInfo,
  resolvePlatformKey,
  selectBinaryTarget,
} from "../../src/agents/platform.js";
import { readinessForRegistryEntry } from "../../src/agents/plan.js";

describe("registry parsing", () => {
  it("keeps known fields and ignores unknown keys", () => {
    const doc = parseRegistryDocument({
      version: "1.0.0",
      extensions: { ignored: true },
      agents: [
        {
          id: "demo",
          name: "Demo",
          version: "1.2.3",
          description: "x",
          mystery: 42,
          distribution: {
            binary: {
              "darwin-aarch64": {
                archive: "https://example.com/a.tar.gz",
                cmd: "./demo",
                sha256: "abc",
                extra: true,
              },
            },
            npx: { package: "@demo/agent@1.2.3" },
          },
        },
        { id: "broken" },
      ],
    });
    expect(doc.agents).toHaveLength(1);
    expect(doc.agents[0]?.id).toBe("demo");
    expect(doc.agents[0]?.distribution.npx?.package).toBe("@demo/agent@1.2.3");
  });
});

describe("platform key resolution", () => {
  it("resolves darwin and linux keys", () => {
    expect(resolvePlatformKey({ platform: "darwin", arch: "arm64", isMusl: false })).toBe(
      "darwin-aarch64",
    );
    expect(resolvePlatformKey({ platform: "linux", arch: "x64", isMusl: false })).toBe(
      "linux-x86_64",
    );
    expect(resolvePlatformKey({ platform: "linux", arch: "x64", isMusl: true })).toBe(
      "linux-x86_64-musl",
    );
    expect(resolvePlatformKey({ platform: "win32", arch: "x64", isMusl: false })).toBe(
      "windows-x86_64",
    );
  });

  it("detects musl via alpine release file", () => {
    expect(
      detectMusl({
        platform: "linux",
        exists: (path) => path === "/etc/alpine-release",
      }),
    ).toBe(true);
    expect(
      detectMusl({
        platform: "linux",
        exists: (path) => path === "/lib/ld-musl-x86_64.so.1",
      }),
    ).toBe(true);
    expect(
      detectMusl({
        platform: "linux",
        exists: () => false,
      }),
    ).toBe(false);
    expect(
      detectMusl({
        platform: "darwin",
        exists: () => true,
      }),
    ).toBe(false);
  });

  it("resolves platform info and rejects unsupported hosts", () => {
    expect(resolvePlatformInfo({ platform: "darwin", arch: "arm64", isMusl: false })).toEqual({
      os: "darwin",
      arch: "aarch64",
      isMusl: false,
      key: "darwin-aarch64",
    });
    expect(resolvePlatformInfo({ platform: "linux", arch: "x64", isMusl: true }).key).toBe(
      "linux-x86_64-musl",
    );
    expect(() => resolvePlatformKey({ platform: "aix" as NodeJS.Platform, arch: "x64" })).toThrow(
      /Unsupported platform/u,
    );
    expect(selectBinaryTarget(undefined, "darwin-aarch64")).toBeUndefined();
  });

  it("does not fall back from musl to glibc binary targets", () => {
    const binary = {
      "linux-x86_64": { archive: "https://example.com/glibc", cmd: "./a" },
      "linux-x86_64-musl": { archive: "https://example.com/musl", cmd: "./a" },
    };
    expect(selectBinaryTarget(binary, "linux-x86_64-musl")?.archive).toContain("musl");
    expect(
      selectBinaryTarget({ "linux-x86_64": binary["linux-x86_64"] }, "linux-x86_64-musl"),
    ).toBe(undefined);
  });
});

describe("readiness derivation", () => {
  const entry = {
    id: "x",
    name: "X",
    version: "2.0.0",
    distribution: {
      binary: {
        "darwin-aarch64": { archive: "https://example.com/a", cmd: "./x" },
      },
    },
  };

  it("marks missing platform as unavailable and newer registry version as update-available", () => {
    expect(
      readinessForRegistryEntry({
        entry,
        platformKey: "linux-x86_64",
        uvAvailable: false,
      }),
    ).toBe("unavailable");
    expect(
      readinessForRegistryEntry({
        entry,
        platformKey: "darwin-aarch64",
        uvAvailable: false,
      }),
    ).toBe("not-installed");
    expect(
      readinessForRegistryEntry({
        entry,
        platformKey: "darwin-aarch64",
        uvAvailable: false,
        installedVersion: "1.0.0",
      }),
    ).toBe("update-available");
  });
});
