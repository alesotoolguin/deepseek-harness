/**
 * Client-safe type surface of the DeepSeek balance query: the normalized wire
 * view and the structured failure union the browser section renders. Types
 * only — no runtime code, and nothing here reaches a Host-only symbol.
 *
 * @module @deepseek-ai/dsh-web-balance/types
 */

/** One currency's balance row from `GET /user/balance`. */
export interface BalanceCurrencyView {
  /** ISO currency code as reported by DeepSeek (for example `CNY` or `USD`). */
  readonly currency: string
  /** Total balance (granted plus topped up), as a decimal string. */
  readonly totalBalance: string | null
  /** Balance granted by the platform, as a decimal string. */
  readonly grantedBalance: string | null
  /** Balance added by top-up, as a decimal string. */
  readonly toppedUpBalance: string | null
}

/** Normalized payload of `GET /user/balance`. */
export interface BalanceView {
  /** Whether the account balance is sufficient for API calls. */
  readonly isAvailable: boolean
  /** One row per reported currency. */
  readonly currencies: readonly BalanceCurrencyView[]
  /** ISO timestamp of the successful response. */
  readonly fetchedAt: string
}

/** Stable machine code naming the failure the browser section renders. */
export type BalanceErrorCode = 'credential-error' | 'no-api-key' | 'request-failed' | 'bad-response'

/**
 * Structured outcome of one balance query, JSON-safe end to end. `ok` is
 * `true` exactly when `data` is present; failures carry a stable `error` code
 * and a human `detail` that never contains the API key.
 */
export interface BalanceResult {
  readonly ok: boolean
  readonly data: BalanceView | null
  readonly error: BalanceErrorCode | null
  readonly detail: string
}

/** One model route's accumulated usage since the harness process started. */
export interface ModelUsageRow {
  /** Provider route key reported by the call (`GenerateOptions.provider`). */
  readonly provider: string
  /** Model name reported by the call (`GenerateOptions.model`). */
  readonly model: string
  /** Number of streamed model calls counted. */
  readonly calls: number
  /** Uncached input tokens (`TokenUsage.inputTokens`). */
  readonly inputTokens: number
  /** Output tokens (`TokenUsage.outputTokens`). */
  readonly outputTokens: number
  /** Cached-input tokens read (`TokenUsage.cacheReadTokens`). */
  readonly cacheReadTokens: number
  /** Cached-input tokens written (`TokenUsage.cacheWriteTokens`). */
  readonly cacheWriteTokens: number
  /** Reasoning tokens (`TokenUsage.reasoningTokens`). */
  readonly reasoningTokens: number
  /** ISO timestamp of the first counted call. */
  readonly firstSeenAt: string
  /** ISO timestamp of the most recent counted call. */
  readonly lastSeenAt: string
}

/** Live per-model usage view served to the browser. */
export interface ModelUsageView {
  /** One row per `provider/model` route, ordered by first call. */
  readonly models: readonly ModelUsageRow[]
  /** ISO timestamp of the accumulator's start (process start / plugin mount). */
  readonly since: string
}
