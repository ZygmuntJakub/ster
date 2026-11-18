import { describe, expect, it } from "vitest";
import { createEventStream } from "../../src/events/stream.js";
import { filterOneTimeOptions, createApprovalBroker } from "../../src/permissions/approvals.js";
import { createRuleStore } from "../../src/permissions/rules.js";
import type { Store } from "../../src/store/store.js";

function fakeStore(): Store {
  let seq = 0;
  const items: Array<{
    sessionId: string;
    seq: number;
    kind: string;
    runId: string;
    createdAt: string;
    payloadJson: string;
  }> = [];
  return {
    dataDir: "/tmp",
    dbPath: "/tmp/ster.db",
    migrationVersion: () => 1,
    listAppliedMigrations: () => [1],
    putSession: () => undefined,
    getSession: () => null,
    listSessions: () => [],
    deleteSession: () => undefined,
    appendItem: (item) => {
      seq += 1;
      const row = {
        sessionId: item.sessionId,
        seq,
        kind: item.kind,
        runId: item.runId,
        createdAt: item.createdAt,
        payloadJson: item.payloadJson,
      };
      items.push(row);
      return row;
    },
    updateItemPayload: (sessionId, itemSeq, payloadJson) => ({
      sessionId,
      seq: itemSeq,
      kind: "notice",
      runId: "none",
      createdAt: new Date().toISOString(),
      payloadJson,
    }),
    listItems: (sessionId) => items.filter((item) => item.sessionId === sessionId),
    getSetting: () => null,
    setSetting: () => undefined,
    close: () => undefined,
  };
}

function broker(mode = "always-ask") {
  return createApprovalBroker({
    store: fakeStore(),
    events: createEventStream(),
    currentRunId: () => "run-1",
    getPermissionMode: () => mode,
    getSessionCwd: () => "/tmp/project",
    rules: createRuleStore(),
  });
}

describe("approval broker", () => {
  it("keeps only one-time options", () => {
    expect(
      filterOneTimeOptions([
        { optionId: "allow", name: "Allow once", kind: "allow_once" },
        { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
        { optionId: "reject", name: "Reject once", kind: "reject_once" },
        { optionId: "reject-always", name: "Reject always", kind: "reject_always" },
      ]),
    ).toEqual([
      { optionId: "allow", name: "Allow once", kind: "allow_once" },
      { optionId: "reject", name: "Reject once", kind: "reject_once" },
    ]);
  });

  it("cancels immediately when no one-time options remain", async () => {
    const outcome = await broker().request({
      sessionId: "s1",
      source: "agent",
      subject: {},
      options: [{ optionId: "always", name: "Always", kind: "allow_always" }],
    });
    expect(outcome).toEqual({ by: "cancelled" });
  });

  it("resolves a pending approval and cancels on session cancel", async () => {
    const events = createEventStream();
    const rules = createRuleStore();
    const instance = createApprovalBroker({
      store: fakeStore(),
      events,
      currentRunId: () => "run-1",
      getPermissionMode: () => "always-ask",
      getSessionCwd: () => "/tmp/project",
      rules,
    });

    const pending = instance.request({
      sessionId: "s1",
      source: "agent",
      subject: { kind: "edit" },
      options: [
        { optionId: "allow", name: "Allow once", kind: "allow_once" },
        { optionId: "reject", name: "Reject once", kind: "reject_once" },
      ],
    });

    const listed = instance.pendingFor("s1");
    expect(listed).toHaveLength(1);
    const first = listed[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error("expected pending approval");
    }
    instance.resolve(first.id, { optionId: "allow" });
    await expect(pending).resolves.toEqual({ by: "user", optionId: "allow" });

    const cancelled = instance.request({
      sessionId: "s1",
      source: "client-guard",
      subject: { reason: "stale-write" },
      options: [
        { optionId: "allow", name: "Overwrite", kind: "allow_once" },
        { optionId: "reject", name: "Cancel", kind: "reject_once" },
      ],
    });
    instance.cancelSession("s1");
    await expect(cancelled).resolves.toEqual({ by: "cancelled" });
  });

  it("auto-approves reads in auto-approve-reads mode and records a notice", async () => {
    const store = fakeStore();
    const instance = createApprovalBroker({
      store,
      events: createEventStream(),
      currentRunId: () => "run-1",
      getPermissionMode: () => "auto-approve-reads",
      getSessionCwd: () => "/tmp/project",
      rules: createRuleStore(),
    });
    const outcome = await instance.request({
      sessionId: "s1",
      source: "agent",
      subject: { kind: "read", title: "Read file" },
      options: [
        { optionId: "allow", name: "Allow once", kind: "allow_once" },
        { optionId: "reject", name: "Reject once", kind: "reject_once" },
      ],
    });
    expect(outcome).toEqual({ by: "mode", optionId: "allow" });
    expect(store.listItems("s1", { limit: 10 }).some((row) => row.kind === "notice")).toBe(true);
  });
});
