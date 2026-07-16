import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { Database } from "bun:sqlite";

type DatabaseEntry = {
  database: Database;
};

const databaseCache = new Map<string, DatabaseEntry>();

export function getSqliteDatabaseFilePath() {
  return join(process.cwd(), "habitat.sqlite");
}

function ensureDatabaseDirectory() {
  mkdirSync(dirname(getSqliteDatabaseFilePath()), { recursive: true });
}

function initializeDatabase(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS state_blobs (
      namespace TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS clock_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode TEXT NOT NULL,
      stream_status TEXT NOT NULL,
      last_kepler_tick INTEGER,
      last_advanced_by INTEGER,
      last_connected_at TEXT,
      last_message_at TEXT,
      last_connection_error TEXT
    )
  `);
  const migration = database.query("SELECT version FROM schema_migrations WHERE version = 1").get();
  if (!migration) {
    const legacy = database.query("SELECT data FROM state_blobs WHERE namespace = ?").get("clock") as { data?: string } | null;
    let state: Record<string, unknown> = {};
    try {
      state = legacy?.data ? JSON.parse(legacy.data) as Record<string, unknown> : {};
    } catch {
      state = {};
    }
    database.query(`
      INSERT OR IGNORE INTO clock_state
        (id, mode, stream_status, last_kepler_tick, last_advanced_by, last_connected_at, last_message_at, last_connection_error)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      state.mode === "listening" ? "listening" : "manual",
      typeof state.streamStatus === "string" ? state.streamStatus : "disconnected",
      typeof state.lastKeplerTick === "number" ? state.lastKeplerTick : null,
      typeof state.lastAdvancedBy === "number" ? state.lastAdvancedBy : null,
      typeof state.lastConnectedAt === "string" ? state.lastConnectedAt : null,
      typeof state.lastMessageAt === "string" ? state.lastMessageAt : typeof state.lastTickAt === "string" ? state.lastTickAt : null,
      typeof state.lastConnectionError === "string" ? state.lastConnectionError : null,
    );
    database.query("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  }
}

export function getSqliteDatabase() {
  const filePath = getSqliteDatabaseFilePath();
  const cached = databaseCache.get(filePath);

  if (cached) {
    return cached.database;
  }

  ensureDatabaseDirectory();
  const database = new Database(filePath, { create: true });
  initializeDatabase(database);
  databaseCache.set(filePath, { database });
  return database;
}

export function readStateBlob(namespace: string) {
  const database = getSqliteDatabase();
  const row = database.query("SELECT data FROM state_blobs WHERE namespace = ?").get(namespace) as
    | { data?: string }
    | null;

  return row?.data ?? null;
}

export function writeStateBlob(namespace: string, data: string) {
  const database = getSqliteDatabase();
  database.query(
    `INSERT INTO state_blobs (namespace, data)
     VALUES (?, ?)
     ON CONFLICT(namespace) DO UPDATE SET data = excluded.data`,
  ).run(namespace, data);
}

export function deleteStateBlob(namespace: string) {
  const database = getSqliteDatabase();
  database.query("DELETE FROM state_blobs WHERE namespace = ?").run(namespace);
}

export function runSqliteTransaction<T>(work: () => T): T {
  const database = getSqliteDatabase();
  return database.transaction(work)();
}

export type ClockStateRow = {
  mode: string;
  stream_status: string;
  last_kepler_tick: number | null;
  last_advanced_by: number | null;
  last_connected_at: string | null;
  last_message_at: string | null;
  last_connection_error: string | null;
};

export function readClockStateRow() {
  return getSqliteDatabase().query(
    "SELECT mode, stream_status, last_kepler_tick, last_advanced_by, last_connected_at, last_message_at, last_connection_error FROM clock_state WHERE id = 1",
  ).get() as ClockStateRow | null;
}

export function writeClockStateRow(row: ClockStateRow) {
  getSqliteDatabase().query(`
    INSERT INTO clock_state (id, mode, stream_status, last_kepler_tick, last_advanced_by, last_connected_at, last_message_at, last_connection_error)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      stream_status = excluded.stream_status,
      last_kepler_tick = excluded.last_kepler_tick,
      last_advanced_by = excluded.last_advanced_by,
      last_connected_at = excluded.last_connected_at,
      last_message_at = excluded.last_message_at,
      last_connection_error = excluded.last_connection_error
  `).run(row.mode, row.stream_status, row.last_kepler_tick, row.last_advanced_by, row.last_connected_at, row.last_message_at, row.last_connection_error);
}
