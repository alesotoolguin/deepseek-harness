// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GitBranchPicker, type GitBranchPickerProps } from '../src/client/GitBranchPicker.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Sessions = { byId: Record<string, { cwd?: string }> }
type Workspaces = { items: Array<{ sessionIds: string[]; path: string }> }
type SessionRow = { sessionId: string; blank: boolean }

const LIST_MAIN = { repo: '/repo', branches: ['main'] }

function props(overrides: Partial<GitBranchPickerProps> = {}): GitBranchPickerProps {
  return {
    useSession: ((selector: (s: SessionRow) => unknown) =>
      selector({ sessionId: 's1', blank: false })) as never,
    useSessions: ((selector: (s: Sessions) => unknown) =>
      selector({ byId: { s1: { cwd: '/repo' } } })) as never,
    useWorkspaces: ((selector: (s: Workspaces) => unknown) =>
      selector({ items: [] })) as never,
    variant: 'header',
    resolve: vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' }),
    list: vi.fn().mockResolvedValue(LIST_MAIN),
    status: vi.fn().mockResolvedValue({ repo: '/repo', changes: 0 }),
    create: vi.fn().mockResolvedValue({ ok: true, branch: 'feature-x' }),
    checkout: vi.fn().mockResolvedValue({ ok: true, branch: 'release' }),
    ...overrides,
  } as GitBranchPickerProps
}

