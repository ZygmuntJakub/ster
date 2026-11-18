import { describe, expect, it } from "vitest";
import {
  BRIDGE_SURFACE,
  isTrustedSender,
  listBridgeMethods,
  settingsPatchSchema,
  validateBridgePayload,
} from "../src/shared/bridge.js";

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

  it("rejects unexpected payloads for methods without a schema", () => {
    expect(() => validateBridgePayload("agents.list", { hack: true })).toThrow(
      /Unexpected payload/,
    );
    expect(validateBridgePayload("agents.list", undefined)).toBeUndefined();
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
