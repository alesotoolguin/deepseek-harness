import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { fileURLToPath } from 'node:url'
import GitBranchGateway from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(): Promise<{ ctx: Context; gateway: GitBranchGateway }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(GitBranchGateway)
  const gateway = ctx.get('gitBranch') as GitBranchGateway
  return { ctx, gateway }
}

describe('GitBranchGateway', () => {
  it('publishes one direct branch method under the gitBranch namespace', async () => {
    const { gateway } = await harness()
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'gitBranch',
      namespace: 'gitBranch',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'branch', invocation: { kind: 'direct' } },
    ])
  })

  it('resolves the branch of a repository root over the Remote face', async () => {
    const { gateway } = await harness()
    const repo = fileURLToPath(new URL('./fixtures/repo', import.meta.url))
    await expect(gateway.branch({ root: repo })).resolves.toEqual({ branch: 'main', repo })
  })
})
