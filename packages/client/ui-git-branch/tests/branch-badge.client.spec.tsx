// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { GitBranchBadge, type GitBranchBadgeProps } from '../src/client/GitBranchBadge.tsx'

afterEach(cleanup)

function props(overrides: Partial<GitBranchBadgeProps> = {}): GitBranchBadgeProps {
  return {
    useSession: ((selector: (s: { sessionId: string }) => unknown) =>
      selector({ sessionId: 's1' })) as never,
    useSessions: ((selector: (s: { byId: Record<string, { cwd?: string }> }) => unknown) =>
      selector({ byId: { s1: { cwd: '/repo' } } })) as never,
    resolve: vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' }),
    ...overrides,
  } as GitBranchBadgeProps
}

describe('GitBranchBadge', () => {
  it('shows the checked-out branch of the session workspace repository', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' })
    render(<GitBranchBadge {...props({ resolve })} />)
    await screen.findByLabelText('branch main')
    expect(screen.getByText('main')).toBeDefined()
    expect(resolve).toHaveBeenCalledWith('/repo')
  })

  it('renders nothing outside any repository', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: null, repo: null })
    render(<GitBranchBadge {...props({ resolve })} />)
    await waitFor(() => { expect(resolve).toHaveBeenCalled() })
    expect(screen.queryByLabelText(/^branch /)).toBeNull()
  })

  it('renders nothing while the session has no workspace directory', () => {
    const resolve = vi.fn()
    render(<GitBranchBadge {...props({
      useSessions: ((selector: (s: { byId: Record<string, { cwd?: string }> }) => unknown) =>
        selector({ byId: { s1: {} } })) as never,
      resolve,
    })} />)
    expect(screen.queryByLabelText(/^branch /)).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })
})
