# @deepseek-ai/dsh-client-ui-balance

English | [中文](README.zh.md)

Browser settings section **Saldo DeepSeek**: an account balance page for the DeepSeek API, rendered from the [`balance` Remote namespace](../../web/web-balance/README.md) (`ctx.remote.balance.getBalance()`). It lists one card per reported currency (total, granted, and topped-up balance), a manual **Actualizar** button, the last-update time, and a one-minute auto-refresh while the page is open.

The section registers into the `settings.section` list slot (order 30, id `deepseek-balance`). The Host service owns credential resolution and the HTTP call; this package renders the structured `BalanceResult` and maps each failure code to a user-facing message. Failures never expose the API key, and a failed auto-refresh keeps the last readout visible beside the error banner.

## Mounting

```yaml
- id: ui-balance
  name: '@deepseek-ai/dsh-client-ui-balance'
```

The row must sit in the browser roster (`dsh.client`, platform `web`) beside the `web-balance` host row; the profile's module table serves `lib/client.js` once the package is bundled.

## Copy language

Product copy is Chinese by repository convention, but this user-owned feature is deliberately **Spanish-only**: the section label and every message are hardcoded Spanish, and the package does not register a locale namespace. This is a documented deviation requested by the deployment owner.

## Model Experience

None, as the section renders an account-level balance result for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Spanish-only copy** — the label does not follow the active locale (see "Copy language"); switching the GUI locale leaves the section in Spanish.
- **No per-model usage** — the page shows only the account balance; DeepSeek's API has no historical per-model usage endpoint (see the Host package README).
