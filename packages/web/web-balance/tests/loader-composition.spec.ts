import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import BalanceService from '../src/index.ts'
import type { BalanceResult, ModelUsageView } from '../src/types.ts'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllGlobals()
})

describe('web-balance real Loader composition through cordis.yml', () => {
  it('boots the service row and serves balance/getBalance through the typert gateway', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-balance-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-web-balance'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(TypertRegistry)
    await context.plugin(TypertGatewayService)
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier !== '@deepseek-ai/dsh-web-balance') throw new Error(`unexpected Loader import: ${specifier}`)
        return BalanceService
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    // The generated host manifest registers exactly as the typert-loader does
    // in a real deployment (that loader resolves packages through the healed
    // profile node_modules, which a unit test cannot).
    const manifest = (await import('../lib/typert.host.js')).TYPERT
    context.typert.register(manifest as TypertContribution)

    const service = context.get('balance') as BalanceService
    expect(service).toBeInstanceOf(BalanceService)

    context.provide('credentials', {
      resolve: async () => ({ value: 'sk-loader' }),
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      is_available: true,
      balance_infos: [{
        currency: 'CNY',
        total_balance: '5.00',
        granted_balance: '1.00',
        topped_up_balance: '4.00',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const result = await context.typertGateway.invoke({
      namespace: 'balance',
      method: 'getBalance',
      args: {},
    }) as BalanceResult

    expect(result.ok).toBe(true)
    if (!result.ok || result.data === null) throw new Error('expected ok')
    expect(result.data.currencies).toEqual([{
      currency: 'CNY',
      totalBalance: '5.00',
      grantedBalance: '1.00',
      toppedUpBalance: '4.00',
    }])
    expect(service.typertRemote).toMatchObject({ serviceKey: 'balance', namespace: 'balance' })
  })

  it('surfaces a structured no-key failure through the gateway', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-balance-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-web-balance'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(TypertRegistry)
    await context.plugin(TypertGatewayService)
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier !== '@deepseek-ai/dsh-web-balance') throw new Error(`unexpected Loader import: ${specifier}`)
        return BalanceService
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const manifest = (await import('../lib/typert.host.js')).TYPERT
    context.typert.register(manifest as TypertContribution)

    context.provide('credentials', {
      resolve: async () => undefined,
    })

    const result = await context.typertGateway.invoke({
      namespace: 'balance',
      method: 'getBalance',
      args: {},
    }) as BalanceResult

    expect(result).toEqual({ ok: false, error: 'no-api-key', detail: '', data: null })
  })

  it('serves per-model usage accumulated from llm/stream through the gateway', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-balance-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-web-balance'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(TypertRegistry)
    await context.plugin(TypertGatewayService)
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier !== '@deepseek-ai/dsh-web-balance') throw new Error(`unexpected Loader import: ${specifier}`)
        return BalanceService
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const manifest = (await import('../lib/typert.host.js')).TYPERT
    context.typert.register(manifest as TypertContribution)

    const stream = context.waterfall('llm/stream', { provider: 'deepseek', model: 'deepseek-v4-pro' } as GenerateOptions, () =>
      (async function* () {
        yield { type: 'text-delta', index: 0, text: 'x' }
        yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })())
    // Drenar el stream: el wrapper es un generador perezoso.
    for await (const _ of stream) void _

    const usage = await context.typertGateway.invoke({
      namespace: 'balance',
      method: 'getModelUsage',
      args: {},
    }) as ModelUsageView

    expect(usage.models).toHaveLength(1)
    expect(usage.models[0]).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      calls: 1,
      inputTokens: 4,
      outputTokens: 2,
    })
  })
})
