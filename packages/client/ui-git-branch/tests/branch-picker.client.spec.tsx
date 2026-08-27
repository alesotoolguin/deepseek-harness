// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GitBranchPicker, type GitBranchPickerProps } from '../src/client/GitBranchPicker.tsx'

afterEach(cleanup)

type Sessions = { byId: Record<string, { cwd?: string }> }

const LIST_MAIN = { repo: '/repo', branches: ['main'] }

function props(overrides: Partial<GitBranchPickerProps> = {}): GitBranchPickerProps {
  return {
    useSession: ((selector: (s: { sessionId: string }) => unknown) =>
      selector({ sessionId: 's1' })) as never,
    useSessions: ((selector: (s: Sessions) => unknown) =>
      selector({ byId: { s1: { cwd: '/repo' } } })) as never,
    resolve: vi.fn().mockResolvedValue({ branch: 'main', repo: '/repo' }),
    list: vi.fn().mockResolvedValue(LIST_MAIN),
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
