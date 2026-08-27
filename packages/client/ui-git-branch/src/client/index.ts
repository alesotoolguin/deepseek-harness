/** Browser plugin rendering the git-branch picker of the active session's workspace. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  GitBranchPicker,
  type GitBranchCreateOutcome,
  type GitBranchPickerInjected,
} from './GitBranchPicker.tsx'

export type {
  GitBranchCreateOutcome,
  GitBranchPickerInjected,
  GitBranchPickerProps,
} from './GitBranchPicker.tsx'

/** Services required by the header registration and generated Remote face. */
export const inject = ['slots', 'remote', 'remote.gitBranch']

/** Contribute the branch picker to the session-header utility strip. */
export function apply(ctx: ClientContext): void {
  const resolve: GitBranchPickerInjected['resolve'] = async (root) => {
    const result = await ctx.remote.gitBranch.branch({ root })
    return result.ok ? result.value : null
  }
  const list: GitBranchPickerInjected['list'] = async (root) => {
    const result = await ctx.remote.gitBranch.list({ root })
    return result.ok ? result.value : null
  }
  const create: GitBranchPickerInjected['create'] = async (root, name): Promise<GitBranchCreateOutcome> => {
    const result = await ctx.remote.gitBranch.create({ root, name })
    return result.ok
      ? { ok: true, branch: result.value }
      : { ok: false, message: result.error.message }
  }
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'git-branch-picker',
    order: 10,
    label: () => 'Branch',
    inject: (): GitBranchPickerInjected => ({ resolve, list, create }),
  }, GitBranchPicker))
}
