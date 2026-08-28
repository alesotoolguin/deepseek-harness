import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import BalanceService, { BALANCE_URL, DEFAULT_API_KEY_ENV } from '../src/index.ts'
import type { BalanceResult } from '../src/types.ts'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllGlobals()
})

/** One Response with a JSON body, like the DeepSeek endpoint produces. */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

interface FakeCredentials {
  resolve: ReturnType<typeof vi.fn>
}

function fakeCredentials(resolve: (ref: string) => Promise<{ value: string } | undefined>): FakeCredentials {
  return { resolve: vi.fn(resolve) }
}

async function harness(options: {
  fetchImpl?: typeof fetch
  credentials?: FakeCredentials
  launchEnvironment?: ReturnType<typeof createLaunchEnvironmentSnapshot>
} = {}): Promise<{ ctx: Context; service: BalanceService; credentials: FakeCredentials | undefined }> {
  const ctx = new Context()
  contexts.push(ctx)
  if (options.credentials !== undefined) ctx.provide('credentials', options.credentials)
  if (options.launchEnvironment !== undefined) ctx.provide('launchEnvironment', options.launchEnvironment)
  if (options.fetchImpl !== undefined) vi.stubGlobal('fetch', options.fetchImpl)
  await ctx.plugin(BalanceService)
  const service = ctx.get('balance') as BalanceService
  return { ctx, service, credentials: options.credentials }
}

describe('BalanceService', () => {
  it('publishes getBalance under the balance namespace', async () => {
    const { service } = await harness()
    expect(service.typertRemote).toMatchObject({
      serviceKey: 'balance',
      namespace: 'balance',
    })
    expect(remoteMethods(service)).toEqual([
      { method: 'getModelUsage', invocation: { kind: 'direct' } },
      { method: 'getBalance', invocation: { kind: 'direct' } },
    ])
  })

  it('returns the normalized view on a successful response, rejecting redirects and sending the key', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(BALANCE_URL)
      expect(init?.redirect).toBe('error')
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer sk-test')
      expect(headers.get('accept')).toBe('application/json')
      return jsonResponse({
        is_available: true,
        balance_infos: [{
          currency: 'CNY',
          total_balance: '110.00',
          granted_balance: '10.00',
          topped_up_balance: '100.00',
        }],
      })
    })
    const { service } = await harness({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.isAvailable).toBe(true)
    expect(result.data.currencies).toEqual([{
      currency: 'CNY',
      totalBalance: '110.00',
      grantedBalance: '10.00',
      toppedUpBalance: '100.00',
    }])
    expect(typeof result.data.fetchedAt).toBe('string')
  })

  it('reports no-api-key when the credential seam has no value and the launch environment is empty', async () => {
    const { service, credentials } = await harness({
      credentials: fakeCredentials(async () => undefined),
      launchEnvironment: createLaunchEnvironmentSnapshot([{ source: 'process', values: {} }]),
    })

    const result = await service.getBalance()

    expect(credentials?.resolve).toHaveBeenCalledWith(DEFAULT_API_KEY_ENV)
    expect(result).toEqual({ ok: false, error: 'no-api-key', detail: '', data: null })
  })

  it('reports credential-error when the credential seam throws', async () => {
    const { service } = await harness({
      credentials: fakeCredentials(async () => {
        throw new Error('store locked')
      }),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(false)
    expect(result.error).toBe('credential-error')
    expect(result.detail).toContain('store locked')
  })

  it('falls back to the launch environment when the credential seam is absent', async () => {
    const { service } = await harness({
      launchEnvironment: createLaunchEnvironmentSnapshot([
        { source: 'process', values: { DEEPSEEK_API_KEY: 'sk-ambient' } },
      ]),
      fetchImpl: (async () => jsonResponse({
        is_available: true,
        balance_infos: [{ currency: 'USD', total_balance: '5.00', granted_balance: '0.00', topped_up_balance: '5.00' }],
      })) as unknown as typeof fetch,
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(true)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.currencies[0]?.currency).toBe('USD')
  })

  it('surfaces the API message from a JSON error body on a non-2xx response', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse(
        { error: { message: 'Authentication Fails (governor)', type: 'authentication_error' } },
        { status: 401 },
      )) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({
      ok: false,
      error: 'request-failed',
      detail: 'Authentication Fails (governor)',
      data: null,
    })
  })

  it('surfaces the raw text of a non-JSON error body', async () => {
    const { service } = await harness({
      fetchImpl: (async () => new Response('upstream error', { status: 503 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: 'upstream error' })
  })

  it('reports bad-response when a 2xx body is not JSON', async () => {
    const { service } = await harness({
      fetchImpl: (async () => new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'bad-response', detail: '' })
  })

  it('reports request-failed when fetch throws', async () => {
    const { service } = await harness({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED')
      }) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: 'ECONNREFUSED' })
  })

  it('reports no-api-key when the launch environment holds an empty value', async () => {
    const { service } = await harness({
      launchEnvironment: createLaunchEnvironmentSnapshot([
        { source: 'process', values: { DEEPSEEK_API_KEY: '' } },
      ]),
    })

    const result = await service.getBalance()

    expect(result).toEqual({ ok: false, error: 'no-api-key', detail: '', data: null })
  })

  it('normalizes a non-object payload to an empty view', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse('plain string')) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(true)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.isAvailable).toBe(false)
    expect(result.data.currencies).toEqual([])
  })

  it('normalizes a payload without balance_infos', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({ is_available: true })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(true)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.isAvailable).toBe(true)
    expect(result.data.currencies).toEqual([])
  })

  it('maps non-string balance fields to placeholders', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({
        balance_infos: [{ currency: 42, total_balance: 10, granted_balance: 5, topped_up_balance: 5 }],
      })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(true)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.currencies).toEqual([{
      currency: '',
      totalBalance: null,
      grantedBalance: null,
      toppedUpBalance: null,
    }])
  })

  it('surfaces an empty detail when the error body read fails', async () => {
    const broken = { ok: false, status: 500, text: async () => { throw new Error('read failed') } }
    const { service } = await harness({
      fetchImpl: (async () => broken as unknown as Response) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: '' })
  })

  it('surfaces an empty detail for an empty error body', async () => {
    const { service } = await harness({
      fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: '' })
  })

  it('falls back to the raw error body for a null error field', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({ error: null }, { status: 401 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('error')
  })

  it('falls back to the raw error body when the error object lacks a message', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({ error: { code: 42 } }, { status: 401 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('code')
  })

  it('surfaces the top-level message of a JSON error body', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({ message: 'rate limited' }, { status: 429 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: 'rate limited' })
  })

  it('reports request-failed when fetch throws a non-Error', async () => {
    const { service } = await harness({
      fetchImpl: (async () => {
        throw 'network down'
      }) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-test' })),
    })

    const result = await service.getBalance()

    expect(result).toMatchObject({ ok: false, error: 'request-failed', detail: 'network down' })
  })

  it('never forwards the key in a failure detail', async () => {
    const { service } = await harness({
      fetchImpl: (async () => jsonResponse({ error: 'nope' }, { status: 401 })) as unknown as typeof fetch,
      credentials: fakeCredentials(async () => ({ value: 'sk-super-secret' })),
    })

    const result: BalanceResult = await service.getBalance()

    expect(JSON.stringify(result)).not.toContain('sk-super-secret')
  })
})

