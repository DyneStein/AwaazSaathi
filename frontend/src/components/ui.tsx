import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Loader2, Mic, MicOff, PhoneOff, Video, AlertTriangle, CheckCircle2, Signal, Wifi, BatteryMedium, X, Volume2 } from 'lucide-react'
import { onAudioBlocked, onAudioSlow, unlockAudio } from '../lib/audio'
import type { LucideIcon } from 'lucide-react'
import type { CallState } from '../lib/rtc'

export function Logo({ size = 32, src = '/icon.svg' }: { size?: number; src?: string }) {
  return <img src={src} width={size} height={size} alt="AwaazSaathi" className="rounded-[10px]" />
}

export type Tab = { key: string; label: ReactNode; icon: LucideIcon; badge?: number }

/** The strip at the top of a simulated smartphone: clock, signal, battery. Hidden on a real phone, which has its own. */
export function StatusBar({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [t, setT] = useState(() => new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 20000); return () => clearInterval(i) }, [])
  return (
    <div aria-hidden className={`shrink-0 h-7 px-5 flex items-center justify-between text-[12px] font-semibold ${tone === 'dark' ? 'bg-field-900 text-white' : 'bg-white text-ink'}`} dir="ltr">
      <span>{t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="absolute left-1/2 -translate-x-1/2 top-1.5 h-4 w-4 rounded-full bg-ink" />
      <span className="flex items-center gap-1.5"><Signal size={13} strokeWidth={2.6} /><Wifi size={13} strokeWidth={2.6} /><BatteryMedium size={17} strokeWidth={2.2} /></span>
    </div>
  )
}

/** A smartphone body. `fill` makes it take the whole viewport on small screens (when the page is opened on a real phone). */
export function DeviceFrame({ children, dir, fill = true, statusTone, label, className = '' }: { children: ReactNode; dir?: 'rtl' | 'ltr'; fill?: boolean; statusTone?: 'light' | 'dark'; label?: string; className?: string }) {
  // Class names are written out in full on purpose: Tailwind only generates classes it can see as whole strings.
  const body = fill
    ? 'mx-auto lg:mx-0 w-full max-w-[440px] h-[100dvh] lg:max-w-none lg:w-[390px] lg:h-[min(760px,calc(100dvh-40px))] lg:rounded-[44px] lg:border-[11px] lg:border-ink lg:shadow-[0_24px_60px_-18px_rgba(16,40,28,.35)]'
    : 'max-w-full w-[390px] h-[min(760px,calc(100dvh-40px))] rounded-[44px] border-[11px] border-ink shadow-[0_24px_60px_-18px_rgba(16,40,28,.35)]'
  return (
    <div dir={dir} aria-label={label} className={`relative flex flex-col bg-canvas overflow-hidden shrink-0 ${body} ${className}`}>
      <div className={fill ? 'hidden lg:block' : ''}><StatusBar tone={statusTone} /></div>
      {children}
    </div>
  )
}

/** Phone-shaped app frame: full screen on phones, a centred device on laptops. `aside` shows next to it on wide screens. */
export function AppShell({ header, tabs, active, onTab, children, aside, overlay, dir, statusTone }: {
  header: ReactNode; tabs?: Tab[]; active?: string; onTab?: (k: string) => void; children: ReactNode; aside?: ReactNode; overlay?: ReactNode; dir?: 'rtl' | 'ltr'; statusTone?: 'light' | 'dark'
}) {
  return (
    <div className="min-h-[100dvh] lg:py-5 lg:flex lg:justify-center lg:items-start lg:gap-8">
      <DeviceFrame dir={dir} statusTone={statusTone}>
        {header}
        <main className="flex-1 overflow-y-auto no-scrollbar">{children}</main>
        {tabs && <TabBar tabs={tabs} active={active!} onTab={onTab!} />}
        {overlay}
      </DeviceFrame>
      {aside && <div className="hidden lg:block w-[460px] max-h-[min(760px,calc(100dvh-40px))] overflow-y-auto no-scrollbar">{aside}</div>}
    </div>
  )
}

