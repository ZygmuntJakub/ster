import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBrandFromJson, parseBrand } from "@ster/core";
import {
  aboutTextFromBrand,
  dataDirSegmentFromBrand,
  installerIdentityFromBrand,
  windowTitleFromBrand,
} from "../src/main/brand-surface.js";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const brandPath = join(desktopRoot, "resources/brand.json");
const builderConfigPath = join(desktopRoot, "electron-builder.config.mjs");

describe("brand single-sourcing", () => {
  it("loads resources/brand.json and drives window, about, data dir, installer identity", () => {
    const brand = loadBrandFromJson(readFileSync(brandPath, "utf8"));
    expect(brand.productName.length).toBeGreaterThan(0);
    expect(windowTitleFromBrand(brand)).toBe(brand.productName);
    expect(aboutTextFromBrand(brand, "1.2.3")).toBe(`${brand.productName} 1.2.3`);
    expect(dataDirSegmentFromBrand(brand)).toBe(brand.dataDirName);
    expect(installerIdentityFromBrand(brand)).toEqual({
      appId: brand.appId,
      productName: brand.productName,
    });
  });

  it("keeps electron-builder.config.mjs aligned with brand.json", () => {
    const brand = parseBrand(JSON.parse(readFileSync(brandPath, "utf8")));
    const source = readFileSync(builderConfigPath, "utf8");
    expect(source).toContain('readFileSync(join(here, "resources/brand.json")');
    expect(source).toContain("appId: brand.appId");
    expect(source).toContain("productName: brand.productName");
    expect(source).toContain("${brand.productName}");
    expect(brand.appId.length).toBeGreaterThan(0);
    expect(brand.productName.length).toBeGreaterThan(0);
  });
});
