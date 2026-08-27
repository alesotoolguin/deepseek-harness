# @deepseek-ai/dsh-host-git-branch

Read-only resolution of the checked-out git branch for a workspace directory. `GitBranchGateway` registers the `gitBranch` service and publishes one generated direct Remote, `gitBranch/branch`. Every call walks up from the requested directory until it finds a repository, reads its `.git/HEAD` (following linked-worktree `gitdir:` files, and reporting a detached HEAD as a short commit), and returns the branch name plus the repository directory — or nulls outside any repository.

The resolver reads repository state directly and owns no cache, history, mutation path, or git-binary dependency. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only resolution registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time resolution only** — the result is read on each call and carries no subscription or change notification.
- **HEAD only** — no branch list, status, or remotes; the badge shows the checked-out branch, not repository health.
