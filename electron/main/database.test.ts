import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockAppPaths = vi.hoisted(() => ({ userData: '', appPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockAppPaths.userData,
    getAppPath: () => mockAppPaths.appPath,
  },
}))

import { closeDatabase, getSetting, initializeDatabase, listRecentWorkspaces, recordWorkspace, setSetting } from './database'

describe('workspace history database', () => {
  let userDataDirectory = ''

  beforeEach(async () => {
    userDataDirectory = await mkdtemp(join(tmpdir(), 'dijiteo-history-'))
    mockAppPaths.userData = userDataDirectory
    mockAppPaths.appPath = process.cwd()
  })

  afterEach(async () => {
    closeDatabase()
    if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true })
    userDataDirectory = ''
  })

  it('persists recent workspaces across database restarts', async () => {
    await initializeDatabase()
    recordWorkspace('C:\\Projects\\example')
    const firstRead = listRecentWorkspaces()

    expect(firstRead).toHaveLength(1)
    expect(firstRead[0]).toMatchObject({ path: 'C:\\Projects\\example' })
    expect(firstRead[0]?.openedAt).toEqual(expect.any(Number))

    closeDatabase()
    await initializeDatabase()

    expect(listRecentWorkspaces()).toEqual(firstRead)
  })

  it('keeps one case-insensitive history entry for a Windows path', async () => {
    await initializeDatabase()
    recordWorkspace('C:\\Projects\\example')
    recordWorkspace('c:\\projects\\EXAMPLE')

    expect(listRecentWorkspaces()).toHaveLength(1)
  })

  it('stores, overwrites, persists, and clears app settings', async () => {
    await initializeDatabase()
    expect(getSetting('ai.selection')).toBeNull()
    setSetting('ai.selection', 'first')
    setSetting('ai.selection', 'second')
    closeDatabase()
    await initializeDatabase()
    expect(getSetting('ai.selection')).toBe('second')
    setSetting('ai.selection', null)
    expect(getSetting('ai.selection')).toBeNull()
  })
})
