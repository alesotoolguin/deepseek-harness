/**
 * Resolve the checked-out git branch of the repository enclosing a workspace
 * directory by reading its HEAD directly (no git binary dependency).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { GitBranchRequest, GitBranchResult } from './types.ts'

export type * from './types.ts'

/** Maximum ancestor walk before reporting no repository. */
const MAX_DEPTH = 64

/**
 * Resolve the checked-out branch of the nearest git repository enclosing
 * `root`, walking up until the filesystem root.
 * @param root - directory to resolve (typically a workspace root).
 * @returns the branch name and repository directory, or nulls outside any repository.
 */
export async function resolveGitBranch(root: string): Promise<GitBranchResult> {
  let dir = path.resolve(root)
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const branch = await branchAt(dir)
    if (branch !== null) return { branch, repo: dir }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { branch: null, repo: null }
}

/** Read HEAD at `dir`, including linked worktrees where `.git` is a file. */
async function branchAt(dir: string): Promise<string | null> {
  const head = await tryRead(path.join(dir, '.git', 'HEAD'))
  if (head !== null) return branchFromHead(head)
  const dotgit = await tryRead(path.join(dir, '.git'))
  if (dotgit === null) return null
  const gitdir = /^gitdir:\s*(.+)$/m.exec(dotgit)?.[1]?.trim()
  if (gitdir === undefined) return null
  const linked = await tryRead(path.join(gitdir, 'HEAD'))
  return linked === null ? null : branchFromHead(linked)
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

/** Remote-only service reading the checked-out branch of a workspace repository. */
export class GitBranchGateway extends TypertRemoteService {
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
    return resolveGitBranch(request.root)
  }
}

export default GitBranchGateway