export function AppBar({ title, subtitle, back, right, tone = 'light', logo }: { title: ReactNode; subtitle?: ReactNode; back?: () => void; right?: ReactNode; tone?: 'dark' | 'light'; logo?: string }) {
  const dark = tone === 'dark'
  return (
    <header className={`shrink-0 flex items-center gap-3 px-4 pt-3 pb-3 ${dark ? 'bg-field-900 text-white' : 'bg-white border-b border-line'}`}>
      {back ? <button onClick={back} aria-label="Back" className={`-ml-1 p-1.5 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-field-50'}`}><ChevronLeft size={22} /></button>
        : <Link to="/" aria-label="Home"><Logo size={34} src={logo} /></Link>}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[17px] leading-tight truncate">{title}</div>
        {subtitle && <div className={`text-[12.5px] truncate ${dark ? 'text-field-200' : 'text-muted'}`}>{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}

function TabBar({ tabs, active, onTab }: { tabs: Tab[]; active: string; onTab: (k: string) => void }) {
  return (
    <nav aria-label="Main" className="shrink-0 grid bg-white border-t border-line px-1 pt-1.5 pb-[max(.4rem,env(safe-area-inset-bottom))]" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((t) => {
        const on = t.key === active
        const Icon = t.icon
        return (
          <button key={t.key} onClick={() => onTab(t.key)} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-1 text-[11.5px] ${on ? 'text-field-900 font-bold' : 'text-muted font-medium'}`}>
            <span className={`relative grid place-items-center h-8 w-16 rounded-full transition-colors ${on ? 'bg-field-100' : ''}`}><Icon size={21} strokeWidth={on ? 2.4 : 1.9} />
              {!!t.badge && <span className="absolute -top-0.5 right-2 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center px-1">{t.badge}</span>}
            </span>
            {t.label}
          </button>)
      })}
    </nav>
  )
}

/** Two or three choices in one row, used for sub-views inside a tab. */
export function Segmented<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][]; className?: string }) {
  return (
    <div role="tablist" className={`flex rounded-xl bg-field-100/70 p-1 ${className}`}>
      {options.map(([k, label]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${value === k ? 'bg-white text-field-900 shadow-sm' : 'text-muted'}`}>{label}</button>)}
    </div>
  )
}

/** A panel that slides up from the bottom of the phone, over the current screen. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="sheet-in bg-white rounded-t-3xl max-h-[88%] flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-5 pt-4 pb-3 border-b border-line"><div className="flex-1 font-bold text-[17px]">{title}</div><button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-field-50"><X size={20} /></button></div>
        <div className="overflow-y-auto no-scrollbar p-5">{children}</div>
      </div>
    </div>
  )
}

export function Stat({ value, label, tone = 'plain' }: { value: ReactNode; label: string; tone?: 'plain' | 'warn' | 'danger' | 'good' }) {
  const c = { plain: 'text-ink', warn: 'text-warn', danger: 'text-danger', good: 'text-field-700' }[tone]
  return <div className="surface px-3 py-3"><div className={`text-[26px] leading-none font-extrabold ${c}`}>{value}</div><div className="text-[12px] text-muted mt-1.5 leading-tight">{label}</div></div>
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function LiveDot({ on }: { on: boolean }) {
  return <span title={on ? 'Live updates connected' : 'Reconnecting'} className={`inline-block h-2.5 w-2.5 rounded-full ${on ? 'bg-field-600' : 'bg-danger animate-pulse'}`} />
}

export function Mock({ children = 'Simulated' }: { children?: ReactNode }) {
  return <span className="tag bg-white text-muted border border-dashed border-muted/40">{children}</span>
}

const LEVEL: Record<string, string> = { junior: 'bg-sky-50 text-sky-800 border-sky-200', verified: 'bg-field-100 text-field-800 border-field-200', senior: 'bg-ink text-white border-ink' }
export function LevelBadge({ level }: { level: string }) {
  return <span className={`tag border capitalize ${LEVEL[level] || ''}`}>{level}</span>
}

export function Empty({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-14 text-muted">
      {Icon && <div className="h-14 w-14 rounded-2xl bg-white border border-line grid place-items-center mb-3"><Icon size={26} className="text-field-700" /></div>}
      <div className="font-semibold text-ink">{title}</div>
      {children && <div className="text-sm mt-1">{children}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="flex gap-2 items-start rounded-xl bg-danger-50 border border-danger/20 text-danger text-sm px-3 py-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>
}

export function Meter({ value, min, label }: { value: number; min?: number; label: string }) {
  const ok = min === undefined || value >= min
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1"><span>{label}</span><span className="font-semibold text-ink">{value.toFixed(2)}{min !== undefined && <span className="text-muted font-normal"> / needs {min.toFixed(2)}</span>}</span></div>
      <div className="relative h-2 rounded-full bg-line/70">
        <div className={`h-full rounded-full ${ok ? 'bg-field-600' : 'bg-warn'}`} style={{ width: `${Math.max(2, Math.min(1, value) * 100)}%` }} />
        {min !== undefined && <div className="absolute -top-0.5 h-3 w-0.5 bg-ink" style={{ left: `${min * 100}%` }} />}
      </div>
    </div>
  )
}

export const REASON: Record<string, string> = {
  low_retrieval: 'Not covered by knowledge base', not_grounded: 'Answer not supported by sources',
  dose_question: 'Asks for a dose', banned_chemical: 'Banned chemical named',
  suspected_outbreak: 'Possible outbreak', senior_only_topic: 'Senior-only topic', farmer_requested_expert: 'Farmer asked for an expert', health_emergency: 'Health emergency', crop_mismatch: 'Source is about another crop',
  ambiguous_match: 'Two problems match equally', thin_evidence: 'Too few symptoms to be sure', followup_still_a_problem: '3-day follow-up: still a problem',
}
export function Reasons({ reasons }: { reasons: string[] }) {
  if (!reasons?.length) return <span className="tag bg-field-100 text-field-800"><CheckCircle2 size={13} /> All safety checks passed</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((r) => { const [k, ...rest] = r.split(':'); const hot = k === 'health_emergency'; return <span key={r} title={rest.join(':')} className={`tag border ${hot ? 'bg-danger text-white border-danger' : 'bg-warn-50 text-warn border-warn/20'}`}><AlertTriangle size={12} />{REASON[k] || k}</span> })}
    </div>
  )
}

/** Full-screen live video call UI, used by the farmer and the expert apps. */
export function VideoCallView({ state, local, remote, peerName, error, onAccept, onDecline, onHangup }: {
  state: CallState; local: MediaStream | null; remote: MediaStream | null; peerName: string; error: string | null
  onAccept?: () => void; onDecline: () => void; onHangup: () => void
}) {
  const lv = useRef<HTMLVideoElement>(null)
  const rv = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (lv.current) lv.current.srcObject = local }, [local])
  useEffect(() => { if (rv.current) rv.current.srcObject = remote }, [remote])
  if (state === 'idle') return null
  return (
    <div className="absolute inset-0 z-40 bg-field-950 text-white flex flex-col" dir="ltr">
      <video ref={rv} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      {!remote && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className={`h-24 w-24 rounded-full bg-field-800 grid place-items-center ${state !== 'connected' ? 'ring-pulse' : ''}`}><Video size={38} /></div>
        <div className="text-center"><div className="text-xl font-bold">{peerName}</div>
          <div className="text-field-200 text-sm">{state === 'calling' ? 'Calling…' : state === 'ringing' ? 'Incoming video call' : state === 'ended' ? 'Call ended' : 'Connecting…'}</div></div>
      </div>}
      {remote && <div className="relative z-10 p-4 bg-gradient-to-b from-black/60 to-transparent"><div className="font-bold">{peerName}</div><div className="text-xs text-field-200">Video call, live</div></div>}
      <video ref={lv} autoPlay playsInline muted className={`absolute right-4 top-20 z-10 w-28 h-40 object-cover rounded-xl border-2 border-white/70 bg-black ${local ? '' : 'hidden'}`} />
      {error && <div className="absolute inset-x-4 top-4 z-20"><ErrorNote error={error} /></div>}
      <div className="mt-auto relative z-10 p-8 flex justify-center gap-12 bg-gradient-to-t from-black/60 to-transparent">
        {state === 'ringing' ? <>
          <button onClick={onDecline} aria-label="Decline" className="h-16 w-16 rounded-full bg-danger grid place-items-center"><PhoneOff /></button>
          <button onClick={onAccept} aria-label="Accept" className="h-16 w-16 rounded-full bg-field-600 grid place-items-center ring-pulse"><Video /></button>
        </> : state !== 'ended' && <>
          <MuteButton stream={local} />
          <button onClick={onHangup} aria-label="End call" className="h-16 w-16 rounded-full bg-danger grid place-items-center"><PhoneOff /></button>
        </>}
      </div>
    </div>
  )
}

function MuteButton({ stream }: { stream: MediaStream | null }) {
  const t = stream?.getAudioTracks()[0]
  return <button aria-label="Mute" onClick={(e) => { if (t) { t.enabled = !t.enabled; (e.currentTarget as HTMLButtonElement).dataset.m = String(!t.enabled) } }} className="h-16 w-16 rounded-full bg-white/15 grid place-items-center group">
    <Mic className="group-data-[m=true]:hidden" /><MicOff className="hidden group-data-[m=true]:block" />
  </button>
}

/** Appears only when a phone browser blocked sound: one tap plays the waiting clip (the call does not move on without it). */
export function SoundGate() {
  const [blocked, setBlocked] = useState(false)
  const [slow, setSlow] = useState(false)
  useEffect(() => onAudioBlocked(setBlocked), [])
  useEffect(() => onAudioSlow(setSlow), [])
  if (slow && !blocked) return (
    <div role="status" data-testid="voice-slow" className="fixed left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[70] rounded-full bg-ink/90 text-white text-[13.5px] px-4 py-2.5 flex items-center gap-2 shadow-lg">
      <Loader2 size={16} className="animate-spin" />Voice is loading, the connection is slow
    </div>)
  if (!blocked) return null
  return (
    <button onClick={unlockAudio} data-testid="sound-gate" className="fixed left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[70] btn btn-primary !rounded-full !px-6 !py-3.5 shadow-[0_12px_30px_-10px_rgba(8,46,32,.7)] ring-pulse">
      <Volume2 size={20} />Tap to hear the helpline
    </button>)
}
