// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { GitBranchPicker, type GitBranchPickerInjected } from '../src/client/GitBranchPicker.tsx'

afterEach(cleanup)

const BRANCH = { branch: 'main', repo: '/repo' }
const LIST = { repo: '/repo', branches: ['main'] }
const STATUS = { repo: '/repo', changes: 2 }
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const branch = vi.fn<() => Promise<Result<typeof BRANCH>>>()
    .mockResolvedValue({ ok: true, value: BRANCH })
  const list = vi.fn<() => Promise<Result<typeof LIST>>>()
    .mockResolvedValue({ ok: true, value: LIST })
  const status = vi.fn<() => Promise<Result<typeof STATUS>>>()
    .mockResolvedValue({ ok: true, value: STATUS })
  const create = vi.fn<() => Promise<Result<string>>>()
    .mockResolvedValue({ ok: true, value: 'feature-x' })
  const checkout = vi.fn<() => Promise<Result<string>>>()
    .mockResolvedValue({ ok: true, value: 'release' })
  ctx.provide('remote.gitBranch', { branch, list, status, create, checkout })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, branch, list, status, create, checkout }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
}

describe('ui-git-branch browser plugin', () => {
  it('declares only the services used by the Remote contributions', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.gitBranch'])
  })

  it('registers the header and hero pickers without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const header = b.slots.entries('conversation.session.header.utilities')[0]!
    const hero = b.slots.entries('conversation.input.dock')[0]!
    expect(header.component).toBe(GitBranchPicker)
    expect(header.options).toMatchObject({ id: 'git-branch-picker', order: 10 })
    expect(hero.component).toBe(GitBranchPicker)
    expect(hero.options).toMatchObject({ id: 'git-branch-hero', order: 10 })
    expect(b.branch).not.toHaveBeenCalled()
    expect(b.list).not.toHaveBeenCalled()
    expect(b.status).not.toHaveBeenCalled()
    expect(b.create).not.toHaveBeenCalled()
    expect(b.checkout).not.toHaveBeenCalled()

    const headerInjected = (header.inject as unknown as () => GitBranchPickerInjected)()
    const heroInjected = (hero.inject as unknown as () => GitBranchPickerInjected)()
    expect(headerInjected.variant).toBe('header')
    expect(heroInjected.variant).toBe('hero')
    await expect(headerInjected.resolve('/repo')).resolves.toEqual(BRANCH)
    expect(b.branch).toHaveBeenCalledWith({ root: '/repo' })
    await expect(heroInjected.list('/repo')).resolves.toEqual(LIST)
    expect(b.list).toHaveBeenCalledWith({ root: '/repo' })
    await expect(headerInjected.status('/repo')).resolves.toEqual(STATUS)
    expect(b.status).toHaveBeenCalledWith({ root: '/repo' })
    await expect(heroInjected.create('/repo', 'feature-x')).resolves.toEqual({
      ok: true,
      branch: 'feature-x',
    })
    expect(b.create).toHaveBeenCalledWith({ root: '/repo', name: 'feature-x' })
    await expect(headerInjected.checkout('/repo', 'release')).resolves.toEqual({
      ok: true,
      branch: 'release',
    })
    expect(b.checkout).toHaveBeenCalledWith({ root: '/repo', name: 'release' })

    b.branch.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(heroInjected.resolve('/repo')).resolves.toBeNull()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(headerInjected.list('/repo')).resolves.toBeNull()
    b.status.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(heroInjected.status('/repo')).resolves.toBeNull()
    b.create.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(headerInjected.create('/repo', 'feature-x')).resolves.toEqual({
      ok: false,
      message: 'unavailable',
    })
    b.checkout.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(heroInjected.checkout('/repo', 'release')).resolves.toEqual({
      ok: false,
      message: 'unavailable',
    })
    await b.ctx.fiber.dispose()
  })

  it('recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(b.slots.entries('conversation.input.dock')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1)
      expect(b.slots.entries('conversation.input.dock')).toHaveLength(1)
    })

    stop()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(b.slots.entries('conversation.input.dock')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('conversation.session.header.utilities')[0]?.component).toBe(GitBranchPicker)
      expect(b.slots.entries('conversation.input.dock')[0]?.component).toBe(GitBranchPicker)
    })

    await fiber.dispose()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(b.slots.entries('conversation.input.dock')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
