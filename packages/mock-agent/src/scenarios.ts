import {
  type AgentContext,
  type PermissionOption,
  type PromptRequest,
  type PromptResponse,
  type RequestPermissionResponse,
  RequestError,
  methods,
} from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export const SCENARIO_NAMES = [
  "hello",
  "long",
  "edit-file",
  "plan",
  "read-then-edit",
  "escape-workspace",
  "crash",
  "hostile-content",
  "run-command",
  "run-long",
  "auth-required",
  "config-options",
  "commands",
  "usage",
  "unknown-update",
  "permission-always",
  "write-after-external-edit",
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface SessionState {
  id: string;
  cwd: string;
  cancelled: boolean;
  authenticated: boolean;
}

function isCancelled(session: SessionState): boolean {
  return session.cancelled;
}

const SCENARIO_RE = /\bscenario:\s*([a-z0-9-]+)/i;

export function selectScenario(promptText: string): ScenarioName {
  const match = SCENARIO_RE.exec(promptText);
  const name = match?.[1]?.toLowerCase();
  if (name && (SCENARIO_NAMES as readonly string[]).includes(name)) {
    return name as ScenarioName;
  }
  return "hello";
}

export function promptText(params: PromptRequest): string {
  const parts: string[] = [];
  for (const block of params.prompt) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

async function sleep(ms: number, session: SessionState): Promise<boolean> {
  const step = 50;
  let waited = 0;
  while (waited < ms) {
    if (session.cancelled) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(step, ms - waited)));
    waited += step;
  }
  return session.cancelled;
}

async function emitMessage(
  client: AgentContext,
  sessionId: string,
  text: string,
  messageId = randomUUID(),
): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      messageId,
      content: { type: "text", text },
    },
  });
}

async function emitThought(client: AgentContext, sessionId: string, text: string): Promise<void> {
  await client.notify("session/update", {
    sessionId,
    update: {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text },
    },
  });
}

function onceOptions(): PermissionOption[] {
  return [
    { optionId: "allow", name: "Allow once", kind: "allow_once" },
    { optionId: "reject", name: "Reject once", kind: "reject_once" },
  ];
}

