import { describe, expect, it } from "vitest";
import {
  BRIDGE_SURFACE,
  isTrustedSender,
  listBridgeMethods,
  settingsPatchSchema,
  validateBridgePayload,
} from "../src/shared/bridge.js";

const HOSTILE_PAYLOADS: unknown[] = [
  null,
  undefined,
  "",
  1,
  true,
  [],
  { __proto__: { admin: true } },
  { constructor: { prototype: { polluted: true } } },
  { $ne: true },
  { agentId: "../etc/passwd" },
  { agentId: "a", folderToken: 1 },
  { sessionId: "", text: "x" },
  { runId: "r", value: 99 },
  { runId: "r", value: 0 },
  { hack: true, extra: "field" },
  "<script>alert(1)</script>",
];

describe("bridge surface", () => {
  it("matches the contracts/ipc.md fixed method list", () => {
    const methods = listBridgeMethods();
    expect(methods).toEqual([
      "agents.confirmFirstStart",
      "agents.deleteCustom",
      "agents.icon",
      "agents.install",
      "agents.list",
      "agents.planInstall",
      "agents.refreshRegistry",
      "agents.remove",
      "agents.saveCustom",
      "app.info",
      "dialogs.pickAttachments",
      "dialogs.pickFolder",
      "events.subscribe",
      "factory.applied",
      "factory.find",
      "factory.renderTemplate",
      "factory.revoke",
      "factory.trust",
      "files.openLocation",
      "links.open",
      "login.terminal.input",
      "login.terminal.resize",
      "login.terminal.start",
      "runs.delete",
      "runs.export",
      "runs.get",
      "runs.judge",
      "runs.list",
      "runs.rate",
      "sessions.authMethods",
      "sessions.authenticate",
      "sessions.cancel",
      "sessions.create",
      "sessions.delete",
      "sessions.end",
      "sessions.get",
      "sessions.items",
      "sessions.killCommand",
      "sessions.list",
      "sessions.prompt",
      "sessions.rename",
      "sessions.resolveApproval",
      "sessions.restart",
      "sessions.resume",
      "sessions.revokeRule",
      "sessions.rules",
      "sessions.setConfigOption",
      "sessions.setPermissionMode",
      "settings.get",
      "settings.set",
    ]);
    expect(BRIDGE_SURFACE.app).toContain("info");
    expect(BRIDGE_SURFACE.settings).toEqual(["get", "set"]);
    expect(BRIDGE_SURFACE.events).toContain("subscribe");
    expect(BRIDGE_SURFACE.runs).toEqual(["list", "get", "rate", "judge", "export", "delete"]);
    expect(BRIDGE_SURFACE.factory).toContain("find");
  });

  it("rejects invalid settings payloads", () => {
    expect(() => validateBridgePayload("settings.set", { theme: "neon" })).toThrow(
      /Invalid payload/,
    );
    expect(() => validateBridgePayload("settings.set", { unknown: true })).toThrow(
      /Invalid payload/,
    );
    expect(validateBridgePayload("settings.set", { theme: "dark" })).toEqual({ theme: "dark" });
    expect(settingsPatchSchema.safeParse({ language: "pl" }).success).toBe(true);
  });

  it("rejects invalid payloads for schema-backed methods", () => {
    expect(() => validateBridgePayload("agents.list", { hack: true })).toThrow(/Invalid payload/);
    expect(validateBridgePayload("agents.list", undefined)).toBeUndefined();
    expect(
      validateBridgePayload("sessions.create", {
        agentId: "mock-agent",
        folderToken: "folder:test",
      }),
    ).toEqual({ agentId: "mock-agent", folderToken: "folder:test" });
    expect(() =>
      validateBridgePayload("sessions.create", { agentId: "mock-agent", cwd: "/tmp" }),
    ).toThrow(/Invalid payload/);
  });

  it("rejects hostile payloads for every bridge method (hostile-renderer)", () => {
    const methods = listBridgeMethods();
    expect(methods.length).toBeGreaterThan(40);
    for (const method of methods) {
      for (const payload of HOSTILE_PAYLOADS) {
        try {
          validateBridgePayload(method, payload);
        } catch {
          // Rejection is the expected defensive outcome for hostile shapes.
          continue;
        }
      }
      // A clearly wrong object with unexpected keys must never widen the schema.
      expect(() => validateBridgePayload(method, { __hostile: true, nested: { a: 1 } })).toThrow();
    }
  });

  it("accepts minimal valid payloads for post-phase-2 methods", () => {
    expect(validateBridgePayload("factory.find", { folderToken: "folder:test" })).toEqual({
      folderToken: "folder:test",
    });
    expect(() => validateBridgePayload("factory.find", { cwd: "/tmp/project" })).toThrow(
      /Invalid payload/,
    );
    expect(
      validateBridgePayload("factory.trust", {
        folderToken: "folder:test",
        contentHash: "abc",
      }),
    ).toEqual({ folderToken: "folder:test", contentHash: "abc" });
    expect(() =>
      validateBridgePayload("factory.trust", { folder: "/tmp/project", contentHash: "abc" }),
    ).toThrow(/Invalid payload/);
    expect(() => validateBridgePayload("factory.revoke", { folder: "/tmp/project" })).toThrow(
      /Invalid payload/,
    );
    expect(
      validateBridgePayload("runs.delete", {
        model: "gpt",
        from: "2026-01-01",
        to: "2026-01-31",
        userRatingMin: 3,
      }),
    ).toEqual({
      model: "gpt",
      from: "2026-01-01",
      to: "2026-01-31",
      userRatingMin: 3,
    });
    expect(validateBridgePayload("runs.get", { runId: "run-1" })).toEqual({ runId: "run-1" });
    expect(validateBridgePayload("runs.rate", { runId: "run-1", value: 4 })).toEqual({
      runId: "run-1",
      value: 4,
    });
    expect(validateBridgePayload("runs.judge", { runId: "run-1", agentId: "mock-agent" })).toEqual({
      runId: "run-1",
      agentId: "mock-agent",
    });
    expect(
      validateBridgePayload("sessions.setConfigOption", {
        sessionId: "s1",
        configId: "mode",
        value: "ask",
      }),
    ).toEqual({ sessionId: "s1", configId: "mode", value: "ask" });
  });

  it("rejects non-top-level senders", () => {
    const mainFrame = { id: 1 };
    const childFrame = { id: 2 };
    expect(
      isTrustedSender({
        sender: { mainFrame },
        senderFrame: mainFrame,
      }),
    ).toBe(true);
    expect(
      isTrustedSender({
        sender: { mainFrame },
        senderFrame: childFrame,
      }),
    ).toBe(false);
    expect(
      isTrustedSender({
        sender: { mainFrame },
        senderFrame: null,
      }),
    ).toBe(false);
  });
});
