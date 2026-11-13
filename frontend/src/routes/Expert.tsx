import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffWords } from 'diff'
import { ListChecks, CheckCircle2, UserRound, Clock, Video, Mic, Square, Send, Check, PenLine, X, BookPlus, BookCheck, ShieldCheck, ShieldAlert, Upload, LogOut, MapPin, Wheat, Image as ImageIcon, Wallet, TrendingUp, ChevronRight, Bell, House, BookOpen, Search, BadgeCheck, Hourglass } from 'lucide-react'
import { api, post, timeAgo, CROP_EN } from '../lib/api'
import { beep, useRecorder } from '../lib/audio'
import { usePollWhenOffline, useWS } from '../lib/ws'
import { useVideoCall } from '../lib/rtc'
import { AppBar, AppShell, Empty, ErrorNote, LevelBadge, LiveDot, Meter, Mock, Reasons, Segmented, Sheet, Spinner, Stat, VideoCallView } from '../components/ui'
import { sourceLabel } from '../components/Decision'

const PRIO: Record<number, [string, string]> = { 3: ['Outbreak', 'bg-danger-50 text-danger border-danger/20'], 2: ['High priority', 'bg-warn-50 text-warn border-warn/20'], 1: ['Routine', 'bg-field-50 text-muted border-line'], 0: ['Routine', 'bg-field-50 text-muted border-line'] }

