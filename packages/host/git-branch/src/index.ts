/**
 * Resolve, list, create, and check out local git branches of the repository
 * enclosing a workspace directory. Reads and writes `.git` state directly
 * (no git binary dependency) for resolution, listing, and create; checkout
 * delegates the working-tree update to `git checkout` through the subprocess
 * service. Outside any repository the gateway falls back to the harness
 * checkout surfaced by the `harness:source` prompt section, so the GUI badge
 * still works when the workspace itself is not a repository.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Dirent } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
// Side-effect type import: resolves `ctx.get('systemPrompt')` to the service.
import type {} from '@deepseek-ai/dsh-system-prompt'
// Side-effect type import: resolves `ctx.get('subprocess')` to the service.
import type {} from '@deepseek-ai/dsh-subprocess'
import type {
  GitBranchCheckoutRequest, GitBranchCreateRequest, GitBranchListRequest, GitBranchListResult,
  GitBranchRequest, GitBranchResult,
} from './types.ts'

export type * from './types.ts'

/** Maximum ancestor walk before reporting no repository. */
const MAX_DEPTH = 64

/** Section name the web bundle registers with the harness checkout path. */
const HARNESS_SOURCE_SECTION = 'harness:source'

/** Location of the repository state for one checkout directory. */
export interface GitRepoInfo {
  /** Directory whose `.git` entry identified the repository. */
  readonly repo: string
  /** Directory holding this checkout's HEAD (worktree-specific). */
  readonly gitdir: string
  /** Directory holding the shared refs (`refs/heads`, `packed-refs`). */
  readonly commondir: string
}

/**
 * Find the nearest git repository enclosing `root`, walking up until the
 * filesystem root and following linked-worktree `gitdir:` files.
 * @param root - directory to start from (typically a workspace root).
 * @returns the repository state, or null outside any repository.
 */
