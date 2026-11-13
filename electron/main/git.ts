import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WorkspaceGitStatus } from '../../src/shared/contracts'

const execFileAsync = promisify(execFile)

export function parseGitStatus(output: string): WorkspaceGitStatus {
  const lines = output.replace(/\r/g, '').split('\n').filter(Boolean)
  const header = lines[0]
  if (!header?.startsWith('## ')) return { status: 'not-repository' }

  return {
    status: 'repository',
    branch: header.slice(3),
    changedFiles: lines.length - 1,
  }
}

export async function getWorkspaceGitStatus(root: string): Promise<WorkspaceGitStatus> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-C', root,
      'status',
      '--porcelain=v1',
      '--branch',
      '--untracked-files=all',
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    })
    return parseGitStatus(stdout)
  } catch (cause) {
    const error = cause as { code?: string | number; stderr?: string }
    if (error.code === 'ENOENT') return { status: 'git-unavailable' }
    if (error.code === 128 && /not a git repository/i.test(error.stderr ?? '')) {
      return { status: 'not-repository' }
    }
    throw new Error('Could not read Git status for this workspace.')
  }
}
