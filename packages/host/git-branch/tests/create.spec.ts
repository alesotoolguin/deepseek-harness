import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBranch, isValidBranchName } from '../src/index.ts'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-git-create-'))
  tempRoots.push(dir)
  return dir
}

const SHA = '0123456789abcdef0123456789abcdef01234567'

async function makeRepo(root: string, head = 'ref: refs/heads/main\n'): Promise<string> {
  await mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true })
  await writeFile(path.join(root, '.git', 'HEAD'), head)
  await writeFile(path.join(root, '.git', 'refs', 'heads', 'main'), `${SHA}\n`)
  return root
}

describe('createBranch', () => {
  it('creates the ref at the current commit and switches HEAD', async () => {
    const root = await makeRepo(await tempDir())
    await expect(createBranch(root, 'feature-x')).resolves.toBe('feature-x')
    await expect(readFile(path.join(root, '.git', 'refs', 'heads', 'feature-x'), 'utf8'))
      .resolves.toBe(`${SHA}\n`)
    await expect(readFile(path.join(root, '.git', 'HEAD'), 'utf8'))
      .resolves.toBe('ref: refs/heads/feature-x\n')
  })

  it('creates from a detached HEAD at the checked-out commit', async () => {
    const root = await makeRepo(await tempDir(), `${SHA}\n`)
    await expect(createBranch(root, 'from-detached')).resolves.toBe('from-detached')
    await expect(readFile(path.join(root, '.git', 'refs', 'heads', 'from-detached'), 'utf8'))
      .resolves.toBe(`${SHA}\n`)
    await expect(readFile(path.join(root, '.git', 'HEAD'), 'utf8'))
      .resolves.toBe('ref: refs/heads/from-detached\n')
  })

  it('creates nested branch names', async () => {
    const root = await makeRepo(await tempDir())
    await expect(createBranch(root, 'feature/deep/x')).resolves.toBe('feature/deep/x')
    await expect(readFile(path.join(root, '.git', 'refs', 'heads', 'feature', 'deep', 'x'), 'utf8'))
      .resolves.toBe(`${SHA}\n`)
  })

  it('rejects invalid branch names', async () => {
    const root = await makeRepo(await tempDir())
    const invalid = [
      '', '.', '..', '@', '-x', '/x', 'x/', 'x.', 'x.lock', 'a..b', 'a@{b}', 'a//b',
      'a b', 'a\tb', 'a\x00b', 'a~1', 'a^', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a\x7fb',
    ]
    for (const name of invalid) {
      await expect(createBranch(root, name), `name ${JSON.stringify(name)}`).rejects
        .toThrow(/invalid branch name/)
    }
  })

  it('accepts names git permits', async () => {
    const root = await makeRepo(await tempDir())
    for (const name of ['feature/x', 'a.b', 'branch-1', 'ü']) {
      await expect(createBranch(root, name)).resolves.toBe(name)
    }
  })

  it('rejects an existing loose branch', async () => {
    const root = await makeRepo(await tempDir())
    await expect(createBranch(root, 'main')).rejects.toThrow(/already exists/)
  })

  it('rejects a branch present only in packed-refs', async () => {
    const root = await makeRepo(await tempDir())
    await writeFile(
      path.join(root, '.git', 'packed-refs'),
      `${'b'.repeat(40)} refs/heads/release\n`,
    )
    await expect(createBranch(root, 'release')).rejects.toThrow(/already exists/)
  })

  it('rejects an unborn HEAD without a resolvable commit', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true })
    await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    await expect(createBranch(root, 'feature-x')).rejects.toThrow(/unborn HEAD/)
  })

  it('rejects outside any repository', async () => {
    const root = await tempDir()
    await expect(createBranch(root, 'feature-x')).rejects.toThrow(/no git repository/)
  })

  it('writes worktree refs into the commondir and HEAD into the gitdir', async () => {
    const root = await tempDir()
    const gitdir = path.join(root, '.gitdir')
    const shared = path.join(root, 'shared')
    await mkdir(path.join(shared, 'refs', 'heads'), { recursive: true })
    await writeFile(path.join(shared, 'refs', 'heads', 'main'), `${SHA}\n`)
    await mkdir(gitdir, { recursive: true })
    await writeFile(path.join(gitdir, 'HEAD'), 'ref: refs/heads/main\n')
    await writeFile(path.join(gitdir, 'commondir'), '../shared\n')
    await writeFile(path.join(root, '.git'), `gitdir: ${gitdir}\n`)
    await expect(createBranch(root, 'wt-new')).resolves.toBe('wt-new')
    await expect(readFile(path.join(shared, 'refs', 'heads', 'wt-new'), 'utf8'))
      .resolves.toBe(`${SHA}\n`)
    await expect(readFile(path.join(gitdir, 'HEAD'), 'utf8')).resolves.toBe('ref: refs/heads/wt-new\n')
  })

  it('creates in the fallback repository outside any workspace repository', async () => {
    const workspace = await tempDir()
    const harness = await makeRepo(await tempDir())
    await expect(createBranch(workspace, 'harness-new', harness)).resolves.toBe('harness-new')
    await expect(readFile(path.join(harness, '.git', 'HEAD'), 'utf8'))
      .resolves.toBe('ref: refs/heads/harness-new\n')
  })
})

describe('isValidBranchName', () => {
  it('rejects the same names createBranch rejects', () => {
    const invalid = [
      '', '.', '..', '@', '-x', '/x', 'x/', 'x.', 'x.lock', 'a..b', 'a@{b}', 'a//b',
      'a b', 'a\tb', 'a~1', 'a^', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a\x7fb',
    ]
    for (const name of invalid) expect(isValidBranchName(name), name).toBe(false)
  })

  it('accepts names git permits', () => {
    for (const name of ['feature/x', 'a.b', 'branch-1', 'ü', 'v2.0']) {
      expect(isValidBranchName(name), name).toBe(true)
    }
  })
})
