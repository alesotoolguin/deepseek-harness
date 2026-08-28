import { useEffect, useState, type ReactElement } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BalanceErrorCode, BalanceResult, BalanceView } from '@deepseek-ai/dsh-api-remotes/client'
import css from './BalanceSection.module.css'

/** Auto-refresh interval for the balance readout. */
export const REFRESH_MS = 60000

/** Registration-side face used by the section. */
export interface BalanceSectionInjected {
  /** Consulta el saldo; nunca lanza, devuelve el resultado estructurado. */
  refresh: () => Promise<BalanceResult>
  /** Programa una llamada periódica y devuelve su disposer; `undefined` sin servicio de timer. */
  interval: (callback: () => void, ms: number) => (() => void) | undefined
}

/** Full component props assembled by the settings.section renderer. */
export type BalanceSectionProps =
  PropsRuntime<'settings.section'> & InjectFace<BalanceSectionInjected>

/** Section state: the last readout survives refresh failures. */
interface UiState {
  readonly status: 'loading' | 'ok' | 'error'
  readonly data: BalanceView | null
  readonly error: string | null
}

/**
 * Account balance page for the DeepSeek account: per-currency rows, manual
 * refresh, and a one-minute auto-refresh while the page is open. Copy is
 * Spanish by user decision (see README "Copy language").
 */
export function BalanceSection(props: BalanceSectionProps): ReactElement {
  const [state, setState] = useState<UiState>({ status: 'loading', data: null, error: null })

  function load(): void {
    void props.refresh().then((result) => {
      if (result.ok) {
        setState({ status: 'ok', data: result.data, error: null })
      } else {
        setState(prev => ({
          status: 'error',
          data: prev.data,
          error: friendlyError(result.error, result.detail),
        }))
      }
    })
  }

  useEffect(() => {
    load()
    return props.interval(load, REFRESH_MS)
  }, [])

  function refreshNow(): void {
    setState(prev => ({ status: 'loading', data: prev.data, error: null }))
    load()
  }

  const data = state.data

  let body: ReactElement | null
  if (data !== null && data.currencies.length > 0) {
    body = (
      <div>
        {!data.isAvailable && (
          <p className={css.warn}>
            DeepSeek reporta que el saldo no está disponible para consultas en este momento.
          </p>
        )}
        {data.currencies.map((info, index) => (
          <div className={css.row} key={`${info.currency}-${index}`}>
            <div className={css.currency}>{info.currency}</div>
            <div className={css.total}>
              <span className={css.amount}>{info.totalBalance ?? '—'}</span>
              <span className={css.totalLabel}>saldo total</span>
            </div>
            <div className={css.sub}>
              Concedido: {info.grantedBalance ?? '—'}
              <br />
              Recargado: {info.toppedUpBalance ?? '—'}
            </div>
          </div>
        ))}
      </div>
    )
  } else if (data !== null) {
    body = <p className={css.note}>La cuenta no reporta saldos por moneda en este momento.</p>
  } else if (state.error !== null) {
    body = null
  } else {
    body = <p className={css.note}>Consultando saldo…</p>
  }

  return (
    <div className={css.root}>
      <div className={css.header}>
        <div>
          <div className={css.title}>Saldo de la cuenta DeepSeek</div>
          {data !== null && (
            <div className={css.updated}>Actualizado: {formatTime(data.fetchedAt)}</div>
          )}
        </div>
        <button
          type="button"
          className={css.refresh}
          onClick={refreshNow}
          disabled={state.status === 'loading'}
        >
          Actualizar
        </button>
      </div>
      {state.error !== null && <p className={css.error}>{state.error}</p>}
      {body}
    </div>
  )
}

/** Copy the stable failure code into a user-facing Spanish message. */
function friendlyError(code: BalanceErrorCode | null, detail: string): string {
  if (code === 'no-api-key') {
    return 'No se encontró la clave DEEPSEEK_API_KEY. Configúrala como credencial o variable de entorno y vuelve a intentarlo.'
  }
  if (code === 'credential-error') {
    return 'No se pudo resolver la credencial DEEPSEEK_API_KEY.' + (detail.length > 0 ? ` Detalle: ${detail}` : '')
  }
  if (code === 'request-failed') {
    return 'La API de DeepSeek rechazó la consulta.' + (detail.length > 0 ? ` ${detail}` : '')
  }
  if (code === 'bad-response') {
    return 'La API devolvió una respuesta inesperada.'
  }
  return 'No se pudo consultar el saldo.' + (detail.length > 0 ? ` ${detail}` : '')
}

/** Render the host-stamped ISO timestamp as a local time string. */
function formatTime(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleTimeString()
  } catch {
    /* v8 ignore next -- defensive: new Date(string) never throws; parse failure yields Invalid Date handled above */
    return iso
  }
}
