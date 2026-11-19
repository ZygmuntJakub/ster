import type { Brand } from "@ster/core";

/**
 * Pure brand→surface helpers so tests can prove single-sourcing without launching Electron.
 */
export function windowTitleFromBrand(brand: Brand): string {
  return brand.productName;
}

export function aboutTextFromBrand(brand: Brand, version: string): string {
  return `${brand.productName} ${version}`;
}

export function dataDirSegmentFromBrand(brand: Brand): string {
  return brand.dataDirName;
}

export function installerIdentityFromBrand(brand: Brand): {
  appId: string;
  productName: string;
} {
  return { appId: brand.appId, productName: brand.productName };
}
