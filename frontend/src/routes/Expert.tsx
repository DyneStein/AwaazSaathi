import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffWords } from 'diff'
import { ListChecks, CheckCircle2, UserRound, Clock, Video, Mic, Square, Send, Check, PenLine, X, BookPlus, BookCheck, ShieldCheck, ShieldAlert, Upload, LogOut, MapPin, Wheat, Image as ImageIcon, Wallet, TrendingUp, ChevronRight, Bell } from 'lucide-react'
import { api, post, timeAgo, CROP_EN } from '../lib/api'
import { useRecorder } from '../lib/audio'
import { useWS } from '../lib/ws'
import { useVideoCall } from '../lib/rtc'
import { AppBar, AppShell, Empty, ErrorNote, LevelBadge, LiveDot, Meter, Mock, Reasons, Spinner, VideoCallView } from '../components/ui'

const PRIO: Record<number, [string, string]> = { 3: ['Outbreak', 'bg-danger-50 text-danger border-danger/20'], 2: ['Dose / pesticide', 'bg-warn-50 text-warn border-warn/20'], 1: ['Routine', 'bg-field-50 text-muted border-line'], 0: ['Routine', 'bg-field-50 text-muted border-line'] }

export default function Expert() {
  const [experts, setExperts] = useState<any[]>([])
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('expert') || 'null') } catch { return null } })
  const [profile, setProfile] = useState<any>(null)
  const [open, setOpen] = useState<any[]>([])
  const [answered, setAnswered] = useState<any[]>([])
  const [tab, setTab] = useState('queue')
  const [crop, setCrop] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
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
    if (m.event === 'score' && m.data.promoted_to) flash(`An expert was promoted to ${m.data.promoted_to}`)
    if (m.event === 'reset') { setSel(null); api('/api/expert/list').then(setExperts) }
  })
  const video = useVideoCall(ws.send, myTopic)
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3200) }
  const login = (e: any) => { setMe(e); localStorage.setItem('expert', JSON.stringify(e)); setSel(null); setTab('queue') }
  const logout = () => { setMe(null); localStorage.removeItem('expert'); setProfile(null) }

  const all = useMemo(() => [...open, ...answered], [open, answered])
  const selected = all.find((q) => q.id === sel) || null

  if (!me) return <Login experts={experts} onPick={login} />

  const overlay = <>
    {toast && <div className="absolute inset-x-3 top-3 z-50 drop-in rounded-xl bg-ink text-white px-4 py-3 shadow-lg text-sm flex items-center gap-2"><Bell size={16} className="text-mustard" />{toast}</div>}
    <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'Farmer'} error={video.error} onDecline={video.decline} onHangup={video.hangup} />
  </>

  if (selected) return (
    <AppShell overlay={overlay} header={<AppBar logo="/icon-expert.svg" back={() => setSel(null)} title={`Question #${selected.id}`} subtitle={`${CROP_EN[selected.crop] || selected.crop}, ${selected.tehsil}`} right={<SLA due={selected.sla_due_at} status={selected.status} />} />}>
      <Detail q={selected} me={profile || me} onCall={() => video.call(`farmer:${selected.farmer_id}`, { name: `${me.name} (AwaazSaathi agronomist)` })} onDone={(m) => { flash(m); loadQueue(); loadProfile() }} />
    </AppShell>
  )

  return (
    <AppShell overlay={overlay} active={tab} onTab={setTab}
      tabs={[{ key: 'queue', label: 'Queue', icon: ListChecks, badge: open.length }, { key: 'answered', label: 'Answered', icon: CheckCircle2 }, { key: 'profile', label: 'Profile', icon: UserRound }]}
      header={<AppBar logo="/icon-expert.svg" title={tab === 'queue' ? 'Farmer questions' : tab === 'answered' ? 'Answered' : 'My profile'} subtitle={<span className="flex items-center gap-1.5">{me.name} <LevelBadge level={profile?.level || me.level} /></span>} right={<LiveDot on={ws.connected} />} />}>
      {tab === 'queue' && <>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pt-3">
          {[['', 'All crops'], ...Object.entries(CROP_EN)].map(([k, v]) => <button key={k} onClick={() => setCrop(k)} className={`tag py-1.5 px-3 shrink-0 ${crop === k ? 'bg-field-800 text-white' : 'bg-white border border-line'}`}>{v}</button>)}
        </div>
        <QueueList items={open} loading={loading} onOpen={setSel} empty="The queue is clear" />
      </>}
      {tab === 'answered' && <QueueList items={answered} loading={loading} onOpen={setSel} empty="No answers yet" />}
      {tab === 'profile' && <Profile p={profile} onChange={loadProfile} onLogout={logout} />}
    </AppShell>
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
        <button onClick={onCall} className="btn btn-quiet w-full mt-3"><Video size={18} /> Video call farmer (WhatsApp)</button>
      </section>
      {q.understanding?.weather?.temp_c !== undefined && <div className="surface px-4 py-3 text-sm text-muted">Weather in {q.tehsil} now: {Math.round(q.understanding.weather.temp_c)}°C, humidity {q.understanding.weather.humidity}%, rain chance {q.understanding.weather.rain_chance ?? 0}%</div>}
      <Section title="Why the AI did not answer"><Reasons reasons={q.reasons} /><div className="mt-3"><Meter label="Retrieval confidence" value={q.retrieval_score} min={0.3} /></div></Section>
      <Section title="AI's attempted answer (not sent)">{q.ai_answer ? <div className="urdu text-[16px]">{q.ai_answer}</div> : <div className="text-sm text-muted">No confident answer was found.</div>}
        {!!q.retrieved?.length && <ul className="mt-2 divide-y divide-line border-t border-line">{q.retrieved.map((r: any) => <li key={r.kb_id} className="flex justify-between items-center py-1.5"><span className="text-xs text-muted">{r.score.toFixed(2)}</span><span className="urdu text-[14px] !leading-[1.9]">{r.title_ur}</span></li>)}</ul>}
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
