import { stripControlSequences } from "../workspace/commands.js";

/** Soft cap for a single agent text chunk stored in the conversation (1 MiB). */
export const MAX_AGENT_TEXT_CHARS = 1024 * 1024;

/**
 * Prepare agent-authored text for storage and display: strip terminal control
 * sequences and truncate oversized payloads (SC-016 / research.md R4, R9).
 */
export function sanitizeAgentText(
  input: string,
  options?: { maxChars?: number },
): { text: string; truncated: boolean } {
  const maxChars = options?.maxChars ?? MAX_AGENT_TEXT_CHARS;
  const stripped = stripControlSequences(input);
  if (stripped.length <= maxChars) {
    return { text: stripped, truncated: false };
  }
  return { text: stripped.slice(0, maxChars), truncated: true };
}

/**
 * Reject clearly malformed ACP update shapes before they reach the store.
 * Returns null when the payload cannot be treated as a plain object.
 */
export function asSafeUpdateRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export { stripControlSequences };