describe('GitBranchPicker', () => {
  it('shows the checked-out branch of the session workspace repository', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' })
    render(<GitBranchPicker {...props({ resolve })} />)
    await screen.findByLabelText('branch main')
    expect(screen.getByText('main')).toBeDefined()
    expect(resolve).toHaveBeenCalledWith('/repo')
  })

  it('shows the branch of a blank session through its workspace path', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: 'main', repo: '/workspace' })
    render(<GitBranchPicker {...props({
      useSessions: ((selector: (s: Sessions) => unknown) =>
        selector({ byId: { s1: {} } })) as never,
      useWorkspaces: ((selector: (s: Workspaces) => unknown) =>
        selector({ items: [{ sessionIds: ['s1'], path: '/workspace' }] })) as never,
      resolve,
    })} />)
    await screen.findByLabelText('branch main')
    expect(resolve).toHaveBeenCalledWith('/workspace')
  })

  it('hero variant shows the branch while the session is blank', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: 'main', repo: '/workspace' })
    render(<GitBranchPicker {...props({
      variant: 'hero',
      useSession: ((selector: (s: SessionRow) => unknown) =>
        selector({ sessionId: 's1', blank: true })) as never,
      useSessions: ((selector: (s: Sessions) => unknown) =>
        selector({ byId: { s1: {} } })) as never,
      useWorkspaces: ((selector: (s: Workspaces) => unknown) =>
        selector({ items: [{ sessionIds: ['s1'], path: '/workspace' }] })) as never,
      resolve,
    })} />)
    await screen.findByLabelText('branch main')
    expect(resolve).toHaveBeenCalledWith('/workspace')
  })

  it('hero variant renders nothing once the session is engaged', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' })
    render(<GitBranchPicker {...props({ variant: 'hero', resolve })} />)
    await waitFor(() => { expect(resolve).toHaveBeenCalled() })
    expect(screen.queryByLabelText(/^branch /)).toBeNull()
  })

  it('shows the pending-change badge with the change count', async () => {
    const status = vi.fn().mockResolvedValue({ repo: '/repo', changes: 3 })
    render(<GitBranchPicker {...props({ status })} />)
    await screen.findByLabelText('3 pending changes')
    expect(screen.getByText('3')).toBeDefined()
  })

  it('hides the badge when the tree is clean or status is unavailable', async () => {
    const clean = vi.fn().mockResolvedValue({ repo: '/repo', changes: 0 })
    const { unmount } = render(<GitBranchPicker {...props({ status: clean })} />)
    await waitFor(() => { expect(clean).toHaveBeenCalled() })
    expect(screen.queryByLabelText(/pending changes/)).toBeNull()
    unmount()

    const unavailable = vi.fn().mockResolvedValue(null)
    render(<GitBranchPicker {...props({ status: unavailable })} />)
    await waitFor(() => { expect(unavailable).toHaveBeenCalled() })
    expect(screen.queryByLabelText(/pending changes/)).toBeNull()
  })

  it('re-polls the pending-change count while mounted', async () => {
    vi.useFakeTimers()
    const status = vi.fn().mockResolvedValue({ repo: '/repo', changes: 1 })
    render(<GitBranchPicker {...props({ status })} />)
    await act(async () => {})
    await act(async () => {})
    expect(screen.getByLabelText('1 pending changes')).toBeDefined()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('refreshes the pending-change count after switching branches', async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({ repo: '/repo', changes: 2 })
      .mockResolvedValue({ repo: '/repo', changes: 0 })
    render(<GitBranchPicker {...props({
      status,
      list: vi.fn().mockResolvedValue({ repo: '/repo', branches: ['main', 'release'] }),
    })} />)
    await screen.findByLabelText('2 pending changes')
    fireEvent.click(screen.getByLabelText('branch main'))
    fireEvent.click(await screen.findByRole('button', { name: 'release' }))
    await waitFor(() => { expect(status).toHaveBeenCalledTimes(3) })
    expect(screen.queryByLabelText(/pending changes/)).toBeNull()
  })

  it('opens a menu listing the local branches with the current one marked', async () => {
    const list = vi.fn().mockResolvedValue({ repo: '/repo', branches: ['main', 'release'] })
    render(<GitBranchPicker {...props({ list })} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    await screen.findByText('release')
    expect(list).toHaveBeenCalledWith('/repo')
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('shows the checked-out branch as the create base', async () => {
    render(<GitBranchPicker {...props()} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    await screen.findByText('Base: main')
  })

  it('keeps the current branch row disabled', async () => {
    render(<GitBranchPicker {...props()} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    const current = await screen.findByRole('button', { name: 'main' })
    expect((current as HTMLButtonElement).disabled).toBe(true)
  })

  it('switches to a listed branch and refreshes badge and list', async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce({ branch: 'main', repo: '/repo' })
      .mockResolvedValueOnce({ branch: 'release', repo: '/repo' })
    const list = vi.fn()
      .mockResolvedValueOnce({ repo: '/repo', branches: ['main', 'release'] })
      .mockResolvedValueOnce({ repo: '/repo', branches: ['main', 'release'] })
    const checkout = vi.fn().mockResolvedValue({ ok: true, branch: 'release' })
    render(<GitBranchPicker {...props({ resolve, list, checkout })} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    fireEvent.click(await screen.findByRole('button', { name: 'release' }))

    await screen.findByLabelText('branch release')
    expect(checkout).toHaveBeenCalledWith('/repo', 'release')
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    const switched = screen.getByRole('button', { name: 'release' }) as HTMLButtonElement
    expect(switched.disabled).toBe(true)
  })

  it('shows the checkout failure inline and keeps the menu open', async () => {
    const list = vi.fn().mockResolvedValue({ repo: '/repo', branches: ['main', 'release'] })
    const checkout = vi.fn()
      .mockResolvedValue({ ok: false, message: 'error: your local changes would be overwritten' })
    render(<GitBranchPicker {...props({ list, checkout })} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    fireEvent.click(await screen.findByRole('button', { name: 'release' }))

    await screen.findByRole('alert')
    expect(screen.getByText('error: your local changes would be overwritten')).toBeDefined()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('creates a branch, clears the draft, and refreshes badge and list', async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce({ branch: 'main', repo: '/repo' })
      .mockResolvedValueOnce({ branch: 'feature-x', repo: '/repo' })
    const list = vi.fn()
      .mockResolvedValueOnce(LIST_MAIN)
      .mockResolvedValueOnce({ repo: '/repo', branches: ['main', 'feature-x'] })
    const create = vi.fn().mockResolvedValue({ ok: true, branch: 'feature-x' })
    render(<GitBranchPicker {...props({ resolve, list, create })} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    await screen.findAllByText('main')

    const input = screen.getByLabelText('New branch name')
    fireEvent.change(input, { target: { value: 'feature-x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await screen.findByText('feature-x', { selector: 'li *' })
    expect(create).toHaveBeenCalledWith('/repo', 'feature-x')
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    await screen.findByLabelText('branch feature-x')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('shows the create failure inline and keeps the menu open', async () => {
    const list = vi.fn().mockResolvedValue(LIST_MAIN)
    const create = vi.fn()
      .mockResolvedValue({ ok: false, message: 'branch "feature-x" already exists' })
    render(<GitBranchPicker {...props({ list, create })} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    const input = screen.getByLabelText('New branch name')
    fireEvent.change(input, { target: { value: 'feature-x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await screen.findByRole('alert')
    expect(screen.getByText('branch "feature-x" already exists')).toBeDefined()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('disables create while the draft is empty', async () => {
    render(<GitBranchPicker {...props()} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
  })

  it('closes the menu when focus leaves the wrapper', async () => {
    const { container } = render(<GitBranchPicker {...props()} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    await screen.findByText('Local branches')
    fireEvent.blur(container.firstElementChild as HTMLElement)
    expect(screen.queryByText('Local branches')).toBeNull()
  })

  it('closes the menu on Escape', async () => {
    const { container } = render(<GitBranchPicker {...props()} />)
    fireEvent.click(await screen.findByLabelText('branch main'))
    await screen.findByText('Local branches')
    fireEvent.keyDown(container.firstElementChild as HTMLElement, { key: 'Escape' })
    expect(screen.queryByText('Local branches')).toBeNull()
  })

  it('renders nothing outside any repository', async () => {
    const resolve = vi.fn().mockResolvedValue({ branch: null, repo: null })
    render(<GitBranchPicker {...props({ resolve })} />)
    await waitFor(() => { expect(resolve).toHaveBeenCalled() })
    expect(screen.queryByLabelText(/^branch /)).toBeNull()
  })

  it('renders nothing while the session has no workspace directory', () => {
    const resolve = vi.fn()
    render(<GitBranchPicker {...props({
      useSessions: ((selector: (s: Sessions) => unknown) =>
        selector({ byId: { s1: {} } })) as never,
      resolve,
    })} />)
    expect(screen.queryByLabelText(/^branch /)).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })
})