export async function findRepo(root: string): Promise<GitRepoInfo | null> {
  let dir = path.resolve(root)
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const info = await repoInfoAt(dir)
    if (info !== null) return info
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Resolve the checked-out branch of the nearest git repository enclosing
 * `root`, falling back to `fallbackRoot` when no repository encloses it.
 * @param root - directory to resolve (typically a workspace root).
 * @param fallbackRoot - directory to resolve when `root` is outside any repository.
 * @returns the branch name and repository directory, or nulls outside any repository.
 */
export async function resolveGitBranch(
  root: string,
  fallbackRoot: string | null = null,
): Promise<GitBranchResult> {
  const info = (await findRepo(root)) ?? (fallbackRoot === null ? null : await findRepo(fallbackRoot))
  if (info === null) return { branch: null, repo: null }
  const head = await tryRead(path.join(info.gitdir, 'HEAD'))
  return { branch: head === null ? null : branchFromHead(head), repo: info.repo }
}

/**
 * List the local branches of the nearest git repository enclosing `root`,
 * falling back to `fallbackRoot` when no repository encloses it.
 * @param root - directory to resolve (typically a workspace root).
 * @param fallbackRoot - directory to resolve when `root` is outside any repository.
 * @returns the repository directory and sorted branch names, or nulls outside any repository.
 */
export async function listLocalBranches(
  root: string,
  fallbackRoot: string | null = null,
): Promise<GitBranchListResult> {
  const info = (await findRepo(root)) ?? (fallbackRoot === null ? null : await findRepo(fallbackRoot))
  if (info === null) return { repo: null, branches: [] }
  return { repo: info.repo, branches: await localBranchNames(info.commondir) }
}

/**
 * Create a local branch at the repository's current commit and switch to it
 * (`git checkout -b` semantics, refs only — the worktree never changes
 * because the new ref points at the checked-out commit).
 * @param root - directory to resolve (typically a workspace root).
 * @param name - local branch name, validated like `git check-ref-format`.
 * @param fallbackRoot - directory to resolve when `root` is outside any repository.
 * @returns the created branch name.
 * @throws when the name is invalid, the branch already exists, the current
 * commit cannot be resolved (unborn HEAD), or no repository is found.
 */
export async function createBranch(
  root: string,
  name: string,
  fallbackRoot: string | null = null,
): Promise<string> {
  if (!isValidBranchName(name)) throw new Error(`invalid branch name "${name}"`)
  const info = (await findRepo(root)) ?? (fallbackRoot === null ? null : await findRepo(fallbackRoot))
  if (info === null) throw new Error(`no git repository found at or above ${root}`)
  const commit = await currentCommit(info)
  if (commit === null) throw new Error(`cannot resolve the current commit in ${info.repo} (unborn HEAD?)`)
  if ((await localBranchNames(info.commondir)).includes(name)) {
    throw new Error(`branch "${name}" already exists`)
  }
  const refPath = path.join(info.commondir, 'refs', 'heads', ...name.split('/'))
  await mkdir(path.dirname(refPath), { recursive: true })
  await writeFile(refPath, `${commit}\n`)
  await writeFile(path.join(info.gitdir, 'HEAD'), `ref: refs/heads/${name}\n`)
  return name
}

/**
 * Whether `name` is acceptable for a local branch ref, mirroring the core of
 * `git check-ref-format` (empty, `.`/`..`, `@`, leading `-`, control
 * characters and space, `~ ^ : ? * [ \`, `@{`, `..`, `//`, leading or
 * trailing `/`, trailing `.`, and the `.lock` suffix are all rejected).
 * @param name - candidate branch name.
 * @returns whether the name is a valid local branch name.
 */
export function isValidBranchName(name: string): boolean {
  if (name === '' || name === '.' || name === '..' || name === '@') return false
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/')) return false
  if (name.endsWith('.') || name.endsWith('.lock')) return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  return !/[\x00-\x20\x7f~^:?*[\\]/.test(name)
}

/**
 * Parse the harness checkout path from the `harness:source` prompt section
 * text: "The DeepSeek Harness implementation checkout is at <root>."
 * @param text - the section text as registered by the web bundle.
 * @returns the checkout root, or null when the text does not carry one.
 */
export function harnessRootFromSection(text: string): string | null {
  const match = /checkout is at (.+?)(?:\.(?:\s|$)|$)/m.exec(text)
  return match?.[1] === undefined ? null : match[1].trim()
}

async function repoInfoAt(dir: string): Promise<GitRepoInfo | null> {
  const plain = path.join(dir, '.git')
  const head = await tryRead(path.join(plain, 'HEAD'))
  if (head !== null) return repoInfoFromGitDir(dir, plain)
  const dotgit = await tryRead(plain)
  if (dotgit === null) return null
  const gitdir = /^gitdir:\s*(.+)$/m.exec(dotgit)?.[1]?.trim()
  if (gitdir === undefined) return null
  const linked = await tryRead(path.join(gitdir, 'HEAD'))
  return linked === null ? null : repoInfoFromGitDir(dir, gitdir)
}

async function repoInfoFromGitDir(repo: string, gitdir: string): Promise<GitRepoInfo> {
  const commondirFile = await tryRead(path.join(gitdir, 'commondir'))
  const commondir = commondirFile === null
    ? gitdir
    : path.isAbsolute(commondirFile.trim())
      ? commondirFile.trim()
      : path.join(gitdir, commondirFile.trim())
  return { repo, gitdir, commondir }
}

async function currentCommit(info: GitRepoInfo): Promise<string | null> {
  const head = await tryRead(path.join(info.gitdir, 'HEAD'))
  if (head === null) return null
  const line = head.split('\n')[0]?.trim() ?? ''
  if (line.startsWith('ref: ')) return resolveRef(info.commondir, line.slice(5).trim())
  return /^[0-9a-f]{40}$/i.test(line) ? line : null
}

async function resolveRef(commondir: string, ref: string): Promise<string | null> {
  const loose = await tryRead(path.join(commondir, ...ref.split('/')))
  if (loose !== null) {
    const value = loose.split('\n')[0]?.trim() ?? ''
    return /^[0-9a-f]{40}$/i.test(value) ? value : null
  }
  const packed = await tryRead(path.join(commondir, 'packed-refs'))
  if (packed === null) return null
  for (const line of packed.split('\n')) {
    const match = /^([0-9a-f]{40}) (.+)$/.exec(line.trim())
    if (match?.[2] === ref) return match[1] ?? null
  }
  return null
}

async function localBranchNames(commondir: string): Promise<string[]> {
  const names = new Set<string>()
  const heads = path.join(commondir, 'refs', 'heads')
  await collectLooseRefs(heads, heads, names)
  const packed = await tryRead(path.join(commondir, 'packed-refs'))
  if (packed !== null) {
    for (const line of packed.split('\n')) {
      const match = /^([0-9a-f]{40}) refs\/heads\/(.+)$/.exec(line.trim())
      if (match?.[2] !== undefined && !match[2].endsWith('.lock')) names.add(match[2])
    }
  }
  return [...names].sort()
}

async function collectLooseRefs(dir: string, base: string, out: Set<string>): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    // Missing or unreadable refs directory: no loose refs at this level.
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectLooseRefs(full, base, out)
    else if (entry.isFile() && !entry.name.endsWith('.lock')) {
      out.add(path.relative(base, full).split(path.sep).join('/'))
    }
  }
}