export default function Expert() {
  const [experts, setExperts] = useState<any[]>([])
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('expert') || 'null') } catch { return null } })
  const [profile, setProfile] = useState<any>(null)
  const [open, setOpen] = useState<any[]>([])
  const [answered, setAnswered] = useState<any[]>([])
  const [tab, setTab] = useState('home')
  const [show, setShow] = useState<'open' | 'answered'>('open')
  const [crop, setCrop] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fu, setFu] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/api/expert/list').then(setExperts) }, [])
  const loadProfile = useCallback(() => { if (me) api(`/api/expert/${me.id}/profile`).then(setProfile).catch(() => {}) }, [me])
  const loadQueue = useCallback(() => {
    if (!me) return
    setLoading(true)
    Promise.all([api(`/api/expert/queue?expert_id=${me.id}&crop=${crop}&show=open`), api(`/api/expert/queue?expert_id=${me.id}&show=answered`)])
      .then(([o, a]) => { setOpen(o); setAnswered(a) }).finally(() => setLoading(false))
  }, [me, crop])
  useEffect(loadProfile, [loadProfile]); useEffect(loadQueue, [loadQueue])

  const myTopic = me ? `rtc:expert:${me.id}` : ''
  const ws = useWS(me ? ['expert', 'reset', myTopic] : [], (m) => {
    if (m.event.startsWith('rtc_')) { video.onSignal(m.event, m.data); return }
    loadQueue(); loadProfile()
    if (m.event === 'new_query') flash(`New question #${m.data.id} in the queue`)
    if (m.event === 'farmer_followup') { setFu(m.data); beep(880, 220, 3); try { navigator.vibrate?.([300, 120, 300]) } catch { /* ignore */ } }
    if (m.event === 'score' && m.data.promoted_to) flash(`An expert was promoted to ${m.data.promoted_to}`)
    if (m.event === 'reset') { setSel(null); api('/api/expert/list').then(setExperts) }
  })
  const video = useVideoCall(ws.send, myTopic)
  usePollWhenOffline(ws.connected || !me, () => { loadQueue(); loadProfile() })
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3200) }
  const login = (e: any) => { setMe(e); localStorage.setItem('expert', JSON.stringify(e)); setSel(null); setTab('home') }
  const logout = () => { setMe(null); localStorage.removeItem('expert'); setProfile(null) }

  const all = useMemo(() => [...open, ...answered], [open, answered])
  const selected = all.find((q) => q.id === sel) || null

  if (!me) return <Login experts={experts} onPick={login} />

  const overlay = <>
    {toast && <div className="absolute inset-x-3 top-3 z-50 drop-in rounded-xl bg-ink text-white px-4 py-3 shadow-lg text-sm flex items-center gap-2"><Bell size={16} className="text-mustard" />{toast}</div>}
    {fu && <div role="alert" className="absolute inset-x-3 top-3 z-50 drop-in rounded-2xl bg-white border-2 border-danger shadow-2xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-danger font-bold"><Bell size={18} /> Farmer says the problem is still there<button onClick={() => setFu(null)} aria-label="Dismiss" className="ml-auto text-muted"><X size={18} /></button></div>
      <div className="urdu text-[20px] font-bold !leading-[1.8]">مسئلہ ابھی باقی ہے</div>
      <div className="text-xs text-muted">Question #{fu.id}, {CROP_EN[fu.crop] || fu.crop}, {fu.tehsil}. The 3-day follow-up call found the earlier answer did not work.</div>
      <div className="urdu text-[15px] text-ink/80 line-clamp-2 !leading-[1.9]">{fu.transcript}</div>
      <button onClick={() => { setSel(fu.id); setTab('queue'); setShow('open'); setFu(null) }} className="btn btn-danger w-full">Open question</button>
    </div>}
    <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'Farmer'} error={video.error} onDecline={video.decline} onHangup={video.hangup} />
  </>

  if (selected) return (
    <AppShell overlay={overlay} header={<AppBar logo="/icon-expert.svg" back={() => setSel(null)} title={`Question #${selected.id}`} subtitle={`${CROP_EN[selected.crop] || selected.crop}, ${selected.tehsil}`} right={<SLA due={selected.sla_due_at} status={selected.status} />} />}>
      <Detail q={selected} me={profile || me} onCall={() => video.call(`farmer:${selected.farmer_id}`, { name: `${me.name} (AwaazSaathi agronomist)` })} onDone={(m) => { flash(m); loadQueue(); loadProfile() }} />
    </AppShell>
  )

  const level = profile?.level || me.level
  const mine = open.filter((q) => (level === 'senior' ? q.can_review || q.can_draft : q.can_draft))
  const titles: Record<string, string> = { home: `Salaam, ${me.name.replace('Dr. ', '').split(' ')[0]}`, queue: 'Farmer questions', kb: 'Knowledge base', profile: 'My profile' }
  return (
    <AppShell overlay={overlay} active={tab} onTab={setTab}
      tabs={[{ key: 'home', label: 'Home', icon: House }, { key: 'queue', label: 'Questions', icon: ListChecks, badge: mine.length }, { key: 'kb', label: 'Knowledge', icon: BookOpen }, { key: 'profile', label: 'Profile', icon: UserRound }]}
      header={<AppBar logo="/icon-expert.svg" title={titles[tab]} subtitle={<span className="flex items-center gap-1.5">{me.name} <LevelBadge level={level} /></span>} right={<LiveDot on={ws.connected} />} />}>
      {tab === 'home' && <Home me={profile || me} open={open} mine={mine} answered={answered} onOpen={setSel} onSeeAll={() => { setTab('queue'); setShow('open') }} />}
      {tab === 'queue' && <>
        <div className="px-4 pt-3 space-y-2.5">
          <Segmented value={show} onChange={setShow} options={[['open', `Waiting (${open.length})`], ['answered', `Answered (${answered.length})`]]} />
          {show === 'open' && <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {[['', 'All crops'], ...Object.entries(CROP_EN)].map(([k, v]) => <button key={k} onClick={() => setCrop(k)} aria-pressed={crop === k} className={`tag py-1.5 px-3 shrink-0 ${crop === k ? 'bg-field-800 text-white' : 'bg-white border border-line'}`}>{v}</button>)}
          </div>}
        </div>
        {show === 'open' ? <QueueList items={open} loading={loading} onOpen={setSel} empty="No questions are waiting" />
          : <QueueList items={answered} loading={loading} onOpen={setSel} empty="No answers yet" />}
      </>}
      {tab === 'kb' && <Knowledge me={profile || me} />}
      {tab === 'profile' && <Profile p={profile} onChange={loadProfile} onLogout={logout} />}
    </AppShell>
  )
}

