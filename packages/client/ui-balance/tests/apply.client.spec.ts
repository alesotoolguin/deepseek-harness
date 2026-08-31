// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyHost } from '../src/index.ts'
import { BalanceSection, type BalanceSectionInjected } from '../src/client/BalanceSection.tsx'
import type { BalanceResult, ModelUsageView } from '@deepseek-ai/dsh-api-remotes/client'

const RESULT: BalanceResult = {
  ok: true,
  error: null,
  detail: '',
  data: { isAvailable: true, currencies: [], fetchedAt: '2026-01-01T10:00:00.000Z' },
}

const USAGE: ModelUsageView = {
  since: '2026-01-01T10:00:00.000Z',
  models: [],
}

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench(): Promise<{
  runtime: SlotTestRuntime
  getBalance: ReturnType<typeof vi.fn>
  getModelUsage: ReturnType<typeof vi.fn>
  interval: ReturnType<typeof vi.fn>
}> {
  const runtime = await SlotTestRuntime.create()
  const getBalance = vi.fn<() => Promise<Result<BalanceResult>>>()
    .mockResolvedValue({ ok: true, value: RESULT })
  const getModelUsage = vi.fn<() => Promise<Result<ModelUsageView>>>()
    .mockResolvedValue({ ok: true, value: USAGE })
  new TestRemote(runtime.ctx, { balance: { getBalance, getModelUsage } })
  const interval = vi.fn(() => () => {})
  runtime.ctx.provide('timer', { interval })
  return { runtime, getBalance, getModelUsage, interval }
}

async function declare(runtime: SlotTestRuntime): Promise<void> {
  await runtime.root.declare({
    'settings.section': { kind: 'list', scope: 'root' },
  } as never, () => null)
}

describe('ui-balance browser plugin', () => {
  it('keeps the host half empty', () => {
    expect(() => { applyHost() }).not.toThrow()
  })

  it('declares only the services used by the Remote contribution', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.balance'])
  })

  it('registers the settings section without reading the Remote eagerly', async () => {
    const b = await bench()
    await declare(b.runtime)
    const feature = await b.runtime.mount({ inject: [...inject], apply })

    const section = b.runtime.slots.entries('settings.section')[0]!
    expect(section.component).toBe(BalanceSection)
    expect(section.options).toMatchObject({ id: 'deepseek-balance', order: 30 })
    expect((section.options.label as () => string)()).toBe('Saldo DeepSeek')
    expect(b.getBalance).not.toHaveBeenCalled()
    expect(b.getModelUsage).not.toHaveBeenCalled()

    const injected = (section.inject as unknown as () => BalanceSectionInjected)()
    await expect(injected.refresh()).resolves.toEqual(RESULT)
    expect(b.getBalance).toHaveBeenCalledTimes(1)
    await expect(injected.refreshUsage()).resolves.toEqual(USAGE)
    expect(b.getModelUsage).toHaveBeenCalledTimes(1)

    const stop = injected.interval(() => {}, 123)
    expect(b.interval).toHaveBeenCalledWith(expect.any(Function), 123)
    expect(typeof stop).toBe('function')

    await feature.dispose()
    expect(b.runtime.slots.entries('settings.section')).toHaveLength(0)
    await b.runtime.dispose()
  })

  it('maps a Remote failure to the structured balance failure', async () => {
    const b = await bench()
    b.getBalance.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'boom' } })
    await declare(b.runtime)
    const feature = await b.runtime.mount({ inject: [...inject], apply })

    const section = b.runtime.slots.entries('settings.section')[0]!
    const injected = (section.inject as unknown as () => BalanceSectionInjected)()
    await expect(injected.refresh()).resolves.toEqual({
      ok: false,
      error: null,
      detail: 'boom',
      data: null,
    })

    await feature.dispose()
    await b.runtime.dispose()
  })

  it('maps a Remote failure for usage to null', async () => {
    const b = await bench()
    b.getModelUsage.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'boom' } })
    await declare(b.runtime)
    const feature = await b.runtime.mount({ inject: [...inject], apply })

    const section = b.runtime.slots.entries('settings.section')[0]!
    const injected = (section.inject as unknown as () => BalanceSectionInjected)()
    await expect(injected.refreshUsage()).resolves.toBeNull()

    await feature.dispose()
    await b.runtime.dispose()
  })
})
