import { describe, expect, it } from 'vitest'
import { parseGitStatus } from './git'

describe('Git status parsing', () => {
  it('reads the current branch and counts changed files', () => {
    expect(parseGitStatus('## main\n M src/App.tsx\n?? notes.txt\n')).toEqual({
      status: 'repository',
      branch: 'main',
      changedFiles: 2,
    })
  })

  it('reports a folder without Git metadata', () => {
    expect(parseGitStatus('')).toEqual({ status: 'not-repository' })
  })
})