async function tryRead(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    // Missing or unreadable file: not a repository at this level.
    return null
  }
}

function branchFromHead(content: string): string | null {
  const line = content.split('\n')[0]?.trim() ?? ''
  if (line.startsWith('ref: ')) {
    const ref = line.slice(5).trim()
    if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length)
    return ref.split('/').at(-1) || null
  }
  if (/^[0-9a-f]{40}$/i.test(line)) return `detached @ ${line.slice(0, 7)}`
  return null
}

/** Remote-only service reading and writing the local branches of a workspace repository. */
export class GitBranchGateway extends TypertRemoteService {
  /** Resolved harness checkout root, memoized; undefined until first resolution. */
  private harnessRootValue: string | null | undefined

  constructor(ctx: Context) {
    super(ctx, 'gitBranch')
  }

  /**
   * Resolve the checked-out branch of the repository enclosing `request.root`.
   * @param request - workspace directory to resolve.
   * @returns the branch name and repository directory, or nulls outside any repository.
   */
  @Remote('branch')
  async branch(request: GitBranchRequest): Promise<GitBranchResult> {
    return resolveGitBranch(request.root, await this.harnessRoot())
  }

  /**
   * List the local branches of the repository enclosing `request.root`.
   * @param request - workspace directory to list.
   * @returns the repository directory and sorted branch names, or nulls outside any repository.
   */
  @Remote('list')
  async list(request: GitBranchListRequest): Promise<GitBranchListResult> {
    return listLocalBranches(request.root, await this.harnessRoot())
  }

  /**
   * Create a local branch at the current commit and switch to it.
   * @param request - workspace directory and branch name.
   * @returns the created branch name.
   * @throws on invalid names, existing branches, unborn HEAD, or no repository.
   */
  @Remote('create')
  async create(request: GitBranchCreateRequest): Promise<string> {
    return createBranch(request.root, request.name, await this.harnessRoot())
  }

  /**
   * Switch the working tree to an existing local branch, delegating the
   * worktree update to `git checkout` through the subprocess service.
   * @param request - workspace directory and branch name.
   * @returns the checked-out branch name.
   * @throws on invalid names, no repository, a missing subprocess service, or git failure.
   */
  @Remote('checkout')
  async checkout(request: GitBranchCheckoutRequest): Promise<string> {
    if (!isValidBranchName(request.name)) throw new Error(`invalid branch name "${request.name}"`)
    const fallback = await this.harnessRoot()
    const info = (await findRepo(request.root)) ?? (fallback === null ? null : await findRepo(fallback))
    if (info === null) throw new Error(`no git repository found at or above ${request.root}`)
    const subprocess = this.ctx.get('subprocess')
    if (subprocess === undefined) throw new Error('git checkout requires the subprocess service')
    const handle = subprocess.spawn({
      argv: ['git', 'checkout', request.name],
      cwd: info.repo,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 64 * 1024 },
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: 10_000,
    })
    const outcome = await handle.done.catch((error: unknown) => {
      throw new Error(`git checkout could not start: ${error instanceof Error ? error.message : String(error)}`)
    })
    if (outcome.exitCode !== 0) {
      const stderr = handle.collected.stderr?.readFrom(0).text.trim() ?? ''
      const stdout = handle.collected.stdout?.readFrom(0).text.trim() ?? ''
      throw new Error(`git checkout failed: ${stderr || stdout || `exit code ${String(outcome.exitCode)}`}`)
    }
    return request.name
  }

  /** Best-effort harness checkout root from the `harness:source` prompt section. */
  private async harnessRoot(): Promise<string | null> {
    if (this.harnessRootValue !== undefined) return this.harnessRootValue
    const prompt = this.ctx.get('systemPrompt')
    if (prompt === undefined) {
      // No prompt service: the fallback cannot exist; remember that.
      this.harnessRootValue = null
      return null
    }
    let text: string | undefined
    try {
      text = (await prompt.assemble({})).sections
        .find(section => section.name === HARNESS_SOURCE_SECTION)?.text
    } catch {
      // A transient assembly failure leaves the fallback unresolved to retry on the next call.
      return null
    }
    this.harnessRootValue = text === undefined ? null : harnessRootFromSection(text)
    return this.harnessRootValue
  }
}

export default GitBranchGateway
