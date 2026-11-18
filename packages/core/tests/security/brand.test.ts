import { describe, expect, it } from "vitest";
import { parseBrand } from "../../src/brand.js";
import { SterError } from "../../src/errors.js";

/**
 * Brand JSON is host-supplied configuration treated as untrusted input at the boundary.
 */
describe("brand security", () => {
  it("rejects prototype-pollution style keys via strict schema", () => {
    expect(() =>
      parseBrand({
        productName: "Ster",
        appId: "ster-desktop",
        dataDirName: "Ster",
        policyDirName: "Ster",
        icon: "icon.png",
        colors: { accent: "#000" },
        __proto__: { admin: true },
      }),
    ).toThrow(SterError);
  });

  it("rejects non-object brand payloads", () => {
    expect(() => parseBrand(null)).toThrow(SterError);
    expect(() => parseBrand("Ster")).toThrow(SterError);
  });
});
