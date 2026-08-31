/**
 * Saldo DeepSeek settings section, browser half. It registers the
 * `settings.section` page that renders the account balance from the `balance`
 * Remote namespace, refreshing on open and every minute while visible.
 *
 * Export discipline: packages/client/AGENTS.md. Copy is deliberately Spanish
 * (user-owned feature; see README "Copy language").
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BalanceResult, ModelUsageView } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge (the balance namespace) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { BalanceSection, type BalanceSectionInjected } from './BalanceSection.tsx'

export type { BalanceSectionInjected, BalanceSectionProps } from './BalanceSection.tsx'

/** Services required by the settings registration and the generated Remote face. */
export const inject = ['slots', 'remote', 'remote.balance']

/** The optional client timer service, read without a hard injection (see README). */
type ClientTimer = { interval(callback: () => void, delay: number): () => void }

/**
 * Register the balance section once the `settings.section` declaration is on
 * the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const timer = ctx.get('timer') as ClientTimer | undefined
  const refresh = async (): Promise<BalanceResult> => {
    const result = await ctx.remote.balance.getBalance()
    if (!result.ok) {
      return { ok: false, error: null, detail: result.error.message, data: null }
    }
    return result.value
  }
  const refreshUsage = async (): Promise<ModelUsageView | null> => {
    const result = await ctx.remote.balance.getModelUsage()
    return result.ok ? result.value : null
  }
  const interval = (callback: () => void, ms: number): (() => void) | undefined =>
    timer?.interval(callback, ms)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'deepseek-balance',
    order: 30,
    label: () => 'Saldo DeepSeek',
    inject: (): BalanceSectionInjected => ({ refresh, refreshUsage, interval }),
  }, BalanceSection))
}
