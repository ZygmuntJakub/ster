import { describe, expect, it } from "vitest";
import { isSterError, isSterErrorCode, SterError, STER_ERROR_CODES } from "../../src/errors.js";

describe("SterError", () => {
  it("exposes every stable code from the contract", () => {
    expect(STER_ERROR_CODES).toEqual([
      "policy-invalid",
      "blocked-by-policy",
      "agent-not-ready",
      "agent-not-confirmed",
      "integrity-failed",
      "login-required",
      "protocol-unsupported",
      "agent-exited",
      "outside-workspace",
      "not-resumable",
      "definition-invalid",
      "definition-untrusted",
      "not-found",
      "invalid-argument",
    ]);
    for (const code of STER_ERROR_CODES) {
      expect(isSterErrorCode(code)).toBe(true);
      const err = new SterError(code, "x");
      expect(isSterError(err)).toBe(true);
      expect(err.code).toBe(code);
    }
  });
});
