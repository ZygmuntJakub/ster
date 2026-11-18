import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asSafeUpdateRecord,
  MAX_AGENT_TEXT_CHARS,
  sanitizeAgentText,
  stripControlSequences,
} from "../../src/sessions/content-safety.js";
import {
  assertAllowedHttpsUrl,
  createNetworkAllowlist,
  PUBLIC_REGISTRY_HOST,
} from "../../src/net/allowlist.js";
import { createRegistryClient } from "../../src/agents/registry.js";
import { isSterError } from "../../src/errors.js";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent content safety (SC-016)", () => {
  it("strips control sequences from agent text", () => {
    expect(stripControlSequences("hi\u001b[31mRED\u001b[0m")).toBe("hiRED");
    const sanitized = sanitizeAgentText("x\u001b]0;title\u0007y");
    expect(sanitized.text).toBe("xy");
    expect(sanitized.truncated).toBe(false);
  });

  it("truncates oversized agent text", () => {
    const huge = "a".repeat(MAX_AGENT_TEXT_CHARS + 50);
    const sanitized = sanitizeAgentText(huge);
    expect(sanitized.truncated).toBe(true);
    expect(sanitized.text.length).toBe(MAX_AGENT_TEXT_CHARS);
  });

  it("rejects malformed update payloads", () => {
    expect(asSafeUpdateRecord(null)).toBeNull();
    expect(asSafeUpdateRecord("x")).toBeNull();
    expect(asSafeUpdateRecord([1, 2])).toBeNull();
    expect(asSafeUpdateRecord({ sessionUpdate: "notice" })).toEqual({
      sessionUpdate: "notice",
    });
  });

  it("does not treat HTML script tags as executable when stored as text", () => {
    const payload = "<script>alert(1)</script>";
    const sanitized = sanitizeAgentText(payload);
    expect(sanitized.text).toBe(payload);
    expect(sanitized.text.includes("<script>")).toBe(true);
  });
});

describe("network allow-list (FR-042, FR-046, SC-012)", () => {
  it("allows the public registry host when enabled", () => {
    const allow = createNetworkAllowlist({ registryEnabled: true });
    const url = assertAllowedHttpsUrl(
      `https://${PUBLIC_REGISTRY_HOST}/registry/v1/latest/registry.json`,
      allow,
    );
    expect(url.hostname).toBe(PUBLIC_REGISTRY_HOST);
  });

  it("blocks all network when registry is disabled and no download hosts", () => {
    const allow = createNetworkAllowlist({
      registryEnabled: false,
      includePublicRegistry: false,
    });
    expect(() => assertAllowedHttpsUrl(`https://${PUBLIC_REGISTRY_HOST}/x`, allow)).toThrow(
      /disabled|allow-list|blocked/i,
    );
    try {
      assertAllowedHttpsUrl("https://evil.example/x", allow);
    } catch (error) {
      expect(isSterError(error)).toBe(true);
      if (isSterError(error)) {
        expect(error.code).toBe("blocked-by-policy");
      }
    }
  });

  it("allows confirmed download hosts only", () => {
    const allow = createNetworkAllowlist({
      registryEnabled: false,
      includePublicRegistry: false,
      downloadHosts: ["downloads.example"],
    });
    expect(assertAllowedHttpsUrl("https://downloads.example/a.bin", allow).host).toBe(
      "downloads.example",
    );
    expect(() => assertAllowedHttpsUrl("http://downloads.example/a.bin", allow)).toThrow(/https/i);
  });

  it("makes no fetch when registry mode is disabled", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ster-reg-disabled-"));
    tempDirs.push(dataDir);
    let fetches = 0;
    const client = createRegistryClient({
      dataDir,
      mode: "disabled",
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- vitest mock shape
      fetchImpl: (() => {
        fetches += 1;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as typeof fetch,
    });
    const status = await client.refresh({ force: true });
    expect(status.reachable).toBe(false);
    expect(fetches).toBe(0);
  });
});
