/**
 * Stable error codes from contracts/core-api.md.
 * User-facing text is produced by the front end from the code, never from `message`.
 */
export const STER_ERROR_CODES = [
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
] as const;

export type SterErrorCode = (typeof STER_ERROR_CODES)[number];

const codeSet: ReadonlySet<string> = new Set(STER_ERROR_CODES);

export function isSterErrorCode(value: string): value is SterErrorCode {
  return codeSet.has(value);
}

/**
 * Typed rejection for core service calls.
 */
export class SterError extends Error {
  readonly code: SterErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: SterErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "SterError";
    this.code = code;
    this.details = details;
  }
}

export function isSterError(value: unknown): value is SterError {
  return value instanceof SterError;
}
