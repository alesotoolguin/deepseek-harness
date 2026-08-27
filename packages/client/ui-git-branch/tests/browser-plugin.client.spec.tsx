// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { GitBranchBadge, type GitBranchBadgeInjected } from '../src/client/GitBranchBadge.tsx'

afterEach(cleanup)

const BRANCH = { branch: 'main', repo: '/repo' }
type BranchResult =
  | { readonly ok: true; readonly value: typeof BRANCH }
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
  const branch = vi.fn<() => Promise<BranchResult>>()
    .mockResolvedValue({ ok: true, value: BRANCH })
  ctx.provide('remote.gitBranch', { branch })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, branch }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } },
  } as never, () => null)
}

describe('ui-git-branch browser plugin', () => {
  it('declares only the services used by the header Remote contribution', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.gitBranch'])
  })

  it('registers the badge without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('conversation.session.header.utilities')[0]!
    expect(entry.component).toBe(GitBranchBadge)
    expect(entry.options).toMatchObject({ id: 'git-branch-badge', order: 10 })
    expect(b.branch).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => GitBranchBadgeInjected)()
    await expect(injected.resolve('/repo')).resolves.toEqual(BRANCH)
    expect(b.branch).toHaveBeenCalledWith({ root: '/repo' })

    b.branch.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(injected.resolve('/repo')).resolves.toBeNull()
    await b.ctx.fiber.dispose()
  })

  it('recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1) })

    stop()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('conversation.session.header.utilities')[0]?.component).toBe(GitBranchBadge)
    })

    await fiber.dispose()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
