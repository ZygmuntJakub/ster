import { z } from "zod";
import {
  BRIDGE_SURFACE,
  EVENT_CHANNEL,
  INVOKE_CHANNEL,
  isTrustedSender,
  listBridgeMethods,
  type BridgeGroup,
} from "./bridge-surface.js";

export {
  BRIDGE_SURFACE,
  EVENT_CHANNEL,
  INVOKE_CHANNEL,
  isTrustedSender,
  listBridgeMethods,
  type BridgeGroup,
};

export const settingsPatchSchema = z
  .object({
    language: z.string().min(1).optional(),
    defaultPermissionMode: z.string().min(1).optional(),
    defaultAgentId: z.string().min(1).nullable().optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strict();

export const emptySchema = z.undefined();

const idSchema = z.string().min(1);
const tokenSchema = z.string().min(1);

export const bridgePayloadSchemas: Record<string, z.ZodType> = {
  "app.info": emptySchema,
  "settings.get": emptySchema,
  "settings.set": settingsPatchSchema,
  "events.subscribe": emptySchema,
  "agents.list": emptySchema,
  "agents.icon": z.object({ agentId: idSchema }).strict(),
  "agents.refreshRegistry": z.object({ force: z.boolean().optional() }).strict().optional(),
  "agents.planInstall": z.object({ agentId: idSchema }).strict(),
  "agents.install": z.object({ planId: idSchema }).strict(),
  "agents.remove": z.object({ agentId: idSchema }).strict(),
  "agents.saveCustom": z
    .object({
      id: idSchema.optional(),
      name: z.string().min(1),
      command: z.string().min(1),
      args: z.array(z.string()),
      env: z.record(z.string(), z.string()),
    })
    .strict(),
  "agents.deleteCustom": z.object({ agentId: idSchema }).strict(),
  "agents.confirmFirstStart": z.object({ agentId: idSchema }).strict(),
  "dialogs.pickFolder": emptySchema,
  "dialogs.pickAttachments": z.object({ sessionId: idSchema }).strict(),
  "sessions.create": z
    .object({
      agentId: idSchema,
      folderToken: tokenSchema,
      permissionMode: z.string().min(1).optional(),
    })
    .strict(),
  "sessions.list": z
    .object({
      agentId: idSchema.optional(),
      cwd: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
    })
    .strict()
    .optional(),
  "sessions.get": z.object({ sessionId: idSchema }).strict(),
  "sessions.items": z
    .object({
      sessionId: idSchema,
      before: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(200).default(50),
    })
    .strict(),
  "sessions.prompt": z
    .object({
      sessionId: idSchema,
      text: z.string().min(1),
      attachmentTokens: z.array(tokenSchema).default([]),
    })
    .strict(),
  "sessions.cancel": z.object({ sessionId: idSchema }).strict(),
  "sessions.resolveApproval": z
    .object({
      approvalId: idSchema,
      outcome: z.union([
        z.object({ optionId: idSchema }).strict(),
        z.object({ cancelled: z.literal(true) }).strict(),
      ]),
    })
    .strict(),
  "sessions.setPermissionMode": z.object({ sessionId: idSchema, mode: z.string().min(1) }).strict(),
  "sessions.setConfigOption": z
    .object({ sessionId: idSchema, configId: idSchema, value: z.string() })
    .strict(),
  "sessions.rules": z.object({ sessionId: idSchema }).strict(),
  "sessions.revokeRule": z.object({ ruleId: idSchema }).strict(),
  "sessions.killCommand": z.object({ commandRunId: idSchema }).strict(),
  "sessions.authMethods": z.object({ sessionId: idSchema }).strict(),
  "sessions.authenticate": z.object({ sessionId: idSchema, methodId: idSchema }).strict(),
  "sessions.resume": z.object({ sessionId: idSchema }).strict(),
  "sessions.restart": z.object({ sessionId: idSchema }).strict(),
  "sessions.rename": z.object({ sessionId: idSchema, title: z.string().min(1) }).strict(),
  "sessions.end": z.object({ sessionId: idSchema }).strict(),
  "sessions.delete": z
    .object({
      sessionId: idSchema,
      runRecords: z.enum(["delete", "keep-without-text"]).default("delete"),
    })
    .strict(),
  "files.openLocation": z
    .object({
      sessionId: idSchema,
      itemSeq: z.number().int().nonnegative(),
      locationIndex: z.number().int().nonnegative(),
    })
    .strict(),
  "links.open": z
    .object({
      sessionId: idSchema,
      itemSeq: z.number().int().nonnegative(),
      linkIndex: z.number().int().nonnegative(),
    })
    .strict(),
  "login.terminal.start": z.object({ sessionId: idSchema, methodId: idSchema }).strict(),
  "login.terminal.input": z.object({ terminalToken: tokenSchema, data: z.string() }).strict(),
  "login.terminal.resize": z
    .object({
      terminalToken: tokenSchema,
      cols: z.number().int().positive().max(500),
      rows: z.number().int().positive().max(200),
    })
    .strict(),
  "factory.find": z.object({ folderToken: tokenSchema }).strict(),
  "factory.trust": z
    .object({
      folderToken: tokenSchema,
      contentHash: z.string().min(1),
    })
    .strict(),
  "factory.revoke": z.object({ folderToken: tokenSchema }).strict(),
  "factory.renderTemplate": z
    .object({
      sessionId: idSchema,
      templateId: idSchema,
      inputs: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
  "factory.applied": z.object({ sessionId: idSchema }).strict(),
  "runs.list": z
    .object({
      filter: z
        .object({
          sessionId: idSchema.optional(),
          agentId: idSchema.optional(),
          model: z.string().min(1).optional(),
          cwd: z.string().min(1).optional(),
          outcome: z.string().min(1).optional(),
          kind: z.string().min(1).optional(),
          from: z.string().min(1).optional(),
          to: z.string().min(1).optional(),
          userRatingMin: z.number().optional(),
          userRatingMax: z.number().optional(),
          agentScoreMin: z.number().optional(),
          agentScoreMax: z.number().optional(),
        })
        .strict()
        .optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().max(500).default(50),
    })
    .strict()
    .optional(),
  "runs.get": z.object({ runId: idSchema }).strict(),
  "runs.rate": z
    .object({
      runId: idSchema,
      value: z.number().int().min(1).max(5),
      note: z.string().optional(),
    })
    .strict(),
  "runs.judge": z.object({ runId: idSchema, agentId: idSchema }).strict(),
  "runs.export": z
    .object({
      filter: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .optional(),
  "runs.delete": z
    .object({
      ids: z.array(idSchema).optional(),
      sessionId: idSchema.optional(),
      agentId: idSchema.optional(),
      model: z.string().min(1).optional(),
      cwd: z.string().min(1).optional(),
      outcome: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
      from: z.string().min(1).optional(),
      to: z.string().min(1).optional(),
      userRatingMin: z.number().optional(),
      userRatingMax: z.number().optional(),
      agentScoreMin: z.number().optional(),
      agentScoreMax: z.number().optional(),
    })
    .strict(),
};

/**
 * Validate an invoke payload for a known method. Unknown methods fail closed.
 */
export function validateBridgePayload(method: string, payload: unknown): unknown {
  const schema = bridgePayloadSchemas[method];
  if (!schema) {
    // Methods without a dedicated schema yet must still not accept arbitrary objects.
    if (payload !== undefined) {
      throw new Error(`Unexpected payload for ${method}`);
    }
    return undefined;
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid payload for ${method}`);
  }
  return result.data;
}
