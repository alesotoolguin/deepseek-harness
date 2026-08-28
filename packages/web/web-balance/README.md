# @deepseek-ai/dsh-web-balance

English | [中文](README.zh.md)

A remote-only Host service (`ctx.balance`) that reads the DeepSeek account balance from [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance) and exposes it to the browser as the `balance` Remote namespace (`api.balance.getBalance()` through the typert gateway).

The service resolves the harness `DEEPSEEK_API_KEY` credential for **each** call through the optional `ctx.credentials` seam (process environment, provider-managed store, and `.env` files), falling back to the launch environment when the seam is absent — the same key the DeepSeek LLM adapter uses, so no new secret is required. A key stored or rotated on the Web Models page reaches the next query without a restart.

The request is a plain `fetch` with an `Authorization: Bearer` header and **redirects rejected** (`redirect: 'error'`), because the request carries a credential: automatic forwarding of the key to another origin must fail rather than follow. A non-2xx response is a structured failure carrying the API's own message, never the key; the returned JSON is normalized to leaf fields only.

## Mounting

```yaml
- id: web-balance
  name: '@deepseek-ai/dsh-web-balance'
```

The service is a Loader service plugin (default export) and publishes the `balance` Remote namespace; the `dsh-api-remotes` client assembly mounts it for browser consumers.

## Mapping

The endpoint returns one `balance_infos[]` entry per currency:

| Wire field | `BalanceCurrencyView` field |
|---|---|
| `currency` | `currency` |
| `total_balance` | `totalBalance` |
| `granted_balance` | `grantedBalance` |
| `topped_up_balance` | `toppedUpBalance` |

Amounts are decimal **strings** and are forwarded unparsed, so no float precision is lost. `is_available` maps to `BalanceView.isAvailable`, and every successful call stamps `fetchedAt` with the host time of the response. Failures use the `BalanceResult` union (`ok`/`data`/`error`/`detail`) with stable `BalanceErrorCode` values: `credential-error`, `no-api-key`, `request-failed`, and `bad-response`.

## Model Experience

None, as the service reads an account-level endpoint for a human-facing settings row and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **No per-model usage history** — DeepSeek exposes only the account balance over the API; the platform console is the only historical per-model usage surface. Token usage per request is available from each chat-completion response but is not accumulated here.
- **The key must be configured** — a query without a resolvable `DEEPSEEK_API_KEY` fails as `no-api-key`; there is no interactive credential flow in this package.
