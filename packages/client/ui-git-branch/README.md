# @deepseek-ai/dsh-client-ui-git-branch

Session-header git branch picker for the DeepSeek Harness Web GUI. The browser plugin registers one additive `conversation.session.header.utilities` contribution with id `git-branch-picker`; the picker reads the active session's workspace directory from the standard session hooks, lazily calls the [`gitBranch`](../../host/git-branch/README.md) Remotes through [`api-remotes`](../../api/remotes/README.md) on mount, and renders the checked-out branch as a small monospace pill — or nothing outside any repository.

Clicking the pill opens a menu listing the local branches of the workspace's repository (the current branch marked) with a form to create a new branch at the current commit, which switches to it and refreshes the pill and the list. Create failures (invalid names, existing branches) render inline in the menu. Outside any repository the host falls back to the harness checkout surfaced by the `harness:source` prompt section, so the pill still appears when the workspace itself is not a repository.

It performs no Remote read during plugin activation: the picker resolves only when a session header with a workspace directory actually mounts, and lists only when the menu opens. Styles come from semantic `--dsw-*` theme tokens; there is no product copy to localize beyond the accessible `branch <name>` label.

## Model Experience

None, as this picker registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **List and create only** — the menu shows local branches but cannot switch to an existing branch or delete one; the list refreshes on every open and after a create.
- **Workspace-scoped** — a session whose workspace directory lies outside any repository falls back to the harness checkout when the web bundle surfaced it, and otherwise renders nothing.
