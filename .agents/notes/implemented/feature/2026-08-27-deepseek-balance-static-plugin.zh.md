# Agent Note: DeepSeek 余额查看器作为静态双包功能

Status: implemented

[English](2026-08-27-deepseek-balance-static-plugin.md) | 中文

## Problem

余额查看器最初是会话本地的动态插件（`dsbal-1`），基于 `harness.handle`/`host.call` 构建。动态插件随进程消失且属于单个会话，因此查看器无法成为部署的永久组成部分。另外，之前没有任何 Host RPC 可以读取 DeepSeek 账户余额：`web` 抓取接缝只接受 URL，而余额端点要求 `Authorization: Bearer` 头，因此 harness 内部没有通向该 API 的路径。

## Decision

将查看器作为两个静态包发布，并挂载到 `dsh-web-app` bundle 中：

- `@deepseek-ai/dsh-web-balance` — 一个 Host 服务（`ctx.balance`），继承 `TypertRemoteService`，带一个 `@Remote('getBalance')` 方法，发布 `balance` Remote 命名空间。它每次调用通过可选的 `ctx.credentials` 接缝解析 `DEEPSEEK_API_KEY`（回退到启动环境），然后使用原生 `fetch` 调用 `GET https://api.deepseek.com/user/balance`，`redirect: 'error'`（携带凭据的请求必须在重定向上失败）、15 秒 `AbortSignal.timeout` 和 64KiB 响应上限。密钥绝不离 Host，也绝不出现在失败详情中。
- `@deepseek-ai/dsh-client-ui-balance` — 浏览器半端，注册 `settings.section` 页面 `deepseek-balance`（order 30，标签 **Saldo DeepSeek**），为每种报告的货币渲染一张卡片（总额、赠送、充值），带手动刷新按钮、上次更新时间，以及页面打开时每 60 秒自动刷新。刷新失败时保留上次读数并显示错误横幅。

### RPC 与装配

客户端通过 typert gateway 调用 `ctx.remote.balance.getBalance()`；`packages/api/remotes` 导入生成的 `@deepseek-ai/dsh-web-balance/remote` 贡献、挂载它，并重新导出该域的客户端安全类型。Host 方法返回一个**扁平**的 `BalanceResult`（`ok`/`data`/`error`/`detail`），带稳定的 `BalanceErrorCode` 值（`credential-error`、`no-api-key`、`request-failed`、`bad-response`）；选择扁平对象而非判别联合，是为了让生成的 zod codec 保持简单。

### 文案语言

产品文案按仓库约定为中文，但此用户自有功能刻意**只用西班牙语**：标签和消息是硬编码的西班牙语，且不注册 locale 命名空间。这是部署所有者要求的、已记录的偏差。

### 无硬注入的定时器

自动刷新通过 `ctx.get('timer')` 将客户端 `timer` 服务作为可选能力读取，并以注入的 `interval(callback, ms)` 回调形式暴露给组件。vendored timer 的 `Context.timer` 增强是 Host 类型（引用了 `NodeJS.Timeout`），因此客户端面无法在不引入 Node 类型的情况下将其作为类型化服务注入。

## Alternatives considered

**保留动态插件。** 已否决：查看器必须能在进程重启后存活并服务每个会话；动态插件是进程本地且会话所有的。

**通过手工维护的 apiproxy `IApiClient` 暴露调用。** 已否决：该面属于核心线上契约（会话、设置、凭据）；typert `@Remote` 路径才是面向浏览器的 Host 服务的既定扩展接缝（`git-branch` 和 `plugin-inventory` 先例）。

**通过 shell 服务运行 `curl`。** 在静态形式下已否决：Host Node 代码中存在原生 `fetch`，且可直接遵守 `redirect: 'error'`，让请求在进程列表中保持无密钥。

**增加按模型的用量读数。** 未构建：DeepSeek 的公开 API 只暴露账户余额；历史按模型用量只存在于平台控制台。60 秒刷新和 README 记录了这一边界。

## Verification

`packages/web/web-balance` 单元测试 mock `fetch` 和凭据接缝（成功归一化、重定向/头断言、无密钥、凭据失败、JSON 和纯文本错误体、空和不可读错误体、非 JSON 成功体、非对象载荷、非字符串字段、环境回退）以及 invariant companion；`packages/client/ui-balance` specs 覆盖各节状态（加载、成功、按货币行、占位符、错误映射、上次读数保留、手动刷新、interval 清理、Remote 失败映射、空 Host 半端）以及 invariant companion。两个包在 scoped 泳道中均保持逐文件 100% 覆盖率，`pnpm run test:gui` 为绿（4082 个测试），typert 契约生成 `balance/getBalance`，`verify-client-packages` 通过，且更改文件上 oxlint 干净。

`packages/client/ui-git-branch/tests/branch-picker.client.spec.tsx` 中仍有一个与本更改无关的既有客户端面类型错误（`HTMLElement.disabled`）；它早于此更改，并留给下一个 PR 窗口处理，而非在此修复。

## Consequences

一旦 web profile 挂载这两个静态包（`dsh-web-app` bundle 中的 `web-balance` Host 行和 `ui-balance` roster 行）并 heal 其模块表，它们就能在重启后持久存在；挂载需要重启 web 进程。`balance` Remote 命名空间将可供每个浏览器消费者使用，密钥像 LLM 适配器一样通过凭据接缝解析，因此在 Web Models 页面上存储的密钥无需重启即可供下次查询使用。西班牙语专属文案与 GUI locale 无关，在 DeepSeek 公开按模型用量端点之前，也不存在按模型用量界面。