function Home({ me, open, mine, answered, onOpen, onSeeAll }: { me: any; open: any[]; mine: any[]; answered: any[]; onOpen: (id: number) => void; onSeeAll: () => void }) {
  const dueSoon = open.filter((q) => q.sla_due_at && new Date(q.sla_due_at).getTime() - Date.now() < 3600e3).length
  const next = mine[0]
  const senior = me.level === 'senior'
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-field-900 text-white p-4">
        <div className="text-sm text-field-200">{senior ? 'Waiting for your review or answer' : me.level === 'junior' ? 'Waiting for your draft' : 'Waiting for your answer'}</div>
        <div className="flex items-end gap-2 mt-1"><span className="text-[44px] leading-none font-extrabold" data-testid="mine-count">{mine.length}</span><span className="pb-1 text-field-200">{mine.length === 1 ? 'question' : 'questions'}</span></div>
        {next ? <button onClick={() => onOpen(next.id)} className="mt-3 w-full rounded-xl bg-white text-ink text-left p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted"><span className={`tag border ${PRIO[next.priority][1]}`}>{PRIO[next.priority][0]}</span>{next.status === 'drafted' && <span className="tag bg-sky-50 text-sky-800">Draft to review</span>}<span className="ml-auto"><SLA due={next.sla_due_at} status={next.status} /></span></div>
          <div className="urdu text-[16px] line-clamp-2 !leading-[2] mt-1">{next.transcript}</div>
          <div className="flex items-center text-sm font-semibold text-field-800 mt-1">Open next question<ChevronRight size={16} className="ml-auto" /></div>
        </button> : <div className="mt-3 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-field-100">Nothing needs you right now. New questions appear the moment the AI hands one over.</div>}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={open.length} label="In the whole queue" />
        <Stat value={dueSoon} label="Due within an hour" tone={dueSoon ? 'warn' : 'plain'} />
        <Stat value={senior ? me.reviews_done : `${Math.round((me.score || 0) * 100)}%`} label={senior ? 'Reviews done' : 'Quality score'} tone="good" />
      </div>
      {!senior && me.progress?.next && <div className="surface p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp size={16} className="text-field-700" />On the way to <span className="capitalize">{me.progress.next}</span></div>
        <div className="mt-2"><Meter label={`Answers reviewed: ${me.progress.reviewed} of ${me.progress.need_reviewed}`} value={me.progress.reviewed / me.progress.need_reviewed} /></div>
      </div>}
      <div>
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold">Recently answered</h2><button onClick={onSeeAll} className="text-sm font-semibold text-field-700">All questions</button></div>
        {answered.length === 0 ? <div className="surface p-4 text-sm text-muted">Approved answers show up here, with the callback the farmer received.</div>
          : <ul className="surface divide-y divide-line">{answered.slice(0, 3).map((q) => (
            <li key={q.id}><button onClick={() => onOpen(q.id)} className="w-full text-left px-4 py-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-field-100 text-field-800 grid place-items-center shrink-0">{q.promoted_kb_id ? <BookCheck size={17} /> : <CheckCircle2 size={17} />}</span>
              <span className="flex-1 min-w-0"><span className="block urdu text-[15px] truncate !leading-[1.9]">{q.transcript}</span><span className="block text-xs text-muted">{q.answered_by}, {timeAgo(q.created_at)}</span></span>
              <ChevronRight size={16} className="text-muted" />
            </button></li>))}</ul>}
      </div>
    </div>
  )
}

