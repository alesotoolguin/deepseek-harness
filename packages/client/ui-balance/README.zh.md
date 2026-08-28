# @deepseek-ai/dsh-client-ui-balance

[English](README.md) | 中文

浏览器设置页 **Saldo DeepSeek**：DeepSeek API 的账户余额页面，由 [`balance` Remote 命名空间](../../web/web-balance/README.zh.md)（`ctx.remote.balance.getBalance()`）渲染。每种报告的货币列出卡片（总额、赠送和充值余额），带手动 **Actualizar** 按钮、上次更新时间，以及页面打开时每 60 秒自动刷新。

该节注册到 `settings.section` 列表槽（order 30，id `deepseek-balance`），渲染两张卡片：账户余额，以及由 `ctx.remote.balance.getModelUsage()` 提供的按模型用量卡片（每个 `provider/model` 路由的调用数和 input/cache/output/reasoning token，进程生命周期内累积）。Host 服务负责凭据解析和 HTTP 调用；此包渲染结构化结果，并将每个失败代码映射为用户可见消息。失败永不暴露 API 密钥，失败的自动刷新会在错误横幅旁保留上次读数。

## Mounting

```yaml
- id: ui-balance
  name: '@deepseek-ai/dsh-client-ui-balance'
```

该行必须位于浏览器 roster（`dsh.client`，platform `web`）中，紧挨 `web-balance` Host 行；一旦包被打包，profile 的模块表就会提供 `lib/client.js`。

## Copy language

产品文案按仓库约定为中文，但此用户自有功能刻意**只用西班牙语**：节标签和每条消息都是硬编码的西班牙语，且该包不注册 locale 命名空间。这是部署所有者要求的、已记录的偏差。

## Model Experience

None，因为该节为人类渲染账户级余额结果，不涉及任何提示、消息、schema、流或工具结果。

#### KV Cache effect

None；该包从不组装或发送提供商请求。

## Known Limitations and Deferred Work

- **仅西班牙语文案** — 标签不跟随活动 locale（见 "Copy language"）；切换 GUI locale 后该节仍为西班牙语。
- **无按模型用量** — 该页只显示账户余额；DeepSeek 的 API 没有历史按模型用量端点（见 Host 包 README）。
