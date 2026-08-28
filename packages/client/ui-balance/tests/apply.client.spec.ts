// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyHost } from '../src/index.ts'
import { BalanceSection, type BalanceSectionInjected } from '../src/client/BalanceSection.tsx'
import type { BalanceResult } from '@deepseek-ai/dsh-api-remotes/client'

afterEach(cleanup)

const RESULT: BalanceResult = {
  ok: true,
  error: null,
  detail: '',
  data: { isAvailable: true, currencies: [], fetchedAt: '2026-01-01T10:00:00.000Z' },
}

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench(): Promise<{
  ctx: Context
  slots: SlotRegistry
  getBalance: ReturnType<typeof vi.fn>
  interval: ReturnType<typeof vi.fn>
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const getBalance = vi.fn<() => Promise<Result<BalanceResult>>>()
    .mockResolvedValue({ ok: true, value: RESULT })
  ctx.provide('remote.balance', { getBalance })
  const interval = vi.fn(() => () => {})
  ctx.provide('timer', { interval })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, getBalance, interval }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
    },
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
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const section = b.slots.entries('settings.section')[0]!
    expect(section.component).toBe(BalanceSection)
    expect(section.options).toMatchObject({ id: 'deepseek-balance', order: 30 })
    expect((section.options.label as () => string)()).toBe('Saldo DeepSeek')
    expect(b.getBalance).not.toHaveBeenCalled()

    const injected = (section.inject as unknown as () => BalanceSectionInjected)()
    await expect(injected.refresh()).resolves.toEqual(RESULT)
    expect(b.getBalance).toHaveBeenCalledTimes(1)

    const stop = injected.interval(() => {}, 123)
    expect(b.interval).toHaveBeenCalledWith(expect.any(Function), 123)
    expect(typeof stop).toBe('function')

    await b.ctx.fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
  })

  it('maps a Remote failure to the structured balance failure', async () => {
    const b = await bench()
    b.getBalance.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'boom' } })
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const section = b.slots.entries('settings.section')[0]!
    const injected = (section.inject as unknown as () => BalanceSectionInjected)()
    await expect(injected.refresh()).resolves.toEqual({
      ok: false,
      error: null,
      detail: 'boom',
      data: null,
    })

    await b.ctx.fiber.dispose()
  })
})