function Knowledge({ me }: { me: any }) {
  const [items, setItems] = useState<any[] | null>(null)
  const [q, setQ] = useState('')
  const [crop, setCrop] = useState('')
  const [open, setOpen] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { api(`/api/expert/kb?crop=${crop}&q=${encodeURIComponent(q)}`).then(setItems).catch(() => setItems([])) }, [q, crop])
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])
  const signOff = async () => { setBusy(true); try { await post(`/api/expert/kb/${open.id}/sign-off`, { reviewer_id: me.id }); setOpen({ ...open, needs_expert_review: false, reviewed_by: me.name }); load() } finally { setBusy(false) } }
  const status = (k: any) => k.source === 'promoted' ? <span className="tag bg-field-100 text-field-800"><BookCheck size={12} /> From an expert answer</span>
    : k.needs_expert_review ? <span className="tag bg-warn-50 text-warn border border-warn/20"><Hourglass size={12} /> Awaiting sign-off</span>
      : <span className="tag bg-field-100 text-field-800"><BadgeCheck size={12} /> Signed off</span>
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted">The only text the AI is allowed to speak. Seniors sign entries off and add new ones from approved answers.</p>
      <label className="relative block"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symptoms, in Urdu or Roman" aria-label="Search the knowledge base" className="field !pl-10" /></label>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[['', 'All crops'], ...Object.entries(CROP_EN)].map(([k, v]) => <button key={k} onClick={() => setCrop(k)} aria-pressed={crop === k} className={`tag py-1.5 px-3 shrink-0 ${crop === k ? 'bg-field-800 text-white' : 'bg-white border border-line'}`}>{v}</button>)}
      </div>
      {!items ? <div className="py-10 grid place-items-center text-muted"><Spinner size={22} /></div>
        : items.length === 0 ? <Empty icon={BookOpen} title="Nothing matches">Try a symptom word, such as the colour of the leaves or the name farmers use.</Empty>
          : <ul className="space-y-2.5" data-testid="kb-list">{items.map((k) => (
            <li key={k.id}><button onClick={() => setOpen(k)} className="surface w-full text-left p-3.5 hover:border-field-200">
              <div className="flex items-center gap-1.5 flex-wrap">{status(k)}{k.senior_only && <span className="tag bg-ink/5 text-ink">Senior only</span>}<span className="ml-auto text-xs text-muted">{CROP_EN[k.crop] || k.crop}</span></div>
              <div className="font-semibold mt-1.5">{k.title_en}</div>
              <div className="urdu text-[15px] text-muted !leading-[1.9] truncate">{k.title_ur}</div>
            </button></li>))}</ul>}
      {open && <Sheet title={open.title_en} onClose={() => setOpen(null)}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">{status(open)}<span className="tag bg-field-50 border border-line text-muted">Entry #{open.id}, {CROP_EN[open.crop] || open.crop}</span></div>
          <div className="text-sm text-muted">{sourceLabel(open)}</div>
          <div><div className="text-xs font-semibold text-muted mb-1">What farmers describe</div><div className="urdu text-[15px]">{open.symptoms_ur}</div></div>
          <div><div className="text-xs font-semibold text-muted mb-1">What the AI says, word for word</div><div className="urdu text-[16px] rounded-xl bg-field-50 border border-line px-3 py-1">{open.answer_ur}</div></div>
          {open.needs_expert_review && (me.level === 'senior'
            ? <button disabled={busy} onClick={signOff} className="btn btn-primary w-full">{busy ? <Spinner /> : <BadgeCheck size={18} />} Sign off this entry</button>
            : <div className="text-sm rounded-xl bg-field-50 border border-line px-3 py-2">A senior agronomist signs entries off. If something here looks wrong, tell a senior.</div>)}
        </div>
      </Sheet>}
    </div>
  )
}

function QueueList({ items, loading, onOpen, empty }: { items: any[]; loading: boolean; onOpen: (id: number) => void; empty: string }) {
  if (loading && !items.length) return <div className="py-16 grid place-items-center text-muted"><Spinner size={22} /></div>
  if (!items.length) return <Empty icon={CheckCircle2} title={empty}>New questions appear here the moment the AI escalates them.</Empty>
  return (
    <ul className="p-4 space-y-2.5">
      {items.map((q) => (
        <li key={q.id}>
          <button onClick={() => onOpen(q.id)} className="surface w-full text-left p-3.5 hover:border-field-200 transition">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`tag border ${PRIO[q.priority][1]}`}>{PRIO[q.priority][0]}</span>
              {q.reasons?.includes('followup_still_a_problem') && <span className="tag bg-danger-50 text-danger border border-danger/20">3-day follow-up: still a problem</span>}
              {q.route === 'senior_only' && <span className="tag bg-ink/5 text-ink">Senior only</span>}
              {q.status === 'drafted' && <span className="tag bg-sky-50 text-sky-800">Draft to review</span>}
              {q.promoted_kb_id && <span className="tag bg-field-100 text-field-800"><BookCheck size={12} /> In knowledge base</span>}
              <span className="ml-auto"><SLA due={q.sla_due_at} status={q.status} /></span>
            </div>
            <div className="urdu text-[17px] mt-1.5 line-clamp-2 !leading-[2]">{q.transcript}</div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1"><Wheat size={13} />{CROP_EN[q.crop] || q.crop || 'Unknown'}</span>
              <span className="flex items-center gap-1"><MapPin size={13} />{q.tehsil}</span>
              {q.photo_url && <span className="flex items-center gap-1"><ImageIcon size={13} />Photo</span>}
              <span className="ml-auto">{timeAgo(q.created_at)}</span><ChevronRight size={15} />
            </div>
          </button>
        </li>))}
    </ul>
  )
}

