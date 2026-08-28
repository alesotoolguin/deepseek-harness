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
 * response is parsed and returned synchronously inside the same call, so there
 * is no later authoritative in-process event to relate it to. Wire parsing is
 * pinned at the service boundary instead.
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
