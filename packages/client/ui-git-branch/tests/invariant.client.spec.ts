// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as GitBranchInvariant from '../src/invariant.ts'

describe('ui-git-branch invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(GitBranchInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
