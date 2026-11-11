import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Logo({ size = 36 }: { size?: number }) {
  return <img src="/icon.svg" width={size} height={size} alt="" className="rounded-xl shadow-sm" />
}

export function Brand({ app, right, dark }: { app?: string; right?: ReactNode; dark?: boolean }) {
  return (
    <header className={`flex items-center justify-between gap-3 px-4 py-3 ${dark ? 'bg-leaf-800 text-white' : 'bg-white/80 backdrop-blur border-b border-soil-200'} sticky top-0 z-30`}>
      <Link to="/" className="flex items-center gap-2.5">
        <Logo size={34} />
        <div className="leading-tight">
          <div className="font-extrabold tracking-tight text-[17px]">Awaaz<span className={dark ? 'text-wheat' : 'text-leaf-600'}>Saathi</span></div>
          {app && <div className={`text-[11px] font-semibold uppercase tracking-wider ${dark ? 'text-leaf-200' : 'text-soil-500'}`}>{app}</div>}
        </div>
      </Link>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />
}

export function LiveDot({ on }: { on: boolean }) {
  return (
    <span className={`chip ${on ? 'bg-leaf-100 text-leaf-800' : 'bg-red-100 text-red-700'}`} title={on ? 'Real-time connected' : 'Reconnecting'}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-leaf-500 animate-pulse' : 'bg-red-500'}`} /> {on ? 'Live' : 'Offline'}
    </span>
  )
}

export function MockTag({ children = 'MOCK' }: { children?: ReactNode }) {
  return <span className="chip bg-soil-100 text-soil-700 border border-dashed border-soil-500/50 text-[10px] uppercase tracking-wide">{children}</span>
}

const LEVEL: Record<string, string> = {
  junior: 'bg-sky-100 text-sky-800', verified: 'bg-leaf-100 text-leaf-800', senior: 'bg-wheat/30 text-soil-900',
}
export function LevelBadge({ level }: { level: string }) {
  return <span className={`chip ${LEVEL[level] || 'bg-gray-100'} capitalize`}>{level === 'senior' ? '★ ' : ''}{level}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-center text-soil-500 py-10 text-sm">{children}</div>
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>
}

export function ScoreBar({ value, min, label }: { value: number; min?: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const ok = min === undefined || value >= min
  return (
    <div>
      <div className="flex justify-between text-xs text-soil-700 mb-1"><span>{label}</span><span className="font-mono">{value.toFixed(2)}{min !== undefined && ` / min ${min.toFixed(2)}`}</span></div>
      <div className="relative h-2 rounded-full bg-soil-100 overflow-hidden">
        <div className={`h-full rounded-full ${ok ? 'bg-leaf-500' : 'bg-alert'}`} style={{ width: `${pct}%` }} />
        {min !== undefined && <div className="absolute top-0 h-full w-0.5 bg-soil-900/60" style={{ left: `${min * 100}%` }} />}
      </div>
    </div>
  )
}

const REASON: Record<string, string> = {
  low_retrieval: 'Knowledge base does not cover this', not_grounded: 'AI answer not supported by sources',
  dose_question: 'Asks for pesticide/fertilizer dose', banned_chemical: 'Banned / restricted chemical',
  suspected_outbreak: 'Suspected outbreak', senior_only_topic: 'Senior-only topic',
}
export function ReasonChips({ reasons }: { reasons: string[] }) {
  if (!reasons?.length) return <span className="chip bg-leaf-100 text-leaf-800">✓ Passed all checks</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((r) => {
        const [k, ...rest] = r.split(':')
        return <span key={r} className="chip bg-orange-100 text-orange-800" title={rest.join(':')}>⚑ {REASON[k] || k}<span className="font-normal opacity-70">{rest.join(':')}</span></span>
      })}
    </div>
  )
}
