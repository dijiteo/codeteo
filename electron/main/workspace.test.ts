import { afterEach, describe, expect, it } from 'vitest'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createWorkspaceEntry,
  listWorkspaceDirectory,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveExistingEntry,
  resolveWorkspacePath,
  saveWorkspaceFile,
  validateEntryName,
} from './workspace'

let workspace = ''

afterEach(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true })
  workspace = ''
})

async function makeWorkspace(): Promise<string> {
  workspace = await mkdtemp(join(tmpdir(), 'dijiteo-workspace-'))
  await mkdir(join(workspace, 'src'))
  await writeFile(join(workspace, 'src', 'app.ts'), 'export const answer = 42\n', 'utf8')
  await writeFile(join(workspace, 'photo.bin'), Buffer.from([0, 1, 2]))
  return workspace
}

describe('workspace file access', () => {
  it('rejects traversal and absolute paths', async () => {
    const root = await makeWorkspace()
    expect(() => resolveWorkspacePath(root, '../outside.txt')).toThrow()
    expect(() => resolveWorkspacePath(root, 'C:\\outside.txt')).toThrow()
    await expect(readWorkspaceFile(root, '..\\outside.txt')).rejects.toThrow()
  })

  it('lists directories before files and skips ignored folders', async () => {
    const root = await makeWorkspace()
    await mkdir(join(root, 'node_modules'))
    const entries = await listWorkspaceDirectory(root)
    expect(entries.map((entry) => [entry.name, entry.type])).toEqual([
      ['src', 'directory'],
      ['photo.bin', 'file'],
    ])
  })

  it('reads UTF-8 text, recognizes languages, and refuses binary data', async () => {
    const root = await makeWorkspace()
    const file = await readWorkspaceFile(root, 'src/app.ts')
    expect(file.language).toBe('typescript')
    expect(file.content).toContain('answer = 42')
    await expect(readWorkspaceFile(root, 'photo.bin')).rejects.toThrow(/binary/)
  })

  it('saves only inside the workspace', async () => {
    const root = await makeWorkspace()
    await saveWorkspaceFile(root, 'src/app.ts', 'export const answer = 7\n')
    await expect(readFile(join(root, 'src', 'app.ts'), 'utf8')).resolves.toBe('export const answer = 7\n')
    await expect(saveWorkspaceFile(root, '../outside.txt', 'unsafe')).rejects.toThrow()
  })
})

describe('workspace entry changes', () => {
  it('accepts normal names and rejects names Windows cannot use', () => {
    expect(validateEntryName('  notes.md ')).toBe('notes.md')
    for (const name of ['', '.', '..', 'a/b', 'a\\b', 'what?.ts', 'CON', 'nul.txt', 'trailing.', 'x'.repeat(256)]) {
      expect(() => validateEntryName(name)).toThrow()
    }
  })

  it('creates files and folders inside the workspace only', async () => {
    const root = await makeWorkspace()
    const file = await createWorkspaceEntry(root, 'src', 'login.ts', 'file')
    expect(file).toEqual({ name: 'login.ts', path: join('src', 'login.ts'), type: 'file' })
    await expect(readFile(join(root, 'src', 'login.ts'), 'utf8')).resolves.toBe('')
    const folder = await createWorkspaceEntry(root, '', 'components', 'directory')
    expect(folder.type).toBe('directory')
    await expect(createWorkspaceEntry(root, 'src', 'login.ts', 'file')).rejects.toThrow(/already exists/)
    await expect(createWorkspaceEntry(root, '..', 'escape.ts', 'file')).rejects.toThrow()
    await expect(createWorkspaceEntry(root, 'src/app.ts', 'child.ts', 'file')).rejects.toThrow(/inside a folder/)
  })

  it('renames entries without overwriting existing ones', async () => {
    const root = await makeWorkspace()
    await writeFile(join(root, 'src', 'other.ts'), '', 'utf8')
    await expect(renameWorkspaceEntry(root, 'src/app.ts', 'other.ts')).rejects.toThrow(/already exists/)
    const renamed = await renameWorkspaceEntry(root, 'src/app.ts', 'main.ts')
    expect(renamed).toEqual({ name: 'main.ts', path: join('src', 'main.ts'), type: 'file' })
    await expect(readFile(join(root, 'src', 'main.ts'), 'utf8')).resolves.toContain('answer = 42')
    const caseOnly = await renameWorkspaceEntry(root, 'src/main.ts', 'Main.ts')
    expect(caseOnly.name).toBe('Main.ts')
    const folder = await renameWorkspaceEntry(root, 'src', 'source')
    expect(folder.type).toBe('directory')
    await expect(access(join(root, 'source', 'Main.ts'))).resolves.toBeUndefined()
  })

  it('never targets the workspace root or paths outside it', async () => {
    const root = await makeWorkspace()
    await expect(resolveExistingEntry(root, '')).rejects.toThrow()
    await expect(resolveExistingEntry(root, '.')).rejects.toThrow()
    await expect(resolveExistingEntry(root, '../')).rejects.toThrow()
    await expect(resolveExistingEntry(root, 'src')).resolves.toBe(await realpath(join(root, 'src')))
  })
})
