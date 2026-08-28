# @deepseek-ai/dsh-web-balance

[English](README.md) | 中文

一个仅 Remote 的 Host 服务（`ctx.balance`），从 [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance) 读取 DeepSeek 账户余额，从每次 `llm/stream` 调用累积进程生命周期的按模型用量，并通过 typert gateway 以 `balance` Remote 命名空间（`api.balance.getBalance()` / `api.balance.getModelUsage()`）暴露给浏览器。

该服务在**每次**调用时通过可选的 `ctx.credentials` 接缝（进程环境、提供商管理存储和 `.env` 文件）解析 harness 的 `DEEPSEEK_API_KEY` 凭据，在接缝缺失时回退到启动环境——与 DeepSeek LLM 适配器使用相同的密钥，因此无需新密钥。在 Web Models 页面上存储或轮换的密钥无需重启即可供下次查询使用。

请求是带 `Authorization: Bearer` 头的普通 `fetch`，并且**拒绝重定向**（`redirect: 'error'`），因为请求携带凭据：将密钥自动转发到其他源必须失败而不是跟随。非 2xx 响应是携带 API 自身消息（绝不含密钥）的结构化失败；返回的 JSON 仅归一化为叶子字段。

## Mounting

```yaml
- id: web-balance
  name: '@deepseek-ai/dsh-web-balance'
```

该服务是 Loader 服务插件（默认导出），发布 `balance` Remote 命名空间；`dsh-api-remotes` 客户端装配为浏览器消费者挂载它。

## Mapping

端点每种货币返回一个 `balance_infos[]` 条目：

| 线上字段 | `BalanceCurrencyView` 字段 |
|---|---|
| `currency` | `currency` |
| `total_balance` | `totalBalance` |
| `granted_balance` | `grantedBalance` |
| `topped_up_balance` | `toppedUpBalance` |

金额是十进制**字符串**，原样转发，因此不会丢失浮点精度。`is_available` 映射到 `BalanceView.isAvailable`，每次成功调用都会用响应的主机时间戳记 `fetchedAt`。失败使用 `BalanceResult` 联合（`ok`/`data`/`error`/`detail`），带稳定的 `BalanceErrorCode` 值：`credential-error`、`no-api-key`、`request-failed` 和 `bad-response`。

## Per-model usage

一个全局 `llm/stream` waterfall listener 包裹每次流式模型调用，并将报告的 `usage` chunk（`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`reasoningTokens`）折叠到按 `provider/model` 键控的内存累加器中。`getModelUsage()` 提供快照（每条路由一个 `ModelUsageRow` 加 `since`）；累加器为进程生命周期，随 harness 进程重置。

## Model Experience

None，因为该服务为人类面向的设置行读取账户级端点，不涉及任何提示、消息、schema、流或工具结果。

#### KV Cache effect

None；该包从不组装或发送提供商请求。

## Known Limitations and Deferred Work

- **无按模型用量历史** — DeepSeek 仅通过 API 暴露账户余额；平台控制台是唯一的历史按模型用量界面。每次 chat-completion 响应中都有按请求的 token 用量，但此处不累积。
- **必须配置密钥** — 无法解析 `DEEPSEEK_API_KEY` 的查询以 `no-api-key` 失败；此包中没有交互式凭据流程。
