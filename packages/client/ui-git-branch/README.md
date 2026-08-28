# @deepseek-ai/dsh-client-ui-git-branch

English | [中文](README.zh.md)

Session-header git branch picker for the DeepSeek Harness Web GUI. The browser plugin registers two additive contributions — `conversation.session.header.utilities` (id `git-branch-picker`) and, for blank sessions, `conversation.input.dock` (id `git-branch-hero`); the picker reads the active session's workspace directory from the standard session hooks, lazily calls the [`gitBranch`](../../host/git-branch/README.md) Remotes through [`api-remotes`](../../api/remotes/README.md) on mount, and renders the checked-out branch as a small monospace pill — or nothing outside any repository.

The pill appears as soon as the session is connected to a workspace: a blank session has no `cwd` until its first run starts, so the picker resolves the owning workspace's path (via the standard `useWorkspaces` feed) and switches to the session `cwd` once the conversation starts. The blank-session header is hidden by design, so the hero variant of the same picker rides the hero workspace row right after the agent preset (the additive `conversation.hero.workspace.utilities` seat) while the session is still blank, and goes silent the moment the conversation starts and the header pill takes over.

Clicking the pill opens a menu listing the local branches of the workspace's repository: the current branch is marked and its row disabled, clicking any other row switches to it (`gitBranch/checkout`, which runs `git checkout`), and a form below creates a new branch at the current commit — the row above the form shows the checked-out branch as the create base. Create and checkout failures (invalid names, existing branches, conflicting local changes) render inline in the menu, and both actions refresh the pill and the list. Outside any repository the host falls back to the harness checkout surfaced by the `harness:source` prompt section, so the pill still appears when the workspace itself is not a repository.

A VS Code-style pending-change badge sits on the pill next to the branch name: `gitBranch/status` counts `git status --porcelain` entries, the badge shows the count while it is non-zero, and it re-polls every five seconds plus on menu open and after each action — so editing files outside the GUI moves the badge live. The badge is hidden when the count is zero or the status Remote is unavailable.

It performs no Remote read during plugin activation: the picker resolves only when a session header with a workspace directory actually mounts, and lists only when the menu opens. Styles come from semantic `--dsw-*` theme tokens; there is no product copy to localize beyond the accessible `branch <name>` label.

## Model Experience

None, as this picker registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **No deletion, no remote refs** — the menu lists local branches only and cannot delete one; the list refreshes on every open and after each action.
- **Checkout and the badge need git** — switching rows runs `git checkout` and the badge runs `git status` on the host, so both fail loud (checkout) or hide (badge) in a deployment without the `subprocess` service or a `git` binary; create and list still work.
- **Workspace-scoped** — a session whose workspace directory lies outside any repository falls back to the harness checkout when the web bundle surfaced it, and otherwise renders nothing.
