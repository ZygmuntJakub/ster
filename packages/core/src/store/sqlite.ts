import { chmodSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { SterError } from "../errors.js";
import type {
  ConversationItemRow,
  ItemPage,
  NewConversationItem,
  SessionRow,
  Store,
} from "./store.js";

const DB_FILE_NAME = "ster.sqlite";
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export interface OpenSqliteStoreOptions {
  dataDir: string;
  /** Override database file name; useful for tests. */
  dbFileName?: string;
}

export type SqliteStore = Store;

type SqlRow = Record<string, null | number | bigint | string | Uint8Array>;

function asString(value: SqlRow[string], field: string): string {
  if (typeof value !== "string") {
    throw new SterError("invalid-argument", `Expected string column ${field}`);
  }
  return value;
}

function asNumber(value: SqlRow[string], field: string): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value !== "number") {
    throw new SterError("invalid-argument", `Expected number column ${field}`);
  }
  return value;
}

function ensurePrivateDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    chmodSync(dataDir, 0o700);
  }
}

function ensurePrivateDbFile(dbPath: string): void {
  if (process.platform !== "win32" && dbPath !== ":memory:") {
    chmodSync(dbPath, 0o600);
  }
}

function listMigrationFiles(): Array<{ version: number; path: string }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.*\.sql$/u.test(name))
    .map((name) => {
      const match = /^(\d+)_/u.exec(name);
      if (!match?.[1]) {
        throw new SterError("invalid-argument", `Bad migration filename: ${name}`);
      }
      return { version: Number(match[1]), path: join(MIGRATIONS_DIR, name) };
    })
    .sort((a, b) => a.version - b.version);
  return files;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => asNumber((row as SqlRow)["version"] ?? null, "version")),
  );

  for (const migration of listMigrationFiles()) {
    if (applied.has(migration.version)) {
      continue;
    }
    const sql = readFileSync(migration.path, "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function mapSession(row: SqlRow): SessionRow {
  return {
    id: asString(row["id"] ?? null, "id"),
    agentId: asString(row["agent_id"] ?? null, "agent_id"),
    agentVersion: asString(row["agent_version"] ?? null, "agent_version"),
    cwd: asString(row["cwd"] ?? null, "cwd"),
    title: asString(row["title"] ?? null, "title"),
    status: asString(row["status"] ?? null, "status"),
    permissionMode: asString(row["permission_mode"] ?? null, "permission_mode"),
    createdAt: asString(row["created_at"] ?? null, "created_at"),
    lastActivityAt: asString(row["last_activity_at"] ?? null, "last_activity_at"),
    payloadJson: asString(row["payload_json"] ?? null, "payload_json"),
  };
}

function mapItem(row: SqlRow): ConversationItemRow {
  return {
    sessionId: asString(row["session_id"] ?? null, "session_id"),
    seq: asNumber(row["seq"] ?? null, "seq"),
    kind: asString(row["kind"] ?? null, "kind"),
    runId: asString(row["run_id"] ?? null, "run_id"),
    createdAt: asString(row["created_at"] ?? null, "created_at"),
    payloadJson: asString(row["payload_json"] ?? null, "payload_json"),
  };
}

/**
 * Open (or create) the per-user SQLite store under `dataDir` with user-only permissions.
 */
export function openSqliteStore(options: OpenSqliteStoreOptions): SqliteStore {
  const dataDir = options.dataDir;
  ensurePrivateDataDir(dataDir);

  const dbPath = join(dataDir, options.dbFileName ?? DB_FILE_NAME);
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch (cause) {
    throw new SterError("invalid-argument", "Data directory is unusable for SQLite", {
      dataDir,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  ensurePrivateDbFile(dbPath);

  const store: SqliteStore = {
    dataDir,
    dbPath,

    migrationVersion() {
      const row = db
        .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
        .get() as SqlRow | undefined;
      return asNumber(row?.["version"] ?? 0, "version");
    },

    listAppliedMigrations() {
      return db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => asNumber((row as SqlRow)["version"] ?? null, "version"));
    },

    putSession(row) {
      db.prepare(
        `INSERT INTO sessions (
          id, agent_id, agent_version, cwd, title, status, permission_mode,
          created_at, last_activity_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent_id = excluded.agent_id,
          agent_version = excluded.agent_version,
          cwd = excluded.cwd,
          title = excluded.title,
          status = excluded.status,
          permission_mode = excluded.permission_mode,
          created_at = excluded.created_at,
          last_activity_at = excluded.last_activity_at,
          payload_json = excluded.payload_json`,
      ).run(
        row.id,
        row.agentId,
        row.agentVersion,
        row.cwd,
        row.title,
        row.status,
        row.permissionMode,
        row.createdAt,
        row.lastActivityAt,
        row.payloadJson,
      );
    },

    getSession(id) {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SqlRow | undefined;
      return row ? mapSession(row) : null;
    },

    listSessions() {
      return db
        .prepare("SELECT * FROM sessions ORDER BY last_activity_at DESC")
        .all()
        .map((row) => mapSession(row as SqlRow));
    },

    deleteSession(id) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    },

    appendItem(item: NewConversationItem) {
      const seq =
        item.seq ??
        asNumber(
          (
            db
              .prepare(
                "SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM conversation_items WHERE session_id = ?",
              )
              .get(item.sessionId) as SqlRow
          )["seq"] ?? null,
          "seq",
        );

      db.prepare(
        `INSERT INTO conversation_items (
          session_id, seq, kind, run_id, created_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(item.sessionId, seq, item.kind, item.runId, item.createdAt, item.payloadJson);

      return {
        sessionId: item.sessionId,
        seq,
        kind: item.kind,
        runId: item.runId,
        createdAt: item.createdAt,
        payloadJson: item.payloadJson,
      };
    },

    updateItemPayload(sessionId, seq, payloadJson) {
      const result = db
        .prepare("UPDATE conversation_items SET payload_json = ? WHERE session_id = ? AND seq = ?")
        .run(payloadJson, sessionId, seq);
      if (result.changes === 0) {
        throw new SterError("not-found", "Conversation item not found", { sessionId, seq });
      }
      const row = db
        .prepare("SELECT * FROM conversation_items WHERE session_id = ? AND seq = ?")
        .get(sessionId, seq) as SqlRow;
      return mapItem(row);
    },

    listItems(sessionId, page: ItemPage) {
      if (page.limit <= 0) {
        throw new SterError("invalid-argument", "Item page limit must be positive");
      }
      const rows =
        page.before === undefined
          ? db
              .prepare(
                `SELECT * FROM conversation_items
                 WHERE session_id = ?
                 ORDER BY seq DESC
                 LIMIT ?`,
              )
              .all(sessionId, page.limit)
          : db
              .prepare(
                `SELECT * FROM conversation_items
                 WHERE session_id = ? AND seq < ?
                 ORDER BY seq DESC
                 LIMIT ?`,
              )
              .all(sessionId, page.before, page.limit);
      return rows.map((row) => mapItem(row as SqlRow));
    },

    getSetting(key) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        SqlRow | undefined;
      return row ? asString(row["value"] ?? null, "value") : null;
    },

    setSetting(key, value) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },

    close() {
      db.close();
    },
  };

  return store;
}

export { DB_FILE_NAME };
