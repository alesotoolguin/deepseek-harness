import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listLocalBranches } from '../src/index.ts'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-git-list-'))
  tempRoots.push(dir)
  return dir
}

async function makeRepo(root: string): Promise<string> {
  await mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true })
  await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  return root
}

async function looseRef(root: string, name: string): Promise<void> {
  const file = path.join(root, '.git', 'refs', 'heads', ...name.split('/'))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${'a'.repeat(40)}\n`)
}

describe('listLocalBranches', () => {
  it('lists loose refs sorted, including nested branch names', async () => {
    const root = await makeRepo(await tempDir())
    await looseRef(root, 'main')
    await looseRef(root, 'feature/x')
    await looseRef(root, 'a')
    await expect(listLocalBranches(root)).resolves.toEqual({
      repo: root,
      branches: ['a', 'feature/x', 'main'],
    })
  })

  it('includes packed refs and skips .lock files', async () => {
    const root = await makeRepo(await tempDir())
    await looseRef(root, 'main')
    await writeFile(path.join(root, '.git', 'refs', 'heads', 'main.lock'), 'stale\n')
    await writeFile(
      path.join(root, '.git', 'packed-refs'),
      '# pack-refs with: peeled fully-peeled sorted\n'
        + `${'b'.repeat(40)} refs/heads/release\n`
        + `^${'c'.repeat(40)}\n`,
    )
    await expect(listLocalBranches(root)).resolves.toEqual({
      repo: root,
      branches: ['main', 'release'],
    })
  })

  it('returns nulls outside any repository', async () => {
    const root = await tempDir()
    await expect(listLocalBranches(root)).resolves.toEqual({ repo: null, branches: [] })
  })

  it('reads a linked worktree refs through the commondir file', async () => {
    const root = await tempDir()
    const gitdir = path.join(root, '.gitdir')
    const shared = path.join(root, 'shared')
    await mkdir(path.join(shared, 'refs', 'heads'), { recursive: true })
    await writeFile(path.join(shared, 'refs', 'heads', 'wt-branch'), `${'a'.repeat(40)}\n`)
    await mkdir(gitdir, { recursive: true })
    await writeFile(path.join(gitdir, 'HEAD'), 'ref: refs/heads/wt-branch\n')
    await writeFile(path.join(gitdir, 'commondir'), '../shared\n')
    await writeFile(path.join(root, '.git'), `gitdir: ${gitdir}\n`)
    await expect(listLocalBranches(root)).resolves.toEqual({
      repo: root,
      branches: ['wt-branch'],
    })
  })

  it('lists the fallback repository outside any workspace repository', async () => {
    const workspace = await tempDir()
    const harness = await makeRepo(await tempDir())
    await looseRef(harness, 'main')
    await expect(listLocalBranches(workspace, harness)).resolves.toEqual({
      repo: harness,
      branches: ['main'],
    })
  })
})
