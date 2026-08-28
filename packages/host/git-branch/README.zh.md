# @deepseek-ai/dsh-host-git-branch

[English](README.md) | 中文

针对工作区目录的本地 git 分支操作。解析、列出和创建直接读写仓库的 `.git` 状态（无 git 二进制依赖）；检出和状态通过 `subprocess` 服务委托给 `git checkout` 和 `git status`。`GitBranchGateway` 注册 `gitBranch` 服务，并发布五个生成的直接 Remotes：

- `gitBranch/branch` — 解析包裹一个目录的仓库的检出分支。每次调用从请求目录向上走，直到找到仓库，读取其 `.git/HEAD`（跟随 linked-worktree `gitdir:` 文件，并将 detached HEAD 报告为短提交），并返回分支名加仓库目录——在仓库之外返回 null。
- `gitBranch/list` — 返回包裹仓库的排序本地分支名（松散 `refs/heads` 文件加 `packed-refs` 条目，通过 `commondir` 文件解析 linked worktrees），在仓库之外返回 null。
- `gitBranch/create` — 在当前提交处创建本地分支并切换过去（`git checkout -b` 语义；工作树永不变更，因为新引用指向检出的提交）。它在名称无效（像 `git check-ref-format` 那样验证）、分支已存在、没有可解析提交的 unborn HEAD，以及在仓库之外时抛出异常。
- `gitBranch/checkout` — 通过在仓库中运行 `git checkout <name>`（通过 `subprocess` 服务）将工作树切换到现有本地分支（名称像 `git check-ref-format` 那样验证，因此参数绝不可能是选项）。它在名称无效、仓库之外、`subprocess` 服务缺失、`git` 无法启动，或 git 报告非零退出（失败文本被转发，例如本地更改冲突）时抛出异常。
- `gitBranch/status` — 通过 `subprocess` 服务运行 `git status --porcelain` 并统计其条目（修改、添加、删除和未跟踪；未跟踪目录计一次）来计算包裹仓库的待处理更改数。它在仓库之外返回 null，并在 `subprocess` 服务缺失或 git 失败时抛出异常。

当工作区目录位于任何仓库之外时，所有五个方法都会回退到由 `harness:source` 提示节暴露的 harness checkout（由 web bundle 在启用 `surfaceContext` 时注册）：解析该节文本以获取 checkout 根，按进程记忆化，并使用包裹它的仓库。没有 `systemPrompt` 服务或节时，回退保持未解析，方法继续返回 null 或在没有仓库时失败。

解析器直接读写仓库状态，不拥有任何缓存或历史；checkout 和 status 是仅有的 git 二进制依赖，因此没有 `subprocess` 服务的部署仍可使用 branch/list/create，而它们大声失败。其公共载荷类型位于 `./types` 下，Typert 生成由 `./typert` 和 `./remote` 暴露的 Host 和 Client Remote 工件。

该服务仅 Remote，且刻意不声明同进程的 Cordis `Context` 合并（它通过 `ctx.get` 读取可选的 `systemPrompt` 和 `subprocess` 服务）。客户端包通过显式的 [`api-remotes`](../../api/remotes/README.zh.md) 装配消费它，而非导入 Host 实现。

## Model Experience

None，因为这个仅 Host 的服务不注册任何提示、工具、消息或提供商请求。

#### KV Cache effect

None；此包从不组装模型输入。

## Known Limitations and Deferred Work

- **仅时间点解析** — 每个结果都在每次调用时读取，不携带订阅或变更通知；记忆化的回退根每个进程解析一次。
- **检出和状态需要 git** — `gitBranch/checkout` 和 `gitBranch/status` 通过 `subprocess` 服务运行 `git` 二进制；缺少任一者时它们大声失败，而其他方法继续工作。
- **仅本地引用** — `gitBranch/list` 永不暴露 remote-tracking 或其他非 `refs/heads` 引用，且不支持分支删除。
