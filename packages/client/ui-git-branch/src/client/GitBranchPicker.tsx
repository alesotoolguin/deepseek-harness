import { useEffect, useState, type FormEvent, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react'
import { IconCheckOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
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
  /**
   * Which seat this instance renders in: the session-header strip (always)
   * or the hero dock of a blank session (visible only while the session is
   * still blank, until the header takes over).
   */
  variant: 'header' | 'hero'
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

/** Full component props assembled by either the header utilities or the hero row renderer. */
export type GitBranchPickerProps =
  PropsRuntime<'conversation.session.header.utilities' | 'conversation.hero.workspace.utilities'>
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
  const blank = props.useSession(s => s.blank)
  const cwd = props.useSessions(s => s.byId[sessionId]?.cwd)
  // A blank session has no cwd until its first run starts; the workspace it
  // is connected to carries the same directory, so the picker resolves that
  // path and shows the branch immediately after the workspace is picked.
  const workspacePath = props.useWorkspaces(s =>
    s.items.find(w => w.sessionIds.includes(sessionId))?.path,
  )
  const root = cwd ?? workspacePath
  const [result, setResult] = useState<GitBranchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<GitBranchListResult | null>(null)
  const [status, setStatus] = useState<GitBranchStatusResult | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (root === undefined) {
      setResult(null)
      return
    }
    let alive = true
    void props.resolve(root).then((next) => { if (alive) setResult(next) })
    return () => { alive = false }
  }, [root, props.resolve])

  useEffect(() => {
    if (root === undefined) {
      setStatus(null)
      return
    }
    const rootDir = root
    let alive = true
    async function poll(): Promise<void> {
      const next = await props.status(rootDir)
      if (alive) setStatus(next)
    }
    void poll()
    const timer = setInterval(() => { void poll() }, STATUS_POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [root, props.status])

  // The hero dock instance only exists while the session is still blank;
  // once the conversation starts, the session header (with its own picker)
  // takes over, so this seat must go silent to avoid a duplicate pill.
  if (props.variant === 'hero' && !blank) return null

  if (result?.branch === undefined || result.branch === null) return null
  const repo = result.repo ?? root ?? ''
  const currentBranch = result.branch

  async function refresh(rootDir: string): Promise<void> {
    const [nextResult, nextList, nextStatus] = await Promise.all([
      props.resolve(rootDir), props.list(rootDir), props.status(rootDir),
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
    if (root !== undefined) {
      void props.list(root).then(setList)
      void props.status(root).then(setStatus)
    }
  }

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    const name = draft.trim()
    if (root === undefined || name === '' || busy !== null) return
    setBusy('create')
    setError(null)
    const outcome = await props.create(root, name)
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setDraft('')
    await refresh(root)
  }

  async function onCheckout(name: string): Promise<void> {
    if (root === undefined || busy !== null || name === currentBranch) return
    setBusy('checkout')
    setError(null)
    const outcome = await props.checkout(root, name)
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    await refresh(root)
  }

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') setOpen(false)
  }

  return (
    <div
      className={props.variant === 'hero' ? `${css.wrapper} ${css.wrapperHero}` : css.wrapper}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
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
          <div className={css.viewport}>
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
                          className={css.row}
                          title={name === currentBranch ? `Current: ${name}` : `Switch to ${name}`}
                          disabled={busy !== null || name === currentBranch}
                          onClick={() => { void onCheckout(name) }}
                        >
                          <span className={css.rowName}>{name}</span>
                          {name === currentBranch && <IconCheckOutline16 className={css.check} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
          </div>
          <div className={css.footer}>
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
        </div>
      )}
    </div>
  )
}
