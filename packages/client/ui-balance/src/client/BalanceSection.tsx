import { useEffect, useState, type ReactElement } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BalanceErrorCode, BalanceResult, BalanceView, ModelUsageView,
} from '@deepseek-ai/dsh-api-remotes/client'
import css from './BalanceSection.module.css'

/** Auto-refresh interval for the readout. */
export const REFRESH_MS = 60000

/** Registration-side face used by the section. */
export interface BalanceSectionInjected {
  /** Consulta el saldo; nunca lanza, devuelve el resultado estructurado. */
  refresh: () => Promise<BalanceResult>
  /** Consulta el uso por modelo acumulado; `null` si la consulta Remote falla. */
  refreshUsage: () => Promise<ModelUsageView | null>
  /** Programa una llamada periódica y devuelve su disposer; `undefined` sin servicio de timer. */
  interval: (callback: () => void, ms: number) => (() => void) | undefined
}

/** Full component props assembled by the settings.section renderer. */
export type BalanceSectionProps =
  PropsRuntime<'settings.section'> & InjectFace<BalanceSectionInjected>

/** Balance state: the last readout survives refresh failures. */
interface UiState {
  readonly status: 'loading' | 'ok' | 'error'
  readonly data: BalanceView | null
  readonly error: string | null
}

/** Usage state: last view survives refresh failures; `failed` marks a Remote error. */
interface UsageState {
  readonly data: ModelUsageView | null
  readonly failed: boolean
}

/**
 * Account dashboard page for the DeepSeek account: per-currency balance cards,
 * a per-model usage card accumulated from `llm/stream`, manual refresh, and a
 * one-minute auto-refresh while the page is open. Copy is Spanish by user
 * decision (see README "Copy language").
 */
export function BalanceSection(props: BalanceSectionProps): ReactElement {
  const [state, setState] = useState<UiState>({ status: 'loading', data: null, error: null })
  const [usage, setUsage] = useState<UsageState>({ data: null, failed: false })

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

  function loadUsage(): void {
    void props.refreshUsage().then((view) => {
      setUsage(prev => ({ data: view ?? prev.data, failed: view === null }))
    })
  }

  useEffect(() => {
    load()
    loadUsage()
    return props.interval(() => {
      load()
      loadUsage()
    }, REFRESH_MS)
  }, [])

  function refreshNow(): void {
    setState(prev => ({ status: 'loading', data: prev.data, error: null }))
    load()
    loadUsage()
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
      <ModelUsageCard usage={usage} />
    </div>
  )
}

/**
 * Per-model usage card fed by the Host accumulator: one row per
 * `provider/model` route with call and token totals since the process start.
 */
function ModelUsageCard(props: { usage: UsageState }): ReactElement {
  const view = props.usage.data
  return (
    <div>
      <div className={css.usageHeader}>
        <span className={css.title}>Uso por modelo</span>
        {view !== null && (
          <span className={css.updated}>Desde {formatTime(view.since)}</span>
        )}
      </div>
      {props.usage.failed && (
        <p className={css.error}>No se pudo consultar el uso por modelo.</p>
      )}
      {view !== null && view.models.length === 0 && (
        <p className={css.note}>Aún no hay llamadas registradas en este proceso.</p>
      )}
      {view !== null && view.models.length > 0 && (
        <div>
          {view.models.map(row => (
            <div className={css.row} key={`${row.provider}-${row.model}`}>
              <div className={css.currency}>{row.model}</div>
              <div className={css.sub}>
                {row.calls} llamada{row.calls === 1 ? '' : 's'}
                {' · '}
                Input {formatNumber(row.inputTokens)}
                {' · '}
                Cache {formatNumber(row.cacheReadTokens)}
                {' · '}
                Output {formatNumber(row.outputTokens)}
                {row.reasoningTokens > 0 ? ` · Raz. ${formatNumber(row.reasoningTokens)}` : ''}
              </div>
            </div>
          ))}
          <p className={css.updated}>Tokens acumulados desde el inicio del proceso.</p>
        </div>
      )}
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

/** Render a token count with locale grouping. */
function formatNumber(value: number): string {
  return value.toLocaleString()
}
