/**
 * DeepSeek account balance query service (`ctx.balance`): resolves the harness
 * credential and reads `GET /user/balance` with native `fetch`, rejecting
 * redirects because the request carries the API key.
 * @module @deepseek-ai/dsh-web-balance
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { BalanceCurrencyView, BalanceResult, BalanceView } from './types.ts'

export type * from './types.ts'

/** DeepSeek balance endpoint. */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Credential reference resolved for each query; the same key the LLM adapter uses. */
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** Upper bound on one balance response body, applied where the complete value is known. */
const MAX_RESPONSE_BYTES = 65536

/** Upper bound on one balance request. */
const REQUEST_TIMEOUT_MS = 15000

/**
 * Remote-only service exposing the account balance to the browser. The key is
 * resolved per call (a rotated credential reaches the next query without a
 * restart) and never leaves the Host.
 */
export class BalanceService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'balance')
  }

  /**
   * Read `GET /user/balance` with the harness API key. Redirects are rejected
   * because the request carries a credential; a non-2xx response is surfaced
   * as a structured failure with the API's own message, never the key.
   * @returns the normalized balance view, or a structured failure.
   */
  @Remote('getBalance')
  async getBalance(): Promise<BalanceResult> {
    let key: string | undefined
    try {
      key = await this.resolveApiKey()
    } catch (error) {
      return { ok: false, error: 'credential-error', detail: describe(error), data: null }
    }
    if (key === undefined) return { ok: false, error: 'no-api-key', detail: '', data: null }

    let response: Response
    try {
      response = await fetch(BALANCE_URL, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return { ok: false, error: 'request-failed', detail: describe(error), data: null }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: 'request-failed',
        detail: await errorDetail(response),
        data: null,
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (_) {
      return { ok: false, error: 'bad-response', detail: '', data: null }
    }

    return { ok: true, error: null, detail: '', data: normalize(payload) }
  }

  /**
   * Resolve the current API key: the credential seam first (process, provider
   * store, and `.env` files), then the launch environment when no seam exists.
   * @returns the resolved key, or `undefined` while none is configured.
   */
  private async resolveApiKey(): Promise<string | undefined> {
    const ref = credentialRef(DEFAULT_API_KEY_ENV)
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const resolved = await credentials.resolve(ref)
      if (resolved !== undefined && resolved.value.length > 0) return resolved.value
      return undefined
    }
    const ambient = launchEnvironmentOf(this.ctx).get(ref)
    return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
  }
}

export default BalanceService

/** Extract leaf fields only from the wire payload; never forwards unknown fields. */
function normalize(payload: unknown): BalanceView {
  const record = payload !== null && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}
  const infos = Array.isArray(record.balance_infos)
    ? record.balance_infos.filter((info): info is Record<string, unknown> =>
      info !== null && typeof info === 'object')
    : []
  const currencies: BalanceCurrencyView[] = infos.map(info => ({
    currency: typeof info.currency === 'string' ? info.currency : '',
    totalBalance: typeof info.total_balance === 'string' ? info.total_balance : null,
    grantedBalance: typeof info.granted_balance === 'string' ? info.granted_balance : null,
    toppedUpBalance: typeof info.topped_up_balance === 'string' ? info.topped_up_balance : null,
  }))
  return {
    isAvailable: record.is_available === true,
    currencies,
    fetchedAt: new Date().toISOString(),
  }
}

/** Surface the API's error message (JSON body or plain text), bounded and secret-free. */
async function errorDetail(response: Response): Promise<string> {
  let text = ''
  try {
    text = (await response.text()).slice(0, MAX_RESPONSE_BYTES)
  } catch (_) {
    return ''
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) return ''
  try {
    const payload = JSON.parse(trimmed) as unknown
    if (payload !== null && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      if (typeof record.error === 'string') return record.error.slice(0, 400)
      if (record.error !== null && typeof record.error === 'object') {
        const error = record.error as Record<string, unknown>
        if (typeof error.message === 'string') return error.message.slice(0, 400)
      }
      if (typeof record.message === 'string') return record.message.slice(0, 400)
    }
  } catch (_) {
    // Non-JSON error body: surface the raw text below.
  }
  return trimmed.slice(0, 400)
}

/** One-line, secret-free rendering of an arbitrary error. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
