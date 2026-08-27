# @deepseek-ai/dsh-host-git-branch

Local git branch operations for a workspace directory. Resolution, listing, and create read and write the repository's `.git` state directly (no git binary dependency); checkout delegates the working-tree update to `git checkout` through the `subprocess` service. `GitBranchGateway` registers the `gitBranch` service and publishes four generated direct Remotes:

- `gitBranch/branch` — resolve the checked-out branch of the repository enclosing a directory. Every call walks up from the requested directory until it finds a repository, reads its `.git/HEAD` (following linked-worktree `gitdir:` files, and reporting a detached HEAD as a short commit), and returns the branch name plus the repository directory — or nulls outside any repository.
- `gitBranch/list` — return the sorted local branch names of the enclosing repository (loose `refs/heads` files plus `packed-refs` entries, resolving linked worktrees through the `commondir` file), or nulls outside any repository.
- `gitBranch/create` — create a local branch at the current commit and switch to it (`git checkout -b` semantics; the worktree never changes because the new ref points at the checked-out commit). It throws on invalid names (validated like `git check-ref-format`), on an existing branch, on an unborn HEAD with no resolvable commit, and outside any repository.
- `gitBranch/checkout` — switch the working tree to an existing local branch by running `git checkout <name>` in the repository through the `subprocess` service (name validated like `git check-ref-format`, so the argument can never be an option). It throws on invalid names, outside any repository, when the `subprocess` service is absent, when `git` cannot start, or when git reports a nonzero exit (the failure text is relayed, e.g. conflicting local changes).

When the workspace directory lies outside any repository, all four methods fall back to the harness checkout surfaced by the `harness:source` prompt section (registered by the web bundle when `surfaceContext` is enabled): the section text is parsed for the checkout root, memoized per process, and the repository enclosing it is used instead. Without a `systemPrompt` service or section the fallback stays unresolved and the methods keep returning nulls or failing without a repository.

The resolver reads and writes repository state directly and owns no cache or history; checkout is the only git-binary dependency, so a deployment without the `subprocess` service keeps branch/list/create working and checkout fails loud. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge (it reads the optional `systemPrompt` and `subprocess` services through `ctx.get`). Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only service registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time resolution only** — every result is read on each call and carries no subscription or change notification; the memoized fallback root is resolved once per process.
- **Checkout requires git** — `gitBranch/checkout` runs the `git` binary through the `subprocess` service; without either, switching fails loud while the other methods keep working.
- **Local refs only** — `gitBranch/list` never surfaces remote-tracking or other non-`refs/heads` refs, and branch deletion is not supported.
