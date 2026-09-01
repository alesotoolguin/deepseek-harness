# Agent Note: DeepSeek balance viewer as a static two-package feature

Status: implemented
Archived: 2026-08-31

English | [中文](2026-08-27-deepseek-balance-static-plugin.zh.md)

## Problem

The account balance viewer started as a session-local dynamic plugin (`dsbal-1`) built on `harness.handle`/`host.call`. Dynamic plugins disappear with the process and belong to one session, so the viewer could not be a permanent part of the deployment. Separately, no Host RPC existed to read the DeepSeek account balance: the `web` fetch seam accepts a URL only, and the balance endpoint requires an `Authorization: Bearer` header, so the harness had no in-process path to that API.

## Decision

Ship the viewer as two static packages mounted in the `dsh-web-app` bundle:

- `@deepseek-ai/dsh-web-balance` — a Host service (`ctx.balance`) extending `TypertRemoteService` with one `@Remote('getBalance')` method, publishing the `balance` Remote namespace. It resolves `DEEPSEEK_API_KEY` per call through the optional `ctx.credentials` seam (falling back to the launch environment), then calls `GET https://api.deepseek.com/user/balance` with native `fetch`, `redirect: 'error'` (credential-bearing requests must fail on redirect), a 15s `AbortSignal.timeout`, and a 64KiB response bound. The key never leaves the Host and never appears in a failure detail.
- `@deepseek-ai/dsh-client-ui-balance` — the browser half registering the `settings.section` page `deepseek-balance` (order 30, label **Saldo DeepSeek**), rendering one card per reported currency (total, granted, topped-up), a manual refresh button, the last-update time, and a 60-second auto-refresh while the page is open. A failed refresh keeps the last readout visible beside the error banner.

### Per-model usage accumulation

A global `llm/stream` waterfall listener wraps every streamed model call and folds the reported `usage` chunk into an in-memory accumulator keyed by `provider/model`; the `balance/getModelUsage` Remote serves the process-lifetime snapshot (calls plus input/output/cache-read/cache-write/reasoning tokens per route). The browser section renders it as a second card under the balance. Timing metrics (LLM wall time, TTFT, tok/s) stay session-level in the `session-stats` projection and are not per-model.

### RPC and assembly

The client calls `ctx.remote.balance.getBalance()` through the typert gateway; `packages/api/remotes` imports the generated `@deepseek-ai/dsh-web-balance/remote` contribution, mounts it, and re-exports the domain's client-safe types. The Host method returns a **flat** `BalanceResult` (`ok`/`data`/`error`/`detail`) with stable `BalanceErrorCode` values (`credential-error`, `no-api-key`, `request-failed`, `bad-response`); a flat object was chosen over a discriminated union to keep the generated zod codec trivially simple.

### Copy language

Product copy is Chinese by repository convention, but this user-owned feature is deliberately **Spanish-only**: label and messages are hardcoded Spanish and no locale namespace is registered. This is a documented deviation requested by the deployment owner.

### Timer without a hard injection

The auto-refresh uses the client `timer` service read through `ctx.get('timer')` as an optional capability, exposed to the component as an injected `interval(callback, ms)` callback. The vendored timer's `Context.timer` augmentation is Host-typed (it references `NodeJS.Timeout`), so the client face cannot inject it as a typed service without importing Node types.

## Alternatives considered

**Keep the dynamic plugin.** Rejected: the viewer must survive process restarts and serve every session; dynamic plugins are process-local and session-owned.

**Expose the call through the hand-maintained apiproxy `IApiClient`.** Rejected: that surface belongs to the core wire contract (sessions, settings, credentials); the typert `@Remote` path is the established extension seam for browser-facing Host services (the `git-branch` and `plugin-inventory` precedents).

**Run `curl` through the shell service.** Rejected for the static form: native `fetch` exists in Host Node code and honors `redirect: 'error'` directly, keeping the request secret-free in process listings.

**Add a per-model usage readout.** Not built: DeepSeek's public API exposes only the account balance; historical per-model usage exists only in the platform console. The 60-second refresh and the README document the boundary.

## Verification

`packages/web/web-balance` unit tests mock `fetch` and the credential seam (success normalization, redirect/header assertions, no-key, credential failure, JSON and plain-text error bodies, empty and unreadable error bodies, non-JSON success bodies, non-object payloads, non-string fields, ambient fallback) plus the invariant companion; `packages/client/ui-balance` specs cover the section states (loading, ok, per-currency rows, placeholders, error mapping, last readout retention, manual refresh, interval cleanup, Remote failure mapping, empty host half) and the invariant companion. Both packages hold 100% per-file coverage in the scoped lane, `pnpm run test:gui` is green (4082 tests), the typert contracts generate `balance/getBalance`, `verify-client-packages` passes, and oxlint is clean on the changed files.

One unrelated pre-existing client-face type error remains in `packages/client/ui-git-branch/tests/branch-picker.client.spec.tsx` (`HTMLElement.disabled`); it predates this change and is tracked for the next PR sweep rather than fixed here.

## Consequences

The static packages persist across restarts once the web profile mounts them (`web-balance` host row plus `ui-balance` roster row in the `dsh-web-app` bundle) and the profile heals its module table; mounting requires a web process restart. The `balance` Remote namespace becomes available to every browser consumer, and the key resolves through the credentials seam like the LLM adapter's, so a key stored on the Web Models page reaches the next query without a restart. The Spanish-only copy stays independent of the GUI locale, and there is no per-model usage surface until DeepSeek exposes one.
