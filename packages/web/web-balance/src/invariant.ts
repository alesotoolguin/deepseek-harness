/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-web-balance`.
 * @module @deepseek-ai/dsh-web-balance/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-web-balance'

/** Cordis companion plugin name. */
export const name = 'web-balance-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the service owns one outbound HTTP request whose
 * response is parsed and returned synchronously inside the same call, and an
 * in-memory usage fold fed by `llm/stream` chunks that is only observable
 * through the `getModelUsage` read — no later authoritative in-process event
 * exists to relate either to. Wire parsing and the fold are pinned at the
 * service boundary and in unit tests instead.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
