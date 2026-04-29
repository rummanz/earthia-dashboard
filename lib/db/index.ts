// Server-only SQLite handle for Mission Control.
import Database, { type Database as DB } from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, resolve as resolvePath } from 'path'
import { SCHEMA_SQL, TASK_COLUMN_MIGRATIONS } from './schema'

const DB_PATH = resolvePath(
  process.cwd(),
  process.env.MC_DB_PATH || 'data/mission-control.db'
)

const globalAny = globalThis as unknown as { __ocDb?: DB }

interface ColumnInfo {
  name: string
}

function migrateTaskColumns(db: DB): void {
  const cols = db.prepare('PRAGMA table_info(tasks)').all() as ColumnInfo[]
  const existing = new Set(cols.map((c) => c.name))
  for (const m of TASK_COLUMN_MIGRATIONS) {
    if (existing.has(m.name)) continue
    db.exec(`ALTER TABLE tasks ${m.ddl}`)
  }
}

function open(): DB {
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA_SQL)
  migrateTaskColumns(db)
  return db
}

export function getDb(): DB {
  if (!globalAny.__ocDb) {
    globalAny.__ocDb = open()
    // Lazily start the scheduler the first time the DB is opened.
    // Dynamic import keeps this module free of a static cycle with the scheduler.
    void import('@/lib/scheduler').then((mod) => {
      try {
        mod.startScheduler()
      } catch {
        // ignore — scheduler is best-effort
      }
    }).catch(() => { /* ignore */ })
  }
  return globalAny.__ocDb
}

export function nowIso(): string {
  return new Date().toISOString()
}
