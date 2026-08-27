import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import GitBranchGateway, { harnessRootFromSection } from '../src/index.ts'

const contexts: Context[] = []
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness(): Promise<{ ctx: Context; gateway: GitBranchGateway }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(GitBranchGateway)
  const gateway = ctx.get('gitBranch') as GitBranchGateway
  return { ctx, gateway }
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-git-gateway-'))
  tempRoots.push(dir)
  return dir
}

async function makeRepo(root: string): Promise<string> {
  await mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true })
  await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  await writeFile(path.join(root, '.git', 'refs', 'heads', 'main'), `${'a'.repeat(40)}\n`)
  return root
}

interface FakeSpawnCall {
  readonly argv: readonly string[]
  readonly cwd: string
}

interface FakeSpawnCall {
  readonly argv: readonly string[]
  readonly cwd: string
}

function fakeSubprocess(result: { exitCode?: number; stderr?: string; stdout?: string } = {}) {
  const calls: FakeSpawnCall[] = []
  const spawn = vi.fn((spec: { argv: readonly string[]; cwd: string }) => {
    calls.push({ argv: spec.argv, cwd: spec.cwd })
    return {
      done: Promise.resolve({ exitCode: result.exitCode ?? 0, signal: null }),
      collected: {
        stdout: { readFrom: () => ({ text: result.stdout ?? '', nextOffset: 0, lossy: false }) },
        stderr: { readFrom: () => ({ text: result.stderr ?? '', nextOffset: 0, lossy: false }) },
      },
    }
  })
  return { spawn, calls }
}

