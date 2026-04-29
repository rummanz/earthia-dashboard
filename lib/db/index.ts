// Server-only SQLite handle for Mission Control.
import Database, { type Database as DB } from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, resolve as resolvePath } from 'path'
import { SCHEMA_SQL } from './schema'

const DB_PATH = resolvePath(
  process.cwd(),
  process.env.MC_DB_PATH || 'data/mission-control.db'
)

const globalAny = globalThis as unknown as { __ocDb?: DB }

function open(): DB {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA_SQL)
  return db
}

export function getDb(): DB {
  if (!globalAny.__ocDb) {
    globalAny.__ocDb = open()
  }
  return globalAny.__ocDb
}

export function nowIso(): string {
  return new Date().toISOString()
}
