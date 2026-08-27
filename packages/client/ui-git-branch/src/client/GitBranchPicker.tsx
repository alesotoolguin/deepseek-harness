import { useEffect, useState, type FormEvent, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { GitBranchListResult, GitBranchResult, GitBranchStatusResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GitBranchPicker.module.css'

/** How often the pending-change badge re-reads the repository status. */
const STATUS_POLL_MS = 5000

/** Outcome of a branch action (create or checkout), as the picker presents it. */
export type GitBranchActionOutcome =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly message: string }

/** Registration-side Remote face used by the picker. */
export interface GitBranchPickerInjected {
  /** Resolve the branch of the git repository enclosing `root`; null outside any repository. */
  resolve: (root: string) => Promise<GitBranchResult | null>
  /** List the local branches of the git repository enclosing `root`; null outside any repository. */
  list: (root: string) => Promise<GitBranchListResult | null>
  /** Count the pending changes of the git repository enclosing `root`; null outside any repository. */
  status: (root: string) => Promise<GitBranchStatusResult | null>
  /** Create a local branch at the current commit and switch to it. */
  create: (root: string, name: string) => Promise<GitBranchActionOutcome>
  /** Switch the working tree to an existing local branch. */
  checkout: (root: string, name: string) => Promise<GitBranchActionOutcome>
}

/** Full component props assembled by the session-header utilities slot renderer. */
export type GitBranchPickerProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<GitBranchPickerInjected>

/** One in-flight branch action, or null when idle. */
type BusyAction = 'create' | 'checkout' | null

/**
 * Session-header branch picker: a pill with the checked-out branch of the
 * session workspace's repository that opens a menu listing the local branches
 * (each row switches to that branch), with a form to create a new branch at
 * the current commit.
 */
export function GitBranchPicker(props: GitBranchPickerProps): ReactElement | null {
  const sessionId = props.useSession(s => s.sessionId)
  const cwd = props.useSessions(s => s.byId[sessionId]?.cwd)
  const [result, setResult] = useState<GitBranchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<GitBranchListResult | null>(null)
  const [status, setStatus] = useState<GitBranchStatusResult | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cwd === undefined) {
      setResult(null)
      return
    }
    let alive = true
    void props.resolve(cwd).then((next) => { if (alive) setResult(next) })
    return () => { alive = false }
  }, [cwd, props.resolve])

  useEffect(() => {
    if (cwd === undefined) {
      setStatus(null)
      return
    }
    const root = cwd
    let alive = true
    async function poll(): Promise<void> {
      const next = await props.status(root)
      if (alive) setStatus(next)
    }
    void poll()
    const timer = setInterval(() => { void poll() }, STATUS_POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [cwd, props.status])

  if (result?.branch === undefined || result.branch === null) return null
  const repo = result.repo ?? cwd ?? ''
  const currentBranch = result.branch

  async function refresh(root: string): Promise<void> {
    const [nextResult, nextList, nextStatus] = await Promise.all([
      props.resolve(root), props.list(root), props.status(root),
    ])
    setResult(nextResult)
    setList(nextList)
    setStatus(nextStatus)
  }

  function onToggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setError(null)
    if (cwd !== undefined) {
      void props.list(cwd).then(setList)
      void props.status(cwd).then(setStatus)
    }
  }

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    const name = draft.trim()
    if (cwd === undefined || name === '' || busy !== null) return
    setBusy('create')
    setError(null)
    const outcome = await props.create(cwd, name)
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setDraft('')
    await refresh(cwd)
  }

  async function onCheckout(name: string): Promise<void> {
    if (cwd === undefined || busy !== null || name === currentBranch) return
    setBusy('checkout')
    setError(null)
    const outcome = await props.checkout(cwd, name)
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    await refresh(cwd)
  }

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') setOpen(false)
  }

  return (
    <div className={css.wrapper} onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={css.button}
        title={repo}
        aria-label={`branch ${currentBranch}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onToggle}
      >
        <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2v8a3 3 0 0 0 3 3h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="4" cy="2" r="1.6" fill="currentColor" />
          <circle cx="4" cy="13" r="1.6" fill="currentColor" />
          <circle cx="12" cy="13" r="1.6" fill="currentColor" />
        </svg>
        <span className={css.name}>{currentBranch}</span>
        {status !== null && status.changes > 0 && (
          <span
            className={css.dirty}
            title={`${status.changes} pending change${status.changes === 1 ? '' : 's'}`}
            aria-label={`${status.changes} pending changes`}
          >
            {status.changes}
          </span>
        )}
        <svg className={css.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className={css.menu}>
          <div className={css.menuHead}>Local branches</div>
          {list === null
            ? <div className={css.empty}>Loading…</div>
            : list.branches.length === 0
              ? <div className={css.empty}>No local branches</div>
              : (
                <ul className={css.list} aria-label="Local branches">
                  {list.branches.map(name => (
                    <li key={name}>
                      <button
                        type="button"
                        className={name === currentBranch ? `${css.row} ${css.rowCurrent}` : css.row}
                        title={name === currentBranch ? `Current: ${name}` : `Switch to ${name}`}
                        disabled={busy !== null || name === currentBranch}
                        onClick={() => { void onCheckout(name) }}
                      >
                        <span className={css.check} aria-hidden="true">
                          {name === currentBranch ? '✓' : ''}
                        </span>
                        <span className={css.rowName}>{name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          <div className={css.base}>Base: {currentBranch}</div>
          <form className={css.form} onSubmit={(event) => { void onCreate(event) }}>
            <input
              className={css.input}
              value={draft}
              placeholder="New branch name"
              aria-label="New branch name"
              disabled={busy !== null}
              onChange={(event) => { setDraft(event.target.value) }}
            />
            <button
              type="submit"
              className={css.create}
              disabled={busy !== null || draft.trim() === ''}
            >
              {busy === 'create' ? 'Creating…' : 'Create'}
            </button>
          </form>
          {error !== null && <div className={css.error} role="alert">{error}</div>}
        </div>
      )}
    </div>
  )
}