function alwaysOptions(): PermissionOption[] {
  return [
    { optionId: "allow", name: "Allow once", kind: "allow_once" },
    { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
    { optionId: "reject", name: "Reject once", kind: "reject_once" },
    { optionId: "reject-always", name: "Reject always", kind: "reject_always" },
  ];
}

function selectedAllowed(response: RequestPermissionResponse): boolean {
  return response.outcome.outcome === "selected" && response.outcome.optionId === "allow";
}

async function requestEditPermission(
  client: AgentContext,
  session: SessionState,
  toolCallId: string,
  path: string,
  options: PermissionOption[] = onceOptions(),
): Promise<boolean> {
  const response = await client.request(methods.client.session.requestPermission, {
    sessionId: session.id,
    toolCall: {
      toolCallId,
      title: `Edit ${path}`,
      kind: "edit",
      status: "pending",
      locations: [{ path }],
    },
    options,
  });
  return selectedAllowed(response);
}

export async function runScenario(
  client: AgentContext,
  session: SessionState,
  scenario: ScenarioName,
): Promise<PromptResponse> {
  if (session.cancelled) {
    return { stopReason: "cancelled" };
  }

  switch (scenario) {
    case "hello": {
      await emitThought(client, session.id, "Preparing a short greeting.");
      await emitMessage(client, session.id, "Hello from the mock agent.");
      return { stopReason: "end_turn" };
    }
    case "long": {
      const messageId = randomUUID();
      for (let i = 0; i < 40; i += 1) {
        if (await sleep(40, session)) {
          return { stopReason: "cancelled" };
        }
        await emitMessage(client, session.id, `chunk-${String(i)} `, messageId);
      }
      return { stopReason: "end_turn" };
    }
    case "edit-file": {
      const path = join(session.cwd, "notes.txt");
      const toolCallId = randomUUID();
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Edit notes.txt",
          kind: "edit",
          status: "pending",
          locations: [{ path }],
        },
      });
      const allowed = await requestEditPermission(client, session, toolCallId, path);
      if (!allowed || isCancelled(session)) {
        await client.notify("session/update", {
          sessionId: session.id,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: "failed",
          },
        });
        return { stopReason: isCancelled(session) ? "cancelled" : "end_turn" };
      }
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "in_progress",
        },
      });
      await client.request("fs/write_text_file", {
        sessionId: session.id,
        path,
        content: "edited by mock agent\n",
      });
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          content: [
            {
              type: "diff",
              path,
              oldText: "",
              newText: "edited by mock agent\n",
            },
          ],
        },
      });
      await emitMessage(client, session.id, `Updated ${path}`);
      return { stopReason: "end_turn" };
    }
    case "plan": {
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "plan",
          entries: [
            { content: "Inspect workspace", priority: "high", status: "pending" },
            { content: "Propose change", priority: "medium", status: "pending" },
          ],
        },
      });
      await sleep(20, session);
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "plan",
          entries: [
            { content: "Inspect workspace", priority: "high", status: "completed" },
            { content: "Propose change", priority: "medium", status: "in_progress" },
          ],
        },
      });
      await emitMessage(client, session.id, "Plan updated.");
      return { stopReason: "end_turn" };
    }
    case "read-then-edit": {
      const path = join(session.cwd, "readme.md");
      const readId = randomUUID();
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: readId,
          title: "Read readme.md",
          kind: "read",
          status: "pending",
          locations: [{ path }],
        },
      });
      const readPermission = await client.request(methods.client.session.requestPermission, {
        sessionId: session.id,
        toolCall: {
          toolCallId: readId,
          title: `Read ${path}`,
          kind: "read",
          status: "pending",
          locations: [{ path }],
        },
        options: onceOptions(),
      });
      if (!selectedAllowed(readPermission)) {
        return { stopReason: "end_turn" };
      }
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: readId,
          status: "completed",
        },
      });
      try {
        await client.request("fs/read_text_file", { sessionId: session.id, path });
      } catch {
        // File may not exist yet; continue to edit.
      }
      return runScenario(client, session, "edit-file");
    }
    case "escape-workspace": {
      const path = join(session.cwd, "..", "outside.txt");
      const toolCallId = randomUUID();
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Write outside workspace",
          kind: "edit",
          status: "pending",
          locations: [{ path }],
        },
      });
      const allowed = await requestEditPermission(client, session, toolCallId, path);
      if (!allowed) {
        await emitMessage(client, session.id, "Outside-workspace write rejected.");
        return { stopReason: "end_turn" };
      }
      try {
        await client.request("fs/write_text_file", {
          sessionId: session.id,
          path,
          content: "escaped\n",
        });
        await emitMessage(client, session.id, "Wrote outside path (client allowed it).");
      } catch (error) {
        await emitMessage(
          client,
          session.id,
          `Write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { stopReason: "end_turn" };
    }
    case "crash": {
      await emitMessage(client, session.id, "Crashing now.");
      process.exit(2);
      return { stopReason: "end_turn" };
    }
    case "hostile-content": {
      await emitMessage(
        client,
        session.id,
        [
          "Hostile content sample:",
          "<script>alert('xss')</script>",
          "![remote](https://evil.example/img.png)",
          "[click me](https://evil.example/phish)",
        ].join("\n"),
      );
      return { stopReason: "end_turn" };
    }
    case "run-command": {
      if (!(await sleep(10, session))) {
        const terminal = await client.createTerminal({
          sessionId: session.id,
          command: "printf",
          args: ["hello-from-command\n"],
          cwd: session.cwd,
        });
        try {
          const output = await terminal.waitForExit();
          await emitMessage(
            client,
            session.id,
            `Command exited with code ${String(output.exitCode ?? "null")}`,
          );
        } finally {
          await terminal.release();
        }
      }
      return { stopReason: isCancelled(session) ? "cancelled" : "end_turn" };
    }
    case "run-long": {
      const terminal = await client.createTerminal({
        sessionId: session.id,
        command: "sleep",
        args: ["30"],
        cwd: session.cwd,
      });
      try {
        for (let i = 0; i < 20; i += 1) {
          if (isCancelled(session)) {
            await terminal.kill();
            return { stopReason: "cancelled" };
          }
          await sleep(100, session);
        }
        await terminal.waitForExit();
      } finally {
        await terminal.release();
      }
      return { stopReason: "end_turn" };
    }
    case "auth-required": {
      throw RequestError.authRequired({ reason: "mock agent requires login" });
    }
    case "config-options": {
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "config_option_update",
          configOptions: [
            {
              id: "model",
              name: "Model",
              category: "model",
              type: "select",
              currentValue: "mock-small",
              options: [
                { value: "mock-small", name: "Mock Small" },
                { value: "mock-large", name: "Mock Large" },
              ],
            },
          ],
        },
      });
      await emitMessage(client, session.id, "Config options advertised.");
      return { stopReason: "end_turn" };
    }
    case "commands": {
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands: [
            { name: "status", description: "Show mock status" },
            { name: "reset", description: "Reset mock session", input: { hint: "optional note" } },
          ],
        },
      });
      await emitMessage(client, session.id, "Commands available.");
      return { stopReason: "end_turn" };
    }
    case "usage": {
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "usage_update",
          used: 128,
          size: 8192,
          cost: { amount: 0.01, currency: "USD" },
        },
      });
      await emitMessage(client, session.id, "Usage reported.");
      return { stopReason: "end_turn" };
    }
    case "unknown-update": {
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "ster_mock_unknown",
          payload: { hello: true },
        } as never,
      });
      await emitMessage(client, session.id, "Sent an unknown update variant.");
      return { stopReason: "end_turn" };
    }
    case "permission-always": {
      const path = join(session.cwd, "always.txt");
      const toolCallId = randomUUID();
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Edit always.txt",
          kind: "edit",
          status: "pending",
          locations: [{ path }],
        },
      });
      await requestEditPermission(client, session, toolCallId, path, alwaysOptions());
      await emitMessage(client, session.id, "Asked with standing-permission options.");
      return { stopReason: "end_turn" };
    }
    case "write-after-external-edit": {
      const path = join(session.cwd, "race.txt");
      await client.request("fs/write_text_file", {
        sessionId: session.id,
        path,
        content: "version-1\n",
      });
      await emitMessage(
        client,
        session.id,
        "Wrote race.txt. Edit the file externally, then continue.",
      );
      await sleep(1500, session);
      const toolCallId = randomUUID();
      await client.notify("session/update", {
        sessionId: session.id,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Overwrite race.txt",
          kind: "edit",
          status: "pending",
          locations: [{ path }],
        },
      });
      const allowed = await requestEditPermission(client, session, toolCallId, path);
      if (!allowed) {
        return { stopReason: "end_turn" };
      }
      try {
        await client.request("fs/write_text_file", {
          sessionId: session.id,
          path,
          content: "version-2-from-agent\n",
        });
        await emitMessage(client, session.id, "Overwrite completed.");
      } catch (error) {
        await emitMessage(
          client,
          session.id,
          `Overwrite blocked: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return { stopReason: "end_turn" };
    }
    default: {
      const _exhaustive: never = scenario;
      return _exhaustive;
    }
  }
}
