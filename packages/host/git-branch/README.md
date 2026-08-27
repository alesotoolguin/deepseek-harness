# @deepseek-ai/dsh-host-git-branch

Local git branch operations for a workspace directory, reading and writing the repository's `.git` state directly (no git binary dependency). `GitBranchGateway` registers the `gitBranch` service and publishes three generated direct Remotes:

- `gitBranch/branch` — resolve the checked-out branch of the repository enclosing a directory. Every call walks up from the requested directory until it finds a repository, reads its `.git/HEAD` (following linked-worktree `gitdir:` files, and reporting a detached HEAD as a short commit), and returns the branch name plus the repository directory — or nulls outside any repository.
- `gitBranch/list` — return the sorted local branch names of the enclosing repository (loose `refs/heads` files plus `packed-refs` entries, resolving linked worktrees through the `commondir` file), or nulls outside any repository.
- `gitBranch/create` — create a local branch at the current commit and switch to it (`git checkout -b` semantics; the worktree never changes because the new ref points at the checked-out commit). It throws on invalid names (validated like `git check-ref-format`), on an existing branch, on an unborn HEAD with no resolvable commit, and outside any repository.

When the workspace directory lies outside any repository, all three methods fall back to the harness checkout surfaced by the `harness:source` prompt section (registered by the web bundle when `surfaceContext` is enabled): the section text is parsed for the checkout root, memoized per process, and the repository enclosing it is used instead. Without a `systemPrompt` service or section the fallback stays unresolved and the methods keep returning nulls.

The resolver reads and writes repository state directly and owns no cache, history, or git-binary dependency. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge (it reads the optional `systemPrompt` service through `ctx.get`). Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only service registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time resolution only** — every result is read on each call and carries no subscription or change notification; the memoized fallback root is resolved once per process.
- **Create-and-switch only** — `gitBranch/create` always switches to the new branch; switching to an existing branch (which can require worktree updates) and deleting branches are not supported.
- **Local refs only** — `gitBranch/list` never surfaces remote-tracking or other non-`refs/heads` refs.