describe('BalanceService per-model usage accumulation', () => {
  type UsageSample = {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  }

  function usageStream(usages: UsageSample[]): AsyncIterable<StreamChunk> {
    return (async function* () {
      yield { type: 'text-delta', index: 0, text: 'x' }
      for (const usage of usages) yield { type: 'usage', usage }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }

  function options(provider: string, model: string): GenerateOptions {
    return { provider, model } as GenerateOptions
  }

  it('publishes getModelUsage under the balance namespace', async () => {
    const { service } = await harness()
    expect(service.typertRemote).toMatchObject({ serviceKey: 'balance', namespace: 'balance' })
    expect(remoteMethods(service)).toEqual(
      expect.arrayContaining([{ method: 'getModelUsage', invocation: { kind: 'direct' } }]),
    )
  })

  it('folds usage chunks by provider/model and re-yields every chunk', async () => {
    const { ctx, service } = await harness()

    const out = ctx.waterfall('llm/stream', options('deepseek', 'deepseek-v4-pro'), () =>
      usageStream([{ inputTokens: 5, outputTokens: 2 }]))

    const chunks: StreamChunk[] = []
    for await (const chunk of out) chunks.push(chunk)
    expect(chunks.map(chunk => chunk.type)).toEqual(['text-delta', 'usage', 'finish'])

    const view = service.getModelUsage()
    expect(view.models).toHaveLength(1)
    expect(view.models[0]).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      calls: 1,
      inputTokens: 5,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    })
    expect(typeof view.since).toBe('string')
  })

  it('accumulates across calls and folds optional cache and reasoning fields', async () => {
    const { ctx, service } = await harness()

    for (const [model, usages] of [
      ['m1', [{ inputTokens: 10, outputTokens: 3, cacheReadTokens: 7, cacheWriteTokens: 1, reasoningTokens: 2 }]],
      ['m1', [{ inputTokens: 1, outputTokens: 1 }]],
      ['m2', [{ inputTokens: 0, outputTokens: 0 }]],
    ] as const) {
      // Drenar el stream: el wrapper es un generador perezoso.
      const out = ctx.waterfall('llm/stream', options('deepseek', model), () => usageStream([...usages]))
      for await (const _ of out) void _
    }

    const view = service.getModelUsage()
    expect(view.models).toHaveLength(2)
    expect(view.models[0]).toMatchObject({
      model: 'm1', calls: 2, inputTokens: 11, outputTokens: 4, cacheReadTokens: 7, cacheWriteTokens: 1, reasoningTokens: 2,
    })
    expect(view.models[1]).toMatchObject({ model: 'm2', calls: 1 })
  })

  it('does not create a row for a stream without a usage chunk', async () => {
    const { ctx, service } = await harness()

    const out = ctx.waterfall('llm/stream', options('deepseek', 'silent'), () =>
      (async function* () { yield { type: 'text-delta', index: 0, text: 'x' } })())
    for await (const _ of out) void _

    expect(service.getModelUsage().models).toHaveLength(0)
  })
})
