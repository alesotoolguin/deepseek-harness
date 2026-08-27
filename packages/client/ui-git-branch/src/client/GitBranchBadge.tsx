import { useEffect, useState, type ReactElement } from 'react'
import type { GitBranchResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GitBranchBadge.module.css'

/** Registration-side Remote face used by the badge. */
export interface GitBranchBadgeInjected {
  /** Resolve the branch of the git repository enclosing `root`; null outside any repository. */
  resolve: (root: string) => Promise<GitBranchResult | null>
}

/** Full component props assembled by the session-header utilities slot renderer. */
export type GitBranchBadgeProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<GitBranchBadgeInjected>

/** Small read-only badge: the checked-out branch of the session workspace's repository. */
export function GitBranchBadge(props: GitBranchBadgeProps): ReactElement | null {
  const sessionId = props.useSession(s => s.sessionId)
  const cwd = props.useSessions(s => s.byId[sessionId]?.cwd)
  const [result, setResult] = useState<GitBranchResult | null>(null)
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
  return (
    <span className={css.badge} title={result.repo ?? cwd ?? ''} aria-label={`branch ${result.branch}`}>
      <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2v8a3 3 0 0 0 3 3h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="4" cy="2" r="1.6" fill="currentColor" />
        <circle cx="4" cy="13" r="1.6" fill="currentColor" />
        <circle cx="12" cy="13" r="1.6" fill="currentColor" />
      </svg>
      <span className={css.name}>{result.branch}</span>
    </span>
  )
}
