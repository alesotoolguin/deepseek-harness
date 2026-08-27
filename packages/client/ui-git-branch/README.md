# @deepseek-ai/dsh-client-ui-git-branch

Session-header branch badge for the DeepSeek Harness Web GUI. The browser plugin registers one additive `conversation.session.header.utilities` contribution with id `git-branch-badge`; the badge reads the active session's workspace directory from the standard session hooks, lazily calls the [`gitBranch`](../../host/git-branch/README.md) Remote through [`api-remotes`](../../api/remotes/README.md) on mount, and renders the checked-out branch as a small monospace pill — or nothing outside any repository.

It performs no Remote read during plugin activation: the component resolves only when a session header with a workspace directory actually mounts. Styles come from semantic `--dsw-*` theme tokens; there is no product copy to localize beyond the accessible `branch <name>` label.

## Model Experience

None, as this badge registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **HEAD only** — the badge shows the checked-out branch of the nearest enclosing repository and never refreshes while the session stays mounted.
- **Workspace-scoped** — a session whose workspace directory lies outside any repository renders nothing, even when a repository sits inside that directory.
