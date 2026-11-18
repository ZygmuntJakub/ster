import { describe, expect, it } from "vitest";
import {
  actionFromUpdate,
  canAdvanceActionStatus,
  mergeActionUpdate,
  type AgentAction,
} from "../../src/sessions/actions.js";

function baseAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    toolCallId: "tc-1",
    title: "Edit notes.txt",
    kind: "edit",
    status: "pending",
    locations: [{ path: "/tmp/notes.txt" }],
    content: [],
    ...overrides,
  };
}

describe("action status ordering", () => {
  it("allows forward progress and rejects backwards moves", () => {
    expect(canAdvanceActionStatus("pending", "in_progress")).toBe(true);
    expect(canAdvanceActionStatus("in_progress", "completed")).toBe(true);
    expect(canAdvanceActionStatus("in_progress", "failed")).toBe(true);
    expect(canAdvanceActionStatus("pending", "completed")).toBe(true);
    expect(canAdvanceActionStatus("completed", "pending")).toBe(false);
    expect(canAdvanceActionStatus("failed", "in_progress")).toBe(false);
    expect(canAdvanceActionStatus("completed", "failed")).toBe(false);
    expect(canAdvanceActionStatus("failed", "completed")).toBe(false);
  });
});

describe("actionFromUpdate / mergeActionUpdate", () => {
  it("builds an action from a tool_call payload", () => {
    const action = actionFromUpdate({
      toolCallId: "tc-1",
      title: "Edit notes.txt",
      kind: "edit",
      status: "pending",
      locations: [{ path: "/tmp/notes.txt", line: 1 }],
    });
    expect(action).toEqual({
      toolCallId: "tc-1",
      title: "Edit notes.txt",
      kind: "edit",
      status: "pending",
      locations: [{ path: "/tmp/notes.txt", line: 1 }],
      content: [],
    });
  });

  it("merges updates by field without moving status backwards", () => {
    const current = baseAction({ status: "in_progress" });
    const merged = mergeActionUpdate(current, {
      status: "pending",
      content: [
        {
          type: "diff",
          path: "/tmp/notes.txt",
          oldText: "",
          newText: "edited\n",
        },
      ],
      locations: [{ path: "/tmp/notes.txt" }],
    });
    expect(merged.status).toBe("in_progress");
    expect(merged.content).toEqual([
      {
        type: "diff",
        path: "/tmp/notes.txt",
        oldText: "",
        newText: "edited\n",
      },
    ]);
  });

  it("advances status to completed and keeps title when omitted", () => {
    const current = baseAction({ status: "in_progress", title: "Edit notes.txt" });
    const merged = mergeActionUpdate(current, { status: "completed" });
    expect(merged.status).toBe("completed");
    expect(merged.title).toBe("Edit notes.txt");
  });

  it("returns null without a toolCallId", () => {
    expect(actionFromUpdate({ title: "x" })).toBeNull();
  });
});
