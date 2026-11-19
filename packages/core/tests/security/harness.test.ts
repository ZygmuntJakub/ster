import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../package.json",
);

describe("core security harness", () => {
  it("does not declare electron as a dependency", async () => {
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["electron"]).toBeUndefined();
    expect(pkg.devDependencies?.["electron"]).toBeUndefined();
  });
});
