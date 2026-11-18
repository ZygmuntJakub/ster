import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBrandFromJson, parseBrand } from "../../src/brand.js";
import { SterError } from "../../src/errors.js";

const repoBrand = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../apps/desktop/resources/brand.json",
);

describe("parseBrand", () => {
  it("accepts the desktop brand.json", async () => {
    const text = await readFile(repoBrand, "utf8");
    const brand = loadBrandFromJson(text);
    expect(brand.productName).toBe("Ster");
    expect(brand.appId).toBe("ster-desktop");
    expect(brand.dataDirName).toBe("Ster");
    expect(brand.policyDirName).toBe("Ster");
  });

  it("rejects unknown keys and empty fields", () => {
    expect(() => parseBrand({ productName: "" })).toThrow(SterError);
    expect(() =>
      parseBrand({
        productName: "Ster",
        appId: "ster-desktop",
        dataDirName: "Ster",
        policyDirName: "Ster",
        icon: "icon.png",
        colors: {},
        extra: true,
      }),
    ).toThrow(SterError);
  });
});