function Login({ experts, onPick }: { experts: any[]; onPick: (e: any) => void }) {
  return (
    <AppShell header={<AppBar logo="/icon-expert.svg" title="AwaazSaathi Experts" subtitle="Sign in as an agronomist" />}>
      <div className="p-4">
        <p className="text-sm text-muted mb-4">Juniors draft answers, verified experts answer routine topics, seniors review and approve. Demo accounts:</p>
        <ul className="space-y-2.5">{experts.map((e) => (
          <li key={e.id}><button onClick={() => onPick(e)} className="surface w-full p-3.5 text-left flex items-center gap-3 hover:border-field-200">
            <Avatar name={e.name} />
            <div className="flex-1 min-w-0"><div className="font-semibold flex items-center gap-2">{e.name} <LevelBadge level={e.level} /></div><div className="text-xs text-muted truncate">{e.degree}</div></div>
            {e.verification_status === 'verified' ? <ShieldCheck size={18} className="text-field-700" /> : <ShieldAlert size={18} className="text-warn" />}
          </button></li>))}
        </ul>
      </div>
    </AppShell>
  )
}

const Avatar = ({ name, size = 40 }: { name: string; size?: number }) => (
  <span style={{ width: size, height: size }} className="rounded-full bg-field-800 text-white grid place-items-center font-bold text-sm shrink-0">{name.replace('Dr. ', '').split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>)

function Profile({ p, onChange, onLogout }: { p: any; onChange: () => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false)
  if (!p) return <div className="py-16 grid place-items-center"><Spinner size={22} /></div>
  const upload = async (f: File) => { setBusy(true); const fd = new FormData(); fd.append('file', f); await api(`/api/expert/${p.id}/degree`, { method: 'POST', body: fd }).finally(() => setBusy(false)); onChange() }
  const pts = p.history?.map((h: any) => h.score) || []
  return (
    <div className="p-4 space-y-3">
      <div className="surface p-4 flex items-center gap-3"><Avatar name={p.name} size={52} /><div className="flex-1"><div className="font-bold text-lg leading-tight">{p.name}</div><div className="text-xs text-muted">{p.degree}</div><div className="mt-1"><LevelBadge level={p.level} /></div></div></div>
      <div className="surface p-4">
        <div className="flex items-center justify-between"><span className="font-semibold">Degree verification</span>
          {p.verification_status === 'verified' ? <span className="tag bg-field-100 text-field-800"><ShieldCheck size={13} /> Verified</span> : <span className="tag bg-warn-50 text-warn"><ShieldAlert size={13} /> {p.verification_status}</span>}</div>
        {p.verification_status !== 'verified' && <label className="btn btn-quiet w-full mt-3">{busy ? <Spinner /> : <Upload size={17} />} Upload degree<input type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>}
        <div className="text-xs text-muted mt-2 flex items-center gap-2"><Mock>Review simulated</Mock> An admin approves uploaded degrees.</div>
      </div>
      {p.level !== 'senior' ? (
        <div className="surface p-4">
          <div className="flex items-center gap-2 font-semibold"><TrendingUp size={17} className="text-field-700" />Quality score</div>
          <div className="text-4xl font-extrabold text-field-800 mt-1">{Math.round(p.score * 100)}%</div>
          <div className="text-sm text-muted">{p.clean_count} of {p.reviewed_count} answers approved without major edits, {p.rejected_count} rejected.</div>
          {pts.length > 1 && <Spark pts={pts} />}
          {p.progress?.next && <div className="mt-3 space-y-2.5 border-t border-line pt-3">
            <div className="text-sm font-semibold">Next level: <span className="capitalize">{p.progress.next}</span></div>
            <Meter label={`Answers reviewed: ${p.progress.reviewed} of ${p.progress.need_reviewed}`} value={p.progress.reviewed / p.progress.need_reviewed} />
            <Meter label="Approval score" value={p.score} min={p.progress.need_score} />
          </div>}
        </div>
      ) : <div className="surface p-4"><div className="font-semibold">Senior reviewer</div><div className="text-4xl font-extrabold text-field-800 mt-1">{p.reviews_done}</div><div className="text-sm text-muted">Reviews completed. Seniors have final authority and add approved answers to the knowledge base.</div></div>}
      <div className="surface p-4">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><Wallet size={17} className="text-field-700" />Payout balance</span><Mock>No real payments</Mock></div>
        <div className="text-3xl font-extrabold mt-1">Rs {p.earnings_pkr.toLocaleString()}</div>
        <div className="text-sm text-muted">{p.sponsor ? `Funded by ${p.sponsor}` : 'Unpaid until a sponsor joins'}{p.level === 'senior' ? ', paid per review' : ''}</div>
      </div>
      <button onClick={onLogout} className="btn btn-quiet w-full"><LogOut size={17} /> Switch account</button>
    </div>
  )
}

function Spark({ pts }: { pts: number[] }) {
  const w = 300, h = 56, min = Math.min(...pts, 0.5)
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - 4 - ((v - min) / (1 - min)) * (h - 8)}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 mt-2" aria-label="Score history"><polyline points={d} fill="none" stroke="var(--color-field-600)" strokeWidth="2.5" strokeLinejoin="round" /></svg>
}

