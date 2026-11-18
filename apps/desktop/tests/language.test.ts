import { describe, expect, it } from "vitest";
import {
  isAppLanguage,
  resolveAppLanguage,
  SUPPORTED_APP_LANGUAGES,
} from "../src/main/language.js";

describe("resolveAppLanguage", () => {
  it("maps Polish locales to pl", () => {
    expect(resolveAppLanguage("pl")).toBe("pl");
    expect(resolveAppLanguage("pl-PL")).toBe("pl");
    expect(resolveAppLanguage("pl_PL")).toBe("pl");
    expect(resolveAppLanguage("PL-pl")).toBe("pl");
  });

  it("maps English locales to en", () => {
    expect(resolveAppLanguage("en")).toBe("en");
    expect(resolveAppLanguage("en-US")).toBe("en");
    expect(resolveAppLanguage("en_GB")).toBe("en");
  });

  it("falls back to English for unsupported system languages", () => {
    expect(resolveAppLanguage("de-DE")).toBe("en");
    expect(resolveAppLanguage("fr")).toBe("en");
    expect(resolveAppLanguage("ja-JP")).toBe("en");
    expect(resolveAppLanguage("")).toBe("en");
    expect(resolveAppLanguage("  ")).toBe("en");
  });

  it("exposes only en and pl as supported app languages", () => {
    expect(SUPPORTED_APP_LANGUAGES).toEqual(["en", "pl"]);
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("pl")).toBe(true);
    expect(isAppLanguage("de")).toBe(false);
  });
});
