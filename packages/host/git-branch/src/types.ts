/** Wire payloads of the git-branch Remote namespace. */

/** One checked-out branch resolution for a workspace directory. */
export interface GitBranchResult {
  /** Branch name (short commit for a detached HEAD), or null outside any repository. */
  readonly branch: string | null
  /** Directory of the repository whose HEAD was read, or null. */
  readonly repo: string | null
}

/** Remote request: the directory whose enclosing repository to resolve. */
export interface GitBranchRequest {
  readonly root: string
}
