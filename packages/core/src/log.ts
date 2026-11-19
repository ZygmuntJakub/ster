export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  message: string;
  at: string;
  fields?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export type LogSink = (record: LogRecord) => void;

const SENSITIVE_KEY =
  /(?:^|[_.-])(api[_-]?key|token|secret|password|passwd|authorization|auth|credential|cookie|session[_-]?key|private[_-]?key|access[_-]?key|refresh[_-]?token|bearer)(?:$|[_.-])/i;

const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_SECRET_RE =
  /\b((?:api[_-]?key|token|secret|password|passwd|access[_-]?key|refresh[_-]?token)\s*[=:]\s*)([^\s,;]+)/gi;

const REDACTED = "[REDACTED]";

/**
 * Redact credential-like keys and common secret patterns from a log field value.
 * Environment variable maps are treated as sensitive wholesale for values of matching keys.
 */
export function redactValue(value: unknown, keyHint?: string): unknown {
  if (keyHint !== undefined && SENSITIVE_KEY.test(keyHint)) {
    return REDACTED;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactValue(child, key);
    }
    return out;
  }
  return value;
}

function redactString(input: string): string {
  return input
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(KEY_VALUE_SECRET_RE, `$1${REDACTED}`);
}

function defaultSink(record: LogRecord): void {
  const line = JSON.stringify(record);
  if (record.level === "error" || record.level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/**
 * Create a logger that always redacts credentials and environment secret values.
 */
export function createLogger(
  options: {
    sink?: LogSink;
    fields?: Record<string, unknown>;
    now?: () => Date;
  } = {},
): Logger {
  const sink = options.sink ?? defaultSink;
  const baseFields = options.fields ?? {};
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    const merged = { ...baseFields, ...fields };
    const redactedFields = Object.keys(merged).length
      ? (redactValue(merged) as Record<string, unknown>)
      : undefined;
    sink({
      level,
      message: redactString(message),
      at: now().toISOString(),
      ...(redactedFields ? { fields: redactedFields } : {}),
    });
  };

  const logger: Logger = {
    debug: (message, fields) => {
      write("debug", message, fields);
    },
    info: (message, fields) => {
      write("info", message, fields);
    },
    warn: (message, fields) => {
      write("warn", message, fields);
    },
    error: (message, fields) => {
      write("error", message, fields);
    },
    child: (fields) =>
      createLogger({
        sink,
        now,
        fields: { ...baseFields, ...fields },
      }),
  };
  return logger;
}
