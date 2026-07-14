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
