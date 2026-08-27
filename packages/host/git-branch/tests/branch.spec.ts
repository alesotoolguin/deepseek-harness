import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveGitBranch } from '../src/index.ts'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-git-branch-'))
  tempRoots.push(dir)
  return dir
}

describe('resolveGitBranch', () => {
  it('reads the checked-out branch from .git/HEAD', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.git'), { recursive: true })
    await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n')
    await expect(resolveGitBranch(root)).resolves.toEqual({ branch: 'feature-x', repo: root })
  })

  it('walks up to the nearest enclosing repository', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.git'), { recursive: true })
    await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    const nested = path.join(root, 'a', 'b')
    await mkdir(nested, { recursive: true })
    await expect(resolveGitBranch(nested)).resolves.toEqual({ branch: 'main', repo: root })
  })

  it('reports a detached HEAD as a short commit', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.git'), { recursive: true })
    await writeFile(path.join(root, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n')
    await expect(resolveGitBranch(root)).resolves.toEqual({ branch: 'detached @ 0123456', repo: root })
  })

  it('resolves a linked worktree through the .git gitdir file', async () => {
    const root = await tempDir()
    const gitdir = path.join(root, '.gitdir')
    await mkdir(gitdir, { recursive: true })
    await writeFile(path.join(gitdir, 'HEAD'), 'ref: refs/heads/wt-branch\n')
    await writeFile(path.join(root, '.git'), `gitdir: ${gitdir}\n`)
    await expect(resolveGitBranch(root)).resolves.toEqual({ branch: 'wt-branch', repo: root })
  })

  it('returns nulls outside any repository', async () => {
    const root = await tempDir()
    await expect(resolveGitBranch(root)).resolves.toEqual({ branch: null, repo: null })
  })
})
