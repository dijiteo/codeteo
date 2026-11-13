import { lstat, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import type { EditorFile, WorkspaceEntry } from '../../src/shared/contracts'

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024
const ignoredDirectories = new Set(['.git', 'node_modules', '.idea', '.vscode', 'dist', 'out', 'coverage'])

const languageByExtension: Record<string, string> = {
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.go': 'go',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.html': 'html',
  '.htm': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.sql': 'sql',
  '.svg': 'xml',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}

export function resolveWorkspacePath(root: string, relativePath: string, allowRoot = false): string {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')) {
    throw new Error('The requested path is invalid.')
  }
  if (relativePath === '' && allowRoot) return root
  if (relativePath.trim() === '' || isAbsolute(relativePath) || win32.isAbsolute(relativePath)) {
    throw new Error('The requested path must be inside the current workspace.')
  }
  const segments = relativePath.split(/[\\/]+/)
  if (segments.includes('..')) throw new Error('The requested path must be inside the current workspace.')
  const target = resolve(root, relativePath)
  if (!isInside(root, target)) throw new Error('The requested path must be inside the current workspace.')
  return target
}

async function resolveRealWorkspacePath(root: string, relativePath: string, allowRoot = false): Promise<string> {
  const candidate = resolveWorkspacePath(root, relativePath, allowRoot)
  const canonical = await realpath(candidate)
  if (!isInside(root, canonical)) throw new Error('The requested path must be inside the current workspace.')
  return canonical
}

export async function validateWorkspaceRoot(rootPath: string): Promise<string> {
  const root = await realpath(rootPath)
  if (!(await stat(root)).isDirectory()) throw new Error('Choose an existing folder as the workspace.')
  return root
}

export async function listWorkspaceDirectory(root: string, relativePath = ''): Promise<WorkspaceEntry[]> {
  const directory = await resolveRealWorkspacePath(root, relativePath, true)
  const entries = await readdir(directory, { withFileTypes: true })
  const visible: WorkspaceEntry[] = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const childPath = relative(root, resolve(directory, entry.name))
    visible.push({
      name: entry.name,
      path: childPath,
      type: entry.isDirectory() ? 'directory' : 'file',
    })
  }
  return visible.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}

export async function readWorkspaceFile(root: string, relativePath: string): Promise<EditorFile> {
  const candidate = resolveWorkspacePath(root, relativePath)
  const details = await lstat(candidate)
  if (details.isSymbolicLink() || !details.isFile()) throw new Error('Only regular workspace files can be opened.')
  const filePath = await resolveRealWorkspacePath(root, relativePath)
  const fileStat = await stat(filePath)
  if (fileStat.size > MAX_TEXT_FILE_BYTES) throw new Error('This file is larger than the 5 MB editor limit.')
  const data = await readFile(filePath)
  if (data.includes(0)) throw new Error('This looks like a binary file and cannot be opened as text.')
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    throw new Error('This file is not valid UTF-8 text.')
  }
  return {
    name: basename(filePath),
    path: relative(root, filePath),
    content,
    language: languageByExtension[extname(filePath).toLowerCase()] ?? 'plain',
  }
}

export async function saveWorkspaceFile(root: string, relativePath: string, content: string): Promise<void> {
  if (typeof content !== 'string') throw new Error('File contents must be text.')
  const candidate = resolveWorkspacePath(root, relativePath)
  const details = await lstat(candidate)
  if (details.isSymbolicLink() || !details.isFile()) throw new Error('Only existing regular workspace files can be saved.')
  const filePath = await resolveRealWorkspacePath(root, relativePath)
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.length > MAX_TEXT_FILE_BYTES) throw new Error('This file is larger than the 5 MB editor limit.')
  await writeFile(filePath, bytes)
}

const invalidNameCharacters = /[<>:"/\\|?*\u0000-\u001f]/
const reservedWindowsNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export function validateEntryName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.length > 255 ||
    invalidNameCharacters.test(trimmed) ||
    reservedWindowsNames.test(trimmed) ||
    /[. ]$/.test(trimmed)
  ) {
    throw new Error(`"${trimmed}" is not a valid Windows file or folder name.`)
  }
  return trimmed
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw cause
  }
}

export async function resolveExistingEntry(root: string, relativePath: string): Promise<string> {
  const candidate = resolveWorkspacePath(root, relativePath)
  if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Symbolic links cannot be changed from the explorer.')
  const canonical = await resolveRealWorkspacePath(root, relativePath)
  if (relative(root, canonical) === '') throw new Error('The workspace folder itself cannot be changed from the explorer.')
  return canonical
}

export async function createWorkspaceEntry(
  root: string,
  parentPath: string,
  name: string,
  type: WorkspaceEntry['type'],
): Promise<WorkspaceEntry> {
  const directory = await resolveRealWorkspacePath(root, parentPath, true)
  if (!(await stat(directory)).isDirectory()) throw new Error('New items can only be created inside a folder.')
  const entryName = validateEntryName(name)
  const target = resolve(directory, entryName)
  if (!isInside(root, target)) throw new Error('The requested path must be inside the current workspace.')
  try {
    if (type === 'directory') await mkdir(target)
    else await writeFile(target, '', { flag: 'wx' })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`"${entryName}" already exists in this folder.`)
    throw cause
  }
  return { name: entryName, path: relative(root, target), type }
}

export async function renameWorkspaceEntry(root: string, relativePath: string, newName: string): Promise<WorkspaceEntry> {
  const source = await resolveExistingEntry(root, relativePath)
  const entryName = validateEntryName(newName)
  const target = resolve(dirname(source), entryName)
  if (!isInside(root, target)) throw new Error('The requested path must be inside the current workspace.')
  const caseOnlyChange = target.toLowerCase() === source.toLowerCase()
  if (!caseOnlyChange && await pathExists(target)) throw new Error(`"${entryName}" already exists in this folder.`)
  await rename(source, target)
  const details = await stat(target)
  return { name: entryName, path: relative(root, target), type: details.isDirectory() ? 'directory' : 'file' }
}
