import { useEffect, useState, type FormEvent, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { GitBranchListResult, GitBranchResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GitBranchPicker.module.css'

/** Outcome of creating a local branch, as the picker presents it. */
export type GitBranchCreateOutcome =
  | { readonly ok: true; readonly branch: string }
  | { readonly ok: false; readonly message: string }

/** Registration-side Remote face used by the picker. */
export interface GitBranchPickerInjected {
  /** Resolve the branch of the git repository enclosing `root`; null outside any repository. */
  resolve: (root: string) => Promise<GitBranchResult | null>
  /** List the local branches of the git repository enclosing `root`; null outside any repository. */
  list: (root: string) => Promise<GitBranchListResult | null>
  /** Create a local branch at the current commit and switch to it. */
  create: (root: string, name: string) => Promise<GitBranchCreateOutcome>
}

/** Full component props assembled by the session-header utilities slot renderer. */
export type GitBranchPickerProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<GitBranchPickerInjected>

/**
 * Session-header branch picker: a pill with the checked-out branch of the
 * session workspace's repository that opens a menu listing the local branches
 * and offering to create a new branch at the current commit.
 */
export function GitBranchPicker(props: GitBranchPickerProps): ReactElement | null {
  const sessionId = props.useSession(s => s.sessionId)
  const cwd = props.useSessions(s => s.byId[sessionId]?.cwd)
  const [result, setResult] = useState<GitBranchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<GitBranchListResult | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
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

  if (result?.branch === undefined || result.branch === null) return null
  const repo = result.repo ?? cwd ?? ''

  async function refresh(root: string): Promise<void> {
    const [nextResult, nextList] = await Promise.all([props.resolve(root), props.list(root)])
    setResult(nextResult)
    setList(nextList)
  }

  function onToggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setError(null)
    if (cwd !== undefined) void props.list(cwd).then(setList)
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const name = draft.trim()
    if (cwd === undefined || name === '' || busy) return
    setBusy(true)
    setError(null)
    const outcome = await props.create(cwd, name)
    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setDraft('')
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
        aria-label={`branch ${result.branch}`}
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
        <span className={css.name}>{result.branch}</span>
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
                    <li
                      key={name}
                      className={name === result.branch ? `${css.row} ${css.rowCurrent}` : css.row}
                      title={name}
                    >
                      <span className={css.check} aria-hidden="true">
                        {name === result.branch ? '✓' : ''}
                      </span>
                      <span className={css.rowName}>{name}</span>
                    </li>
                  ))}
                </ul>
              )}
          <form className={css.form} onSubmit={(event) => { void onSubmit(event) }}>
            <input
              className={css.input}
              value={draft}
              placeholder="New branch name"
              aria-label="New branch name"
              disabled={busy}
              onChange={(event) => { setDraft(event.target.value) }}
            />
            <button
              type="submit"
              className={css.create}
              disabled={busy || draft.trim() === ''}
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </form>
          {error !== null && <div className={css.error} role="alert">{error}</div>}
        </div>
      )}
    </div>
  )
}
