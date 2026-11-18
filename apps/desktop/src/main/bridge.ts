import { isSterError, type Core, type CoreEvent, type ConversationItem } from "@ster/core";
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  INVOKE_CHANNEL,
  isTrustedSender,
  listBridgeMethods,
  validateBridgePayload,
} from "../shared/bridge.js";
import type { CoreHost } from "./core-host.js";
import { createEventForwarder } from "./event-forwarder.js";
import {
  agentIcon,
  deleteCustom,
  installAgent,
  planInstall,
  refreshRegistry,
  removeAgent,
  saveCustom,
} from "./handlers/agents.js";
import { openLocation } from "./handlers/files.js";
import {
  deleteSession,
  killCommand,
  listRules,
  listSessions,
  renameSession,
  resumeSession,
  revokeRule,
  setConfigOption,
  setPermissionMode,
} from "./handlers/sessions.js";
import { createLinkIndex } from "./link-index.js";
import { createLocationIndex } from "./location-index.js";
import { createLoginTerminalManager } from "./login-terminal.js";
import { createTokenStore } from "./tokens.js";

const allowedMethods = new Set(listBridgeMethods());

export interface BridgeError {
  code: string;
  details?: Readonly<Record<string, unknown>>;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export { isTrustedSender };

function fail(code: string, details?: Readonly<Record<string, unknown>>): BridgeResult<never> {
  return details === undefined
    ? { ok: false, error: { code } }
    : { ok: false, error: { code, details } };
}

function ok<T>(value: T): BridgeResult<T> {
  return { ok: true, value };
}

function indexItems(
  linkIndex: ReturnType<typeof createLinkIndex>,
  locationIndex: ReturnType<typeof createLocationIndex>,
  items: ConversationItem[],
): void {
  for (const item of items) {
    linkIndex.indexItem(item.sessionId, item.seq, item.payload);
    if (item.kind === "action") {
      locationIndex.indexItem(item.sessionId, item.seq, item.payload);
    }
  }
}

async function handleMethod(
  host: CoreHost,
  method: string,
  payload: unknown,
  ctx: {
    tokens: ReturnType<typeof createTokenStore>;
    links: ReturnType<typeof createLinkIndex>;
    locations: ReturnType<typeof createLocationIndex>;
    login: ReturnType<typeof createLoginTerminalManager>;
  },
): Promise<BridgeResult<unknown>> {
  const core: Core = host.core;

  switch (method) {
    case "app.info":
      return ok({
        brand: host.brand,
        version: host.version,
        platform: process.platform,
        language: core.settings.get().language,
        policyState: core.policy.state,
      });
    case "settings.get":
      return ok(core.settings.get());
    case "settings.set": {
      const patch = payload as {
        language?: string;
        defaultPermissionMode?: string;
        defaultAgentId?: string | null;
        theme?: "system" | "light" | "dark";
      };
      const next: Parameters<Core["settings"]["set"]>[0] = {};
      if (patch.language !== undefined) {
        next.language = patch.language;
      }
      if (patch.defaultPermissionMode !== undefined) {
        next.defaultPermissionMode = patch.defaultPermissionMode;
      }
      if (patch.theme !== undefined) {
        next.theme = patch.theme;
      }
      if (patch.defaultAgentId === null) {
        Object.assign(next, { defaultAgentId: undefined });
      } else if (patch.defaultAgentId !== undefined) {
        next.defaultAgentId = patch.defaultAgentId;
      }
      return ok(core.settings.set(next));
    }
    case "events.subscribe":
      return ok({ subscribed: true });
    case "agents.list":
      return ok(await core.agents.list());
    case "agents.icon": {
      const { agentId } = payload as { agentId: string };
      return ok(await agentIcon(core, agentId));
    }
    case "agents.refreshRegistry": {
      const body = payload as { force?: boolean } | undefined;
      return ok(await refreshRegistry(core, body?.force));
    }
    case "agents.planInstall": {
      const { agentId } = payload as { agentId: string };
      return ok(await planInstall(core, agentId));
    }
    case "agents.install": {
      const { planId } = payload as { planId: string };
      return ok(await installAgent(core, planId));
    }
    case "agents.remove": {
      const { agentId } = payload as { agentId: string };
      return ok(await removeAgent(core, agentId));
    }
    case "agents.saveCustom": {
      const input = payload as {
        id?: string;
        name: string;
        command: string;
        args: string[];
        env: Record<string, string>;
      };
      return ok(await saveCustom(core, input));
    }
    case "agents.deleteCustom": {
      const { agentId } = payload as { agentId: string };
      return ok(await deleteCustom(core, agentId));
    }
    case "agents.confirmFirstStart": {
      const { agentId } = payload as { agentId: string };
      await core.agents.confirmFirstStart(agentId);
      return ok({ confirmed: true });
    }
    case "dialogs.pickFolder": {
      const e2eFolder = process.env["STER_E2E_FOLDER"];
      if (e2eFolder) {
        const record = ctx.tokens.issueFolder(e2eFolder);
        return ok({ folderToken: record.token, displayPath: record.displayPath });
      }
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return ok({ cancelled: true });
      }
      const path = result.filePaths[0];
      if (!path) {
        return ok({ cancelled: true });
      }
      const record = ctx.tokens.issueFolder(path);
      return ok({ folderToken: record.token, displayPath: record.displayPath });
    }
    case "dialogs.pickAttachments": {
      const { sessionId } = payload as { sessionId: string };
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return ok({ cancelled: true, attachments: [] });
      }
      const attachments = result.filePaths.map((path) => {
        const record = ctx.tokens.issueAttachment(sessionId, path);
        return { token: record.token, name: record.name };
      });
      return ok({ attachments });
    }
    case "sessions.create": {
      const input = payload as {
        agentId: string;
        folderToken: string;
        permissionMode?: string;
      };
      const folder = ctx.tokens.resolveFolder(input.folderToken);
      const createInput: { agentId: string; cwd: string; permissionMode?: string } = {
        agentId: input.agentId,
        cwd: folder.path,
      };
      if (input.permissionMode !== undefined) {
        createInput.permissionMode = input.permissionMode;
      }
      const session = await core.sessions.create(createInput);
      return ok(session);
    }
    case "sessions.list":
      return ok(
        await listSessions(
          core,
          payload as undefined | { agentId?: string; cwd?: string; status?: string },
        ),
      );
    case "sessions.get": {
      const { sessionId } = payload as { sessionId: string };
      return ok(await core.sessions.get(sessionId));
    }
    case "sessions.items": {
      const { sessionId, before, limit } = payload as {
        sessionId: string;
        before?: number;
        limit: number;
      };
      const page: { limit: number; before?: number } = { limit };
      if (before !== undefined) {
        page.before = before;
      }
      const items = await core.sessions.items(sessionId, page);
      indexItems(ctx.links, ctx.locations, items);
      return ok(items);
    }
    case "sessions.prompt": {
      const { sessionId, text, attachmentTokens } = payload as {
        sessionId: string;
        text: string;
        attachmentTokens: string[];
      };
      for (const token of attachmentTokens) {
        ctx.tokens.resolveAttachment(token, sessionId);
      }
      // Attachments are validated; US1 prompt content is text-only until media lands.
      const run = await core.sessions.prompt(sessionId, [{ type: "text", text }]);
      return ok(run);
    }
    case "sessions.cancel": {
      const { sessionId } = payload as { sessionId: string };
      await core.sessions.cancel(sessionId);
      return ok({ cancelled: true });
    }
    case "sessions.resolveApproval": {
      const { approvalId, outcome } = payload as {
        approvalId: string;
        outcome: { optionId: string } | { cancelled: true };
      };
      await core.sessions.resolveApproval(approvalId, outcome);
      return ok({ resolved: true });
    }
    case "sessions.setPermissionMode": {
      const { sessionId, mode } = payload as { sessionId: string; mode: string };
      return ok(await setPermissionMode(core, sessionId, mode));
    }
    case "sessions.setConfigOption": {
      const { sessionId, configId, value } = payload as {
        sessionId: string;
        configId: string;
        value: string;
      };
      return ok(await setConfigOption(core, sessionId, configId, value));
    }
    case "sessions.rules": {
      const { sessionId } = payload as { sessionId: string };
      return ok(await listRules(core, sessionId));
    }
    case "sessions.revokeRule": {
      const { ruleId } = payload as { ruleId: string };
      return ok(await revokeRule(core, ruleId));
    }
    case "sessions.killCommand": {
      const { commandRunId } = payload as { commandRunId: string };
      return ok(await killCommand(core, commandRunId));
    }
    case "sessions.authMethods": {
      const { sessionId } = payload as { sessionId: string };
      return ok(await core.sessions.authMethods(sessionId));
    }
    case "sessions.authenticate": {
      const { sessionId, methodId } = payload as { sessionId: string; methodId: string };
      await core.sessions.authenticate(sessionId, methodId);
      return ok({ authenticated: true });
    }
    case "sessions.restart": {
      const { sessionId } = payload as { sessionId: string };
      return ok(await core.sessions.restart(sessionId));
    }
    case "sessions.resume": {
      const { sessionId } = payload as { sessionId: string };
      return ok(await resumeSession(core, sessionId));
    }
    case "sessions.rename": {
      const { sessionId, title } = payload as { sessionId: string; title: string };
      return ok(await renameSession(core, sessionId, title));
    }
    case "sessions.end": {
      const { sessionId } = payload as { sessionId: string };
      await core.sessions.end(sessionId);
      ctx.links.clearSession(sessionId);
      return ok({ ended: true });
    }
    case "sessions.delete": {
      const { sessionId, runRecords } = payload as {
        sessionId: string;
        runRecords: "delete" | "keep-without-text";
      };
      const result = await deleteSession(core, sessionId, runRecords);
      ctx.links.clearSession(sessionId);
      return ok(result);
    }
    case "files.openLocation": {
      const { sessionId, itemSeq, locationIndex } = payload as {
        sessionId: string;
        itemSeq: number;
        locationIndex: number;
      };
      const session = await core.sessions.get(sessionId);
      return ok(
        await openLocation({
          sessionId,
          itemSeq,
          locationIndex,
          cwd: session.cwd,
          locations: ctx.locations,
        }),
      );
    }
    case "links.open": {
      const { sessionId, itemSeq, linkIndex } = payload as {
        sessionId: string;
        itemSeq: number;
        linkIndex: number;
      };
      const url = ctx.links.resolve(sessionId, itemSeq, linkIndex);
      const choice = await dialog.showMessageBox({
        type: "question",
        buttons: ["Cancel", "Open"],
        defaultId: 1,
        cancelId: 0,
        message: "Open this link in your browser?",
        detail: url,
      });
      if (choice.response === 1) {
        await shell.openExternal(url);
        return ok({ opened: true });
      }
      return ok({ opened: false });
    }
    case "login.terminal.start": {
      const { sessionId, methodId } = payload as { sessionId: string; methodId: string };
      return ok(await ctx.login.start(sessionId, methodId));
    }
    case "login.terminal.input": {
      const { terminalToken, data } = payload as { terminalToken: string; data: string };
      ctx.login.input(terminalToken, data);
      return ok({ written: true });
    }
    case "login.terminal.resize": {
      const { terminalToken, cols, rows } = payload as {
        terminalToken: string;
        cols: number;
        rows: number;
      };
      ctx.login.resize(terminalToken, cols, rows);
      return ok({ resized: true });
    }
    default:
      return fail("invalid-argument", { method, reason: "not-implemented" });
  }
}

