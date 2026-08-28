# @deepseek-ai/dsh-client-ui-git-branch

[English](README.md) | 中文

DeepSeek Harness Web GUI 的会话头 git 分支选择器。浏览器插件注册两个附加贡献——`conversation.session.header.utilities`（id `git-branch-picker`），以及用于空白会话的 `conversation.input.dock`（id `git-branch-hero`）；选择器从标准会话 hooks 读取活动会话的工作区目录，在挂载时懒调用 [`gitBranch`](../../host/git-branch/README.zh.md) 的 Remotes（通过 [`api-remotes`](../../api/remotes/README.zh.md)），并将检出的分支渲染为小的等宽 pill——在仓库之外则什么都不渲染。

一旦会话连接到工作区，pill 就会出现：空白会话在首次运行开始前没有 `cwd`，因此选择器解析所属工作区的路径（通过标准 `useWorkspaces` 数据源），并在对话开始后切换到会话 `cwd`。空白会话的头默认隐藏，因此同一选择器的 hero 变体在会话仍为空白时，挂在 hero 工作区行中紧挨 agent preset 的位置（附加的 `conversation.hero.workspace.utilities` 座位），并在对话开始、头 pill 接管时静默消失。

点击 pill 打开菜单，列出工作区仓库的本地分支：当前分支被标记且其行被禁用，点击其他行会切换过去（`gitBranch/checkout`，运行 `git checkout`），下方表单在当前提交处创建新分支——表单上方的行显示检出的分支作为创建基准。创建和检出失败（名称无效、分支已存在、本地更改冲突）在菜单中内联渲染，两个操作都会刷新 pill 和列表。在仓库之外，Host 回退到由 `harness:source` 提示节暴露的 harness checkout，因此即使工作区本身不是仓库，pill 仍会出现。

pill 上有一个 VS Code 风格的待处理更改徽章：`gitBranch/status` 统计 `git status --porcelain` 条目，计数非零时显示徽章，并且每五秒重新轮询一次，外加菜单打开时和每次操作后——因此在 GUI 之外编辑文件会让徽章实时变化。计数为零或状态 Remote 不可用时徽章隐藏。

插件激活期间不执行任何 Remote 读取：选择器只在带有工作区目录的会话头实际挂载时解析，并且只在菜单打开时列出。样式来自语义化的 `--dsw-*` 主题 token；除了可访问的 `branch <name>` 标签外，没有需要本地化的产品文案。

## Model Experience

None，因为此选择器不注册任何提示、工具、消息或提供商请求。

#### KV Cache effect

None；此包从不组装模型输入。

## Known Limitations and Deferred Work

- **无删除、无远程引用** — 菜单只列出本地分支且无法删除；列表在每次打开和每次操作后刷新。
- **检出和徽章需要 git** — 切换行运行 `git checkout`，徽章在 Host 上运行 `git status`，因此在没有 `subprocess` 服务或 `git` 二进制的部署中，两者要么大声失败（检出）、要么隐藏（徽章）；创建和列出仍然可用。
- **工作区范围** — 工作区目录位于任何仓库之外的会话，会在 web bundle 暴露它时回退到 harness checkout，否则什么都不渲染。
