// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BalanceSection, type BalanceSectionProps } from '../src/client/BalanceSection.tsx'
import type { BalanceResult, BalanceView } from '@deepseek-ai/dsh-api-remotes/client'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const VIEW: BalanceView = {
  isAvailable: true,
  currencies: [{
    currency: 'CNY',
    totalBalance: '110.00',
    grantedBalance: '10.00',
    toppedUpBalance: '100.00',
  }],
  fetchedAt: '2026-01-01T10:00:00.000Z',
}

function okResult(data: BalanceView = VIEW): BalanceResult {
  return { ok: true, error: null, detail: '', data }
}

function failResult(error: 'no-api-key' | 'request-failed' | 'bad-response' | 'credential-error', detail = ''): BalanceResult {
  return { ok: false, error, detail, data: null }
}

function props(overrides: Partial<BalanceSectionProps> = {}): BalanceSectionProps {
  return {
    useSession: (() => undefined) as never,
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    close: () => {},
    refresh: vi.fn().mockResolvedValue(okResult()),
    interval: vi.fn(() => () => {}),
    ...overrides,
  } as BalanceSectionProps
}

describe('BalanceSection', () => {
  it('queries on mount and schedules the one-minute auto-refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(okResult())
    const interval = vi.fn(() => () => {})
    render(<BalanceSection {...props({ refresh, interval })} />)

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60000)

    await screen.findByText('CNY')
    expect(screen.getByText('110.00')).toBeDefined()
    expect(screen.getByText(/Concedido: 10\.00/)).toBeDefined()
    expect(screen.getByText(/Recargado: 100\.00/)).toBeDefined()
  })

  it('keeps the last readout visible when an auto-refresh fails', async () => {
    const refresh = vi.fn()
      .mockResolvedValueOnce(okResult())
      .mockResolvedValueOnce(failResult('request-failed', 'Authentication Fails (governor)'))
    // Un timer real: el interval dispara el callback (un segundo refresh).
    const interval = vi.fn((cb: () => void) => {
      cb()
      return () => {}
    })
    render(<BalanceSection {...props({ refresh, interval })} />)

    await screen.findByText('CNY')
    await waitFor(() => {
      expect(screen.getByText(/La API de DeepSeek rechazó la consulta\. Authentication Fails/)).toBeDefined()
    })
    // El saldo anterior sigue visible junto al aviso de error.
    expect(screen.getByText('110.00')).toBeDefined()
  })

  it('shows the no-api-key guidance when the credential is missing', async () => {
    render(<BalanceSection {...props({ refresh: vi.fn().mockResolvedValue(failResult('no-api-key')) })} />)

    await screen.findByText(/No se encontró la clave DEEPSEEK_API_KEY/)
  })

  it('shows a credential error with its detail', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(failResult('credential-error', 'store locked')),
    })} />)

    await screen.findByText(/No se pudo resolver la credencial DEEPSEEK_API_KEY\. Detalle: store locked/)
  })

  it('shows a credential error without detail', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(failResult('credential-error')),
    })} />)

    await screen.findByText(/No se pudo resolver la credencial DEEPSEEK_API_KEY\.$/)
  })

  it('shows a request failure without detail', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(failResult('request-failed')),
    })} />)

    await screen.findByText(/La API de DeepSeek rechazó la consulta\.$/)
  })

  it('shows the unexpected-response message', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(failResult('bad-response')),
    })} />)

    await screen.findByText('La API devolvió una respuesta inesperada.')
  })

  it('falls back to a generic message for unknown failures', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue({ ok: false, error: null, detail: 'boom', data: null }),
    })} />)

    await screen.findByText(/No se pudo consultar el saldo\. boom/)
  })

  it('falls back to a generic message without detail', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue({ ok: false, error: null, detail: '', data: null }),
    })} />)

    await screen.findByText(/No se pudo consultar el saldo\.$/)
  })

  it('renders missing balance fields with placeholders', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(okResult({
        ...VIEW,
        currencies: [{ currency: 'USD', totalBalance: null, grantedBalance: null, toppedUpBalance: null }],
      })),
    })} />)

    await screen.findByText('USD')
    expect(screen.getByText('—')).toBeDefined()
  })

  it('shows the raw timestamp when it cannot be parsed', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(okResult({ ...VIEW, fetchedAt: 'not-a-date' })),
    })} />)

    await screen.findByText(/Actualizado: not-a-date/)
  })

  it('shows a warning when the account reports the balance unavailable', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(okResult({ ...VIEW, isAvailable: false })),
    })} />)

    await screen.findByText(/el saldo no está disponible para consultas/)
  })

  it('shows a note when no currency rows are reported', async () => {
    render(<BalanceSection {...props({
      refresh: vi.fn().mockResolvedValue(okResult({ ...VIEW, currencies: [] })),
    })} />)

    await screen.findByText('La cuenta no reporta saldos por moneda en este momento.')
  })

  it('re-queries when the user clicks Actualizar', async () => {
    const refresh = vi.fn().mockResolvedValue(okResult())
    render(<BalanceSection {...props({ refresh })} />)
    await screen.findByText('CNY')

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    await waitFor(() => { expect(refresh).toHaveBeenCalledTimes(2) })
  })

  it('shows the last update time from the host timestamp', async () => {
    render(<BalanceSection {...props()} />)
    await screen.findByText(/Actualizado: /)
  })

  it('cleans up the interval on unmount', async () => {
    const stop = vi.fn()
    const interval = vi.fn(() => stop)
    const { unmount } = render(<BalanceSection {...props({ interval })} />)
    await screen.findByText('CNY')

    unmount()

    expect(stop).toHaveBeenCalledTimes(1)
  })
})
