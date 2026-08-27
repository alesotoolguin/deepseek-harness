/** Browser plugin rendering the checked-out git branch of the active session's workspace. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { GitBranchBadge, type GitBranchBadgeInjected } from './GitBranchBadge.tsx'

export type { GitBranchBadgeInjected, GitBranchBadgeProps } from './GitBranchBadge.tsx'

/** Services required by the header registration and generated Remote face. */
export const inject = ['slots', 'remote', 'remote.gitBranch']

/** Contribute the branch badge to the session-header utility strip. */
export function apply(ctx: ClientContext): void {
  const resolve: GitBranchBadgeInjected['resolve'] = async (root) => {
    const result = await ctx.remote.gitBranch.branch({ root })
    return result.ok ? result.value : null
  }
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'git-branch-badge',
    order: 10,
    label: () => 'Branch',
    inject: (): GitBranchBadgeInjected => ({ resolve }),
  }, GitBranchBadge))
}
