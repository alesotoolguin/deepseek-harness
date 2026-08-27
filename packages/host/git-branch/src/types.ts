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

/** Local branch listing for a workspace directory. */
export interface GitBranchListResult {
  /** Directory of the repository whose refs were read, or null outside any repository. */
  readonly repo: string | null
  /** Sorted local branch names from loose and packed refs; empty outside any repository. */
  readonly branches: readonly string[]
}

/** Remote request: the directory whose enclosing repository to list. */
export interface GitBranchListRequest {
  readonly root: string
}

/** Remote request: create a local branch at the current commit and switch to it. */
export interface GitBranchCreateRequest {
  readonly root: string
  /** Local branch name, validated like `git check-ref-format`. */
  readonly name: string
}

/** Remote request: switch the working tree to an existing local branch. */
export interface GitBranchCheckoutRequest {
  readonly root: string
  /** Local branch name to check out. */
  readonly name: string
}