/**
 * Register the validating IPC bridge (contracts/ipc.md).
 */
export function registerBridge(host: CoreHost): () => void {
  const tokens = createTokenStore();
  const links = createLinkIndex();
  const locations = createLocationIndex();
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      environment[key] = value;
    }
  }
  const login = createLoginTerminalManager({
    core: host.core,
    getWindows: () => BrowserWindow.getAllWindows(),
    environment,
  });
  const forwarder = createEventForwarder(() => BrowserWindow.getAllWindows());

  const onInvoke = async (
    event: IpcMainInvokeEvent,
    method: unknown,
    payload: unknown,
  ): Promise<BridgeResult<unknown>> => {
    if (!isTrustedSender(event)) {
      return fail("invalid-argument", { reason: "untrusted-sender" });
    }
    if (typeof method !== "string" || !allowedMethods.has(method)) {
      return fail("invalid-argument", { reason: "unknown-method", method });
    }
    try {
      const validated = validateBridgePayload(method, payload);
      return await handleMethod(host, method, validated, { tokens, links, locations, login });
    } catch (error) {
      if (isSterError(error)) {
        return fail(error.code, error.details);
      }
      return fail("invalid-argument", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ipcMain.handle(INVOKE_CHANNEL, onInvoke);

  const unsubscribe = host.core.events.subscribe((coreEvent: CoreEvent) => {
    if (coreEvent.type === "item.appended") {
      links.indexItem(coreEvent.sessionId, coreEvent.item.seq, coreEvent.item.payload);
      if (coreEvent.item.kind === "action") {
        locations.indexItem(coreEvent.sessionId, coreEvent.item.seq, coreEvent.item.payload);
      }
    }
    if (coreEvent.type === "item.updated") {
      const patch = coreEvent.patch;
      if (typeof patch === "object" && "payload" in patch) {
        links.indexItem(coreEvent.sessionId, coreEvent.seq, patch.payload);
        const payload = patch.payload;
        const hasToolCallId =
          typeof payload === "object" && payload !== null && "toolCallId" in payload;
        if (patch["kind"] === "action" || hasToolCallId) {
          locations.indexItem(coreEvent.sessionId, coreEvent.seq, payload);
        }
      }
    }
    if (coreEvent.type === "session.deleted") {
      links.clearSession(coreEvent.sessionId);
      locations.clearSession(coreEvent.sessionId);
    }
    forwarder.publish(coreEvent);
  });

  return () => {
    ipcMain.removeHandler(INVOKE_CHANNEL);
    unsubscribe();
    forwarder.dispose();
    login.dispose();
    tokens.clear();
  };
}
