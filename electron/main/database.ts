import initSqlJs from 'sql.js'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface WorkspaceRecord {
  path: string
  openedAt: number
}

type SqlDatabase = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>

let database: SqlDatabase | null = null
let databasePath = ''

function requireDatabase(): SqlDatabase {
  if (!database) throw new Error('Workspace history is not ready.')
  return database
}

function persistDatabase(): void {
  if (!database || !databasePath) return
  writeFileSync(databasePath, Buffer.from(database.export()))
}

export async function initializeDatabase(): Promise<void> {
  databasePath = join(app.getPath('userData'), 'workspace-history.sqlite')
  mkdirSync(dirname(databasePath), { recursive: true })

  const SQL = await initSqlJs({
    locateFile: (fileName) => join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', fileName),
  })
  const existingData = existsSync(databasePath) ? readFileSync(databasePath) : undefined
  database = existingData ? new SQL.Database(existingData) : new SQL.Database()
  database.run(`
    CREATE TABLE IF NOT EXISTS workspace_history (
      id INTEGER PRIMARY KEY,
      root_path TEXT NOT NULL COLLATE NOCASE UNIQUE,
      opened_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  persistDatabase()
}

export function getSetting(key: string): string | null {
  const [result] = requireDatabase().exec('SELECT value FROM app_settings WHERE key = ?', [key])
  const value = result?.values[0]?.[0]
  return typeof value === 'string' ? value : null
}

export function setSetting(key: string, value: string | null): void {
  const store = requireDatabase()
  if (value === null) store.run('DELETE FROM app_settings WHERE key = ?', [key])
  else store.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  persistDatabase()
}

export function recordWorkspace(path: string): void {
  const store = requireDatabase()
  store.run(`
    INSERT INTO workspace_history (root_path, opened_at)
    VALUES (?, ?)
    ON CONFLICT(root_path) DO UPDATE SET opened_at = excluded.opened_at
  `, [path, Date.now()])
  persistDatabase()
}

export function listRecentWorkspaces(limit = 8): WorkspaceRecord[] {
  const store = requireDatabase()
  const [result] = store.exec(`
    SELECT root_path AS path, opened_at AS openedAt
    FROM workspace_history
    ORDER BY opened_at DESC
    LIMIT ?
  `, [Math.min(Math.max(limit, 1), 20)])

  return (result?.values ?? []).flatMap(([path, openedAt]) => (
    typeof path === 'string' && typeof openedAt === 'number' ? [{ path, openedAt }] : []
  ))
}

export function closeDatabase(): void {
  if (!database) return
  persistDatabase()
  database.close()
  database = null
  databasePath = ''
}