function SLA({ due, status }: { due: string | null; status: string }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  if (!due || !['queued', 'drafted'].includes(status)) return null
  const ms = new Date(due).getTime() - Date.now(), a = Math.abs(ms) / 1000
  const txt = `${Math.floor(a / 3600)}h ${String(Math.floor((a % 3600) / 60)).padStart(2, '0')}m`
  return <span className={`tag ${ms < 0 ? 'bg-danger text-white' : ms < 3600e3 ? 'bg-warn-50 text-warn' : 'bg-white/90 text-field-800 border border-line'}`}><Clock size={12} />{ms < 0 ? `${txt} late` : txt}</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="surface p-4"><div className="text-xs font-semibold text-muted mb-2">{title}</div>{children}</section>
}

function Detail({ q, me, onDone, onCall }: { q: any; me: any; onDone: (m: string) => void; onCall: () => void }) {
  const [full, setFull] = useState<any>(q)
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [voice, setVoice] = useState<string | null>(null)
  const rec = useRecorder()
  useEffect(() => { api(`/api/expert/query/${q.id}`).then((d) => { setFull(d); const last = d.drafts?.[d.drafts.length - 1]; if (q.status === 'drafted' && last) setText((t) => t || last.text) }); setText(''); setErr(null); setReason(''); setVoice(null) }, [q.id, q.status])
  const draft = full.drafts?.[full.drafts.length - 1]
  const isSenior = me.level === 'senior'
  const reviewing = isSenior && q.status === 'drafted' && draft
  const changed = reviewing && text.trim() !== draft.text.trim()
  const act = async (fn: () => Promise<any>, msg: (r: any) => string) => { setBusy(true); setErr(null); try { onDone(msg(await fn())) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  const recToggle = async () => {
    if (!rec.recording) return rec.start()
    const b = await rec.stop(); if (!b) return
    const fd = new FormData(); fd.append('audio', b, 'reply.webm'); setVoice((await api('/api/expert/upload-audio', { method: 'POST', body: fd })).audio_url)
  }

  return (
    <div className="p-4 space-y-3 pb-8">
      <section className="surface p-4">
        <div className="flex flex-wrap gap-1.5 mb-1"><span className={`tag border ${PRIO[q.priority][1]}`}>{PRIO[q.priority][0]}</span>{q.route === 'senior_only' && <span className="tag bg-ink/5 text-ink">Senior only</span>}<span className="tag bg-field-50 text-muted">{timeAgo(q.created_at)}, by {q.channel}</span></div>
        <div className="urdu text-[21px] font-semibold">{q.transcript}</div>
        {q.normalized_query && q.normalized_query !== q.transcript && <div className="urdu text-[15px] text-muted">{q.normalized_query}</div>}
        {q.audio_url && <audio src={q.audio_url} controls className="w-full h-10 mt-2" />}
        {q.photo_url && <img src={q.photo_url} className="mt-2 w-full max-h-56 object-cover rounded-xl border border-line" alt="Leaf" />}
        <button onClick={onCall} className="btn btn-quiet w-full mt-3"><Video size={18} /> Video call the farmer’s smartphone</button>
      </section>
      {q.understanding?.weather?.temp_c !== undefined && <div className="surface px-4 py-3 text-sm text-muted">Weather in {q.tehsil} now: {Math.round(q.understanding.weather.temp_c)}°C, humidity {q.understanding.weather.humidity}%, rain chance {q.understanding.weather.rain_chance ?? 0}%</div>}
      {q.reasons?.includes('followup_still_a_problem') && <section className="rounded-2xl border-2 border-danger/40 bg-danger-50 p-4 space-y-2">
        <div className="font-bold text-danger flex items-center gap-2"><Bell size={16} /> Farmer follow-up: “مسئلہ ابھی باقی ہے”</div>
        <div className="text-sm text-ink/80">In the 3-day follow-up call the farmer said the problem is still there. Give a new answer; the farmer gets a call back.</div>
        {q.understanding?.previous_answer && <div className="rounded-xl bg-white border border-line p-3"><div className="text-xs text-muted mb-1">Previous answer (did not solve it)</div><div className="urdu text-[15px]">{q.understanding.previous_answer}</div></div>}
      </section>}
      <Section title="Why the AI did not answer"><Reasons reasons={q.reasons} /><div className="mt-3"><Meter label="Match with the closest knowledge entry" value={q.retrieval_score} min={0.3} /></div>
        {q.understanding?.evidence?.title_en && <div className="text-xs text-muted mt-2">Closest entry: {q.understanding.evidence.title_en}{q.understanding.evidence.terms?.length ? `. Matching words: ${q.understanding.evidence.terms.length}` : ''}</div>}</Section>
      <Section title="What the AI would have said (not sent)">{q.ai_answer ? <div className="urdu text-[16px]">{q.ai_answer}</div> : <div className="text-sm text-muted">Nothing in the knowledge base was close enough.</div>}
        {!!q.retrieved?.length && <ul className="mt-2 divide-y divide-line border-t border-line">{q.retrieved.map((r: any) => <li key={r.kb_id} className="flex justify-between items-center gap-3 py-1.5 text-sm"><span>{r.title_en || <span className="urdu text-[14px] !leading-[1.9]">{r.title_ur}</span>}</span><span className="text-xs text-muted">{r.score.toFixed(2)}</span></li>)}</ul>}
      </Section>
      {full.reviews?.filter((r: any) => r.action === 'reject').map((r: any) => <div key={r.id} className="rounded-xl bg-danger-50 border border-danger/20 p-3 text-sm text-danger">Rejected by {r.reviewer}: {r.reason}</div>)}

      {q.status === 'approved' ? (
        <Section title={`Approved by ${q.answered_by}, sent as a voice callback`}>
          <div className="urdu text-[17px]">{q.final_answer}</div>
          {q.final_audio_url && <audio src={q.final_audio_url} controls className="w-full h-10 mt-2" />}
          {q.promoted_kb_id ? <div className="tag bg-field-100 text-field-800 mt-3"><BookCheck size={13} /> Added to knowledge base. The AI answers this now.</div>
            : isSenior ? <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/promote`, { reviewer_id: me.id }), () => 'Added to the knowledge base')} className="btn btn-accent w-full mt-3">{busy ? <Spinner /> : <BookPlus size={18} />} Add to knowledge base</button>
              : <div className="text-xs text-muted mt-2">Only seniors can add answers to the knowledge base.</div>}
        </Section>
      ) : reviewing ? (
        <section className="surface p-4 space-y-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><div className="text-xs font-semibold text-sky-800 mb-1">Draft by {draft.expert}</div><div className="urdu text-[17px]">{draft.text}</div>{draft.audio_url && <audio src={draft.audio_url} controls className="w-full h-9 mt-1" />}</div>
          <label className="block text-sm font-semibold">Final answer</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="rtl" className="field urdu text-[17px] !leading-[2.1]" />
          {changed && <div className="rounded-xl border border-line p-3"><div className="text-xs text-muted mb-1">Your changes</div><Diff a={draft.text} b={text} /></div>}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed to reject)" className="field text-sm" />
          <ErrorNote error={err} />
          {!changed ? <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'approve' }), (r) => `Approved. Calling the farmer back.${r.promoted_to ? ` ${draft.expert} is now ${r.promoted_to}.` : ''}`)} className="btn btn-primary w-full">{busy ? <Spinner /> : <Check size={18} />} Approve and call farmer</button>
            : <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'edit_approve', final_text: text }), (r) => `Edited and approved (${r.outcome === 'clean' ? 'minor edit' : 'major edit'}). Calling the farmer back.`)} className="btn btn-primary w-full">{busy ? <Spinner /> : <PenLine size={18} />} Approve with edits</button>}
          <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'reject', reason }), () => 'Rejected and returned to the queue')} className="btn btn-quiet w-full text-danger"><X size={18} /> Reject draft</button>
        </section>
      ) : q.status === 'drafted' ? (
        <Section title={`Draft by ${draft?.expert}, waiting for a senior`}><div className="urdu text-[17px]">{draft?.text}</div></Section>
      ) : q.can_draft && me.verification_status === 'verified' ? (
        <section className="surface p-4 space-y-3">
          <label className="block text-sm font-semibold">{me.level === 'junior' ? 'Your draft (a senior reviews it)' : 'Your answer (sent to the farmer)'}</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="rtl" placeholder="جواب آسان اردو میں لکھیں" className="field urdu text-[17px] !leading-[2.1]" />
          <div className="flex items-center gap-2">
            <button onClick={recToggle} className={`btn ${rec.recording ? 'btn-danger' : 'btn-quiet'} shrink-0`}>{rec.recording ? <><Square size={15} fill="currentColor" /> Stop</> : <><Mic size={17} /> Voice reply</>}</button>
            {voice && <audio src={voice} controls className="h-9 flex-1 min-w-0" />}
          </div>
          {rec.error && <ErrorNote error={rec.error} />}
          <ErrorNote error={err} />
          <button disabled={busy || !text.trim()} onClick={() => act(() => post(`/api/expert/query/${q.id}/draft`, { expert_id: me.id, text, audio_url: voice }), (r) => r.status === 'approved' ? 'Answer sent. Calling the farmer back.' : r.spot_check ? 'Sent for a random senior spot check' : 'Draft sent for senior review')} className="btn btn-primary w-full">{busy ? <Spinner /> : <Send size={17} />} {me.level === 'junior' ? 'Send draft for review' : 'Send answer'}</button>
        </section>
      ) : (
        <div className="rounded-xl bg-field-50 border border-line p-3 text-sm">{me.verification_status !== 'verified' ? 'Your degree is not verified yet. You can answer once an admin approves it.' : 'Senior-only topic: dose, banned chemical or possible outbreak. A senior agronomist must answer.'}</div>
      )}
    </div>
  )
}

function Diff({ a, b }: { a: string; b: string }) {
  return <div className="urdu text-[16px]">{diffWords(a, b).map((p, i) => <span key={i} className={p.added ? 'bg-field-200 rounded px-0.5' : p.removed ? 'bg-danger-50 text-danger line-through rounded px-0.5' : ''}>{p.value}</span>)}</div>
}