describe('GitBranchGateway', () => {
  it('publishes branch, list, create, checkout, and status under the gitBranch namespace', async () => {
    const { gateway } = await harness()
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'gitBranch',
      namespace: 'gitBranch',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'branch', invocation: { kind: 'direct' } },
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'create', invocation: { kind: 'direct' } },
      { method: 'checkout', invocation: { kind: 'direct' } },
      { method: 'status', invocation: { kind: 'direct' } },
    ])
  })

  it('resolves the branch of a repository root over the Remote face', async () => {
    const { gateway } = await harness()
    const repo = await makeRepo(await tempDir())
    await expect(gateway.branch({ root: repo })).resolves.toEqual({ branch: 'main', repo })
  })

  it('lists the local branches of a repository over the Remote face', async () => {
    const { gateway } = await harness()
    const repo = await makeRepo(await tempDir())
    await expect(gateway.list({ root: repo })).resolves.toEqual({ repo, branches: ['main'] })
  })

  it('creates a branch over the Remote face and switches HEAD', async () => {
    const { gateway } = await harness()
    const root = await makeRepo(await tempDir())
    await expect(gateway.create({ root, name: 'feature-x' })).resolves.toBe('feature-x')
    await expect(readFile(path.join(root, '.git', 'HEAD'), 'utf8'))
      .resolves.toBe('ref: refs/heads/feature-x\n')
  })

  it('checks out a branch over the Remote face through git', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    const { spawn, calls } = fakeSubprocess()
    ctx.provide('subprocess', { spawn })
    await expect(gateway.checkout({ root, name: 'release' })).resolves.toBe('release')
    expect(calls).toEqual([{ argv: ['git', 'checkout', 'release'], cwd: root }])
  })

  it('surfaces git checkout failures', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    ctx.provide('subprocess', {
      spawn: fakeSubprocess({ exitCode: 1, stderr: 'error: your local changes would be overwritten' }).spawn,
    })
    await expect(gateway.checkout({ root, name: 'release' })).rejects
      .toThrow(/git checkout failed: error: your local changes/)
  })

  it('rejects a spawn-level git failure', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    const spawn = vi.fn(() => ({
      done: Promise.reject(new Error('spawn git ENOENT')),
      collected: {},
    }))
    ctx.provide('subprocess', { spawn })
    await expect(gateway.checkout({ root, name: 'release' })).rejects
      .toThrow(/git checkout could not start: spawn git ENOENT/)
  })

  it('requires the subprocess service for checkout', async () => {
    const { gateway } = await harness()
    const root = await makeRepo(await tempDir())
    await expect(gateway.checkout({ root, name: 'release' })).rejects
      .toThrow(/requires the subprocess service/)
  })

  it('rejects invalid checkout names and roots outside any repository', async () => {
    const { gateway } = await harness()
    const root = await makeRepo(await tempDir())
    await expect(gateway.checkout({ root, name: '-x' })).rejects.toThrow(/invalid branch name/)
    await expect(gateway.checkout({ root: await tempDir(), name: 'release' })).rejects
      .toThrow(/no git repository/)
  })

  it('checks out in the fallback repository outside any workspace repository', async () => {
    const { ctx, gateway } = await harness()
    const workspace = await tempDir()
    const harnessRoot = await makeRepo(await tempDir())
    const { spawn, calls } = fakeSubprocess()
    ctx.provide('subprocess', { spawn })
    ctx.provide('systemPrompt', {
      assemble: async () => ({
        sections: [{
          name: 'harness:source',
          text: `The DeepSeek Harness implementation checkout is at ${harnessRoot}.`,
        }],
      }),
    })
    await expect(gateway.checkout({ root: workspace, name: 'release' })).resolves.toBe('release')
    expect(calls).toEqual([{ argv: ['git', 'checkout', 'release'], cwd: harnessRoot }])
  })

  it('counts pending changes from git status --porcelain', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    const { spawn, calls } = fakeSubprocess({ stdout: ' M file.txt\n?? new.txt\n' })
    ctx.provide('subprocess', { spawn })
    await expect(gateway.status({ root })).resolves.toEqual({ repo: root, changes: 2 })
    expect(calls).toEqual([{ argv: ['git', 'status', '--porcelain'], cwd: root }])
  })

  it('reports zero changes on a clean tree', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    ctx.provide('subprocess', { spawn: fakeSubprocess({ stdout: '' }).spawn })
    await expect(gateway.status({ root })).resolves.toEqual({ repo: root, changes: 0 })
  })

  it('returns nulls outside any repository without spawning', async () => {
    const { ctx, gateway } = await harness()
    const { spawn, calls } = fakeSubprocess()
    ctx.provide('subprocess', { spawn })
    const root = await tempDir()
    await expect(gateway.status({ root })).resolves.toEqual({ repo: null, changes: 0 })
    expect(calls).toEqual([])
  })

  it('requires the subprocess service for status', async () => {
    const { gateway } = await harness()
    const root = await makeRepo(await tempDir())
    await expect(gateway.status({ root })).rejects.toThrow(/git status requires the subprocess service/)
  })

  it('relays git status failures', async () => {
    const { ctx, gateway } = await harness()
    const root = await makeRepo(await tempDir())
    ctx.provide('subprocess', {
      spawn: fakeSubprocess({ exitCode: 128, stderr: 'fatal: not a git repository' }).spawn,
    })
    await expect(gateway.status({ root })).rejects.toThrow(/git status failed: fatal: not a git repository/)
  })

  it('counts status changes in the fallback repository outside any workspace repository', async () => {
    const { ctx, gateway } = await harness()
    const workspace = await tempDir()
    const harnessRoot = await makeRepo(await tempDir())
    const { spawn, calls } = fakeSubprocess({ stdout: ' M file.txt\n' })
    ctx.provide('subprocess', { spawn })
    ctx.provide('systemPrompt', {
      assemble: async () => ({
        sections: [{
          name: 'harness:source',
          text: `The DeepSeek Harness implementation checkout is at ${harnessRoot}.`,
        }],
      }),
    })
    await expect(gateway.status({ root: workspace })).resolves.toEqual({
      repo: harnessRoot,
      changes: 1,
    })
    expect(calls).toEqual([{ argv: ['git', 'status', '--porcelain'], cwd: harnessRoot }])
  })

  it('falls back to the harness checkout root from the systemPrompt section', async () => {
    const { ctx, gateway } = await harness()
    const workspace = await tempDir()
    const harnessRoot = await tempDir()
    await mkdir(path.join(harnessRoot, '.git'), { recursive: true })
    await writeFile(path.join(harnessRoot, '.git', 'HEAD'), 'ref: refs/heads/harness-branch\n')
    const assemble = vi.fn(async () => ({
      sections: [
        { name: 'identity', text: 'DeepSeek Harness' },
        {
          name: 'harness:source',
          text: `The DeepSeek Harness implementation checkout is at ${harnessRoot}. The checkout location and current working directory are separate values.`,
        },
      ],
    }))
    ctx.provide('systemPrompt', { assemble })
    await expect(gateway.branch({ root: workspace })).resolves.toEqual({
      branch: 'harness-branch',
      repo: harnessRoot,
    })
    await expect(gateway.branch({ root: workspace })).resolves.toEqual({
      branch: 'harness-branch',
      repo: harnessRoot,
    })
    expect(assemble).toHaveBeenCalledTimes(1)
  })

  it('stays null when the systemPrompt section carries no checkout path', async () => {
    const { ctx, gateway } = await harness()
    const workspace = await tempDir()
    ctx.provide('systemPrompt', {
      assemble: async () => ({ sections: [{ name: 'identity', text: 'DeepSeek Harness' }] }),
    })
    await expect(gateway.branch({ root: workspace })).resolves.toEqual({
      branch: null,
      repo: null,
    })
  })

  it('retries the fallback after a transient prompt assembly failure', async () => {
    const { ctx, gateway } = await harness()
    const workspace = await tempDir()
    const assemble = vi.fn()
      .mockRejectedValueOnce(new Error('transient assembly failure'))
      .mockResolvedValueOnce({ sections: [] })
    ctx.provide('systemPrompt', { assemble })
    await expect(gateway.branch({ root: workspace })).resolves.toEqual({
      branch: null,
      repo: null,
    })
    await expect(gateway.branch({ root: workspace })).resolves.toEqual({
      branch: null,
      repo: null,
    })
    expect(assemble).toHaveBeenCalledTimes(2)
  })
})

describe('harnessRootFromSection', () => {
  it('parses the checkout path from the harness:source section text', () => {
    const text = 'The DeepSeek Harness implementation checkout is at '
      + '/Users/me.v2/deepseek-harness. The checkout location and current working '
      + 'directory are separate values and may differ.'
    expect(harnessRootFromSection(text)).toBe('/Users/me.v2/deepseek-harness')
  })

  it('parses a bare path without a trailing sentence', () => {
    expect(harnessRootFromSection('checkout is at /a/b')).toBe('/a/b')
  })

  it('parses a path followed only by a period at the end of the text', () => {
    expect(harnessRootFromSection('The DeepSeek Harness implementation checkout is at /a/b.')).toBe('/a/b')
  })

  it('returns null for unrelated text', () => {
    expect(harnessRootFromSection('no checkout mentioned here')).toBeNull()
  })
})
