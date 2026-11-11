import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffWords } from 'diff'
import { api, post, timeAgo, CROP_EN } from '../lib/api'
import { useRecorder } from '../lib/audio'
import { useWS } from '../lib/ws'
import { Brand, Empty, ErrorNote, LevelBadge, LiveDot, MockTag, ReasonChips, ScoreBar, Spinner } from '../components/ui'

const PRIO: Record<number, [string, string]> = { 3: ['Outbreak', 'bg-red-100 text-red-800'], 2: ['Pesticide / dose', 'bg-orange-100 text-orange-800'], 1: ['Normal', 'bg-soil-100 text-soil-700'], 0: ['Normal', 'bg-soil-100 text-soil-700'] }

export default function Expert() {
  const [experts, setExperts] = useState<any[]>([])
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('expert') || 'null') } catch { return null } })
  const [profile, setProfile] = useState<any>(null)
  const [queue, setQueue] = useState<any[]>([])
  const [tab, setTab] = useState<'open' | 'answered'>('open')
  const [crop, setCrop] = useState('')
  const [tehsil, setTehsil] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/api/expert/list').then(setExperts) }, [])
  const loadProfile = useCallback(() => { if (me) api(`/api/expert/${me.id}/profile`).then(setProfile).catch(() => {}) }, [me])
  const loadQueue = useCallback(() => {
    if (!me) return
    setLoading(true)
    api(`/api/expert/queue?expert_id=${me.id}&crop=${crop}&tehsil=${tehsil}&show=${tab}`).then(setQueue).finally(() => setLoading(false))
  }, [me, crop, tehsil, tab])
  useEffect(loadProfile, [loadProfile])
  useEffect(loadQueue, [loadQueue])

  const live = useWS(['expert', 'reset'], (m) => {
    loadQueue(); loadProfile()
    if (m.event === 'new_query') flash(`New query #${m.data.id} in queue${m.data.priority >= 2 ? ' (priority)' : ''}`)
    if (m.event === 'score' && m.data.promoted_to && m.data.expert_id) flash(`🎉 Expert promoted to ${m.data.promoted_to}!`)
    if (m.event === 'reset') { setSel(null); api('/api/expert/list').then(setExperts) }
  })
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3500) }

  const login = (e: any) => { setMe(e); localStorage.setItem('expert', JSON.stringify(e)); setSel(null) }
  const logout = () => { setMe(null); localStorage.removeItem('expert'); setProfile(null) }

  const tehsils = useMemo(() => Array.from(new Set(queue.map((q) => q.tehsil))), [queue])
  const selected = queue.find((q) => q.id === sel) || null

  if (!me) return <Login experts={experts} onPick={login} />

  return (
    <div className="min-h-full">
      <Brand app="Expert console" right={<><LiveDot on={live} /><span className="hidden sm:inline text-sm font-semibold">{me.name}</span><button onClick={logout} className="btn btn-ghost text-sm">Switch</button></>} />
      {toast && <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 slide-down rounded-xl bg-leaf-800 text-white px-4 py-2 shadow-lg text-sm">{toast}</div>}
      <div className="mx-auto max-w-7xl p-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <Profile p={profile} onChange={loadProfile} />
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr] min-w-0">
          <div className="card p-3 min-w-0">
            <div className="flex gap-1 mb-3">
              {(['open', 'answered'] as const).map((t) => <button key={t} onClick={() => { setTab(t); setSel(null) }} className={`btn text-sm flex-1 ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{t === 'open' ? 'Queue' : 'Answered'}</button>)}
            </div>
            <div className="flex gap-2 mb-3">
              <select value={crop} onChange={(e) => setCrop(e.target.value)} className="flex-1 rounded-lg border border-soil-200 px-2 py-1.5 text-sm bg-white"><option value="">All crops</option>{Object.entries(CROP_EN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select value={tehsil} onChange={(e) => setTehsil(e.target.value)} className="flex-1 rounded-lg border border-soil-200 px-2 py-1.5 text-sm bg-white"><option value="">All tehsils</option>{tehsils.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            {loading && !queue.length ? <div className="py-10 text-center"><Spinner /></div> : !queue.length ? <Empty>{tab === 'open' ? 'Queue is clear 🎉' : 'Nothing answered yet'}</Empty> :
              <ul className="space-y-2 max-h-[70vh] overflow-auto pr-1">{queue.map((q) => (
                <li key={q.id}>
                  <button onClick={() => setSel(q.id)} className={`w-full text-left rounded-xl border p-3 transition fade-in ${sel === q.id ? 'border-leaf-500 bg-leaf-100/50 ring-2 ring-leaf-200' : 'border-soil-200 hover:bg-soil-100/50'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs text-soil-500">#{q.id}</span>
                      <span className={`chip ${PRIO[q.priority][1]}`}>{PRIO[q.priority][0]}</span>
                      {q.route === 'senior_only' && <span className="chip bg-wheat/40">★ Senior only</span>}
                      {q.status === 'drafted' && <span className="chip bg-sky-100 text-sky-800">Draft ready</span>}
                      {q.escalation_count > 0 && <span className="chip bg-red-100 text-red-700">SLA re-routed</span>}
                      <span className="ml-auto"><SLA due={q.sla_due_at} status={q.status} /></span>
                    </div>
                    <div className="urdu text-base mt-1 line-clamp-2 !leading-[2]">{q.transcript}</div>
                    <div className="text-xs text-soil-500">{CROP_EN[q.crop] || q.crop} · {q.tehsil} · {timeAgo(q.created_at)}</div>
                  </button>
                </li>))}
              </ul>}
          </div>
          <div className="min-w-0">{selected ? <Detail q={selected} me={profile || me} onDone={(m) => { flash(m); loadQueue(); loadProfile() }} /> : <div className="card p-10"><Empty>Select a query to see the farmer's question, the AI's attempt and its sources.</Empty></div>}</div>
        </div>
      </div>
    </div>
  )
}

function Login({ experts, onPick }: { experts: any[]; onPick: (e: any) => void }) {
  return (
    <div className="min-h-full">
      <Brand app="Expert console" />
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-extrabold">Sign in as an agronomist</h1>
        <p className="text-soil-700 mb-5 text-sm">Demo accounts. Juniors draft, verified experts answer low-risk topics, seniors review and approve.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {experts.map((e) => (
            <button key={e.id} onClick={() => onPick(e)} className="card p-4 text-left hover:ring-2 hover:ring-leaf-200 transition">
              <div className="flex items-center justify-between"><div className="font-bold">{e.name}</div><LevelBadge level={e.level} /></div>
              <div className="text-xs text-soil-500 mt-1">{e.degree}</div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                {e.verification_status === 'verified' ? <span className="chip bg-leaf-100 text-leaf-800">✓ Verified</span> : <span className="chip bg-orange-100 text-orange-800">Verification pending</span>}
                {e.reviewed_count > 0 && <span className="text-soil-700">Score {(e.score * 100).toFixed(0)}% · {e.reviewed_count} reviewed</span>}
              </div>
            </button>))}
        </div>
      </div>
    </div>
  )
}

function Profile({ p, onChange }: { p: any; onChange: () => void }) {
  const [uploading, setUploading] = useState(false)
  if (!p) return <div className="card p-4"><Spinner /></div>
  const upload = async (f: File) => {
    setUploading(true)
    const fd = new FormData(); fd.append('file', f)
    await api(`/api/expert/${p.id}/degree`, { method: 'POST', body: fd }).finally(() => setUploading(false))
    onChange()
  }
  const pts = p.history?.map((h: any) => h.score) || []
  return (
    <aside className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-leaf-700 text-white flex items-center justify-center font-bold text-lg">{p.name.split(' ').slice(-2).map((s: string) => s[0]).join('')}</div>
          <div><div className="font-bold leading-tight">{p.name}</div><LevelBadge level={p.level} /></div>
        </div>
        <div className="text-xs text-soil-500 mt-2">{p.degree}</div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>Verification</span>
          {p.verification_status === 'verified' ? <span className="chip bg-leaf-100 text-leaf-800">✓ Verified</span> : <span className="chip bg-orange-100 text-orange-800">{p.verification_status}</span>}
        </div>
        {p.verification_status !== 'verified' && (
          <label className="mt-2 block text-xs text-soil-700">Upload degree (admin approves) <MockTag>check mocked</MockTag>
            <input type="file" className="mt-1 block w-full text-xs" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            {uploading && <Spinner />}
          </label>)}
      </div>
      {p.level !== 'senior' ? (
        <div className="card p-4">
          <div className="text-sm font-semibold mb-1">Quality score</div>
          <div className="text-3xl font-extrabold text-leaf-700">{(p.score * 100).toFixed(0)}%</div>
          <div className="text-xs text-soil-500 mb-3">{p.clean_count} of {p.reviewed_count} answers approved without major edits · {p.rejected_count} rejected</div>
          {pts.length > 1 && <Spark pts={pts} />}
          {p.progress?.next && <div className="mt-3">
            <div className="text-xs font-semibold mb-1">Promotion to {p.progress.next}</div>
            <ScoreBar label={`Reviewed ${p.progress.reviewed}/${p.progress.need_reviewed}`} value={p.progress.reviewed / p.progress.need_reviewed} />
            <div className="mt-2"><ScoreBar label="Score" value={p.score} min={p.progress.need_score} /></div>
          </div>}
        </div>
      ) : (
        <div className="card p-4"><div className="text-sm font-semibold">Senior reviewer</div><div className="text-3xl font-extrabold text-leaf-700">{p.reviews_done}</div><div className="text-xs text-soil-500">reviews done · final authority · can promote answers to the knowledge base</div></div>
      )}
      <div className="card p-4">
        <div className="flex items-center justify-between"><span className="text-sm font-semibold">Payout balance</span><MockTag>no real payments</MockTag></div>
        <div className="text-2xl font-extrabold mt-1">Rs {p.earnings_pkr.toLocaleString()}</div>
        <div className="text-xs text-soil-500">{p.sponsor ? `Sponsor-funded by ${p.sponsor}` : p.level === 'junior' ? 'Unpaid (no sponsor yet)' : ''}{p.level === 'senior' ? ' · per review' : ''}</div>
      </div>
    </aside>
  )
}

function Spark({ pts }: { pts: number[] }) {
  const w = 240, h = 48
  const min = Math.min(...pts, 0.5), max = 1
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`).join(' ')
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12"><polyline points={d} fill="none" stroke="var(--color-leaf-500)" strokeWidth="2.5" strokeLinejoin="round" /></svg>
}

function SLA({ due, status }: { due: string | null; status: string }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  if (!due || !['queued', 'drafted'].includes(status)) return null
  const ms = new Date(due).getTime() - Date.now()
  const over = ms < 0
  const a = Math.abs(ms) / 1000
  const txt = `${Math.floor(a / 3600)}h ${String(Math.floor((a % 3600) / 60)).padStart(2, '0')}m`
  return <span className={`chip font-mono ${over ? 'bg-red-600 text-white' : ms < 3600e3 ? 'bg-orange-100 text-orange-800' : 'bg-leaf-100 text-leaf-800'}`}>⏱ {over ? `-${txt}` : txt}</span>
}

function Detail({ q, me, onDone }: { q: any; me: any; onDone: (msg: string) => void }) {
  const [full, setFull] = useState<any>(q)
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [voice, setVoice] = useState<string | null>(null)
  const rec = useRecorder()
  useEffect(() => { api(`/api/expert/query/${q.id}`).then((d) => { setFull(d); const last = d.drafts?.[d.drafts.length - 1]; setText(q.status === 'drafted' && last ? last.text : '') }); setErr(null); setReason(''); setVoice(null) }, [q.id, q.status])
  const draft = full.drafts?.[full.drafts.length - 1]
  const isSenior = me.level === 'senior'
  const reviewing = isSenior && q.status === 'drafted' && draft

  const act = async (fn: () => Promise<any>, msg: (r: any) => string) => {
    setBusy(true); setErr(null)
    try { const r = await fn(); onDone(msg(r)) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const recToggle = async () => {
    if (rec.recording) {
      const b = await rec.stop(); if (!b) return
      const fd = new FormData(); fd.append('audio', b, 'reply.webm')
      const r = await api('/api/expert/upload-audio', { method: 'POST', body: fd }); setVoice(r.audio_url)
    } else await rec.start()
  }
  const changed = reviewing && text.trim() !== draft.text.trim()

  return (
    <div className="card p-5 space-y-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-soil-500">Query #{q.id} · {CROP_EN[q.crop] || q.crop} · {q.tehsil} · {timeAgo(q.created_at)} · via {q.channel}</div>
          <div className="urdu text-2xl font-semibold mt-1">{q.transcript}</div>
          {q.normalized_query && q.normalized_query !== q.transcript && <div className="urdu text-base text-soil-700">↳ {q.normalized_query}</div>}
        </div>
        <SLA due={q.sla_due_at} status={q.status} />
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        {q.audio_url && <audio src={q.audio_url} controls className="h-9" />}
        {q.photo_url && <a href={q.photo_url} target="_blank"><img src={q.photo_url} className="h-24 rounded-lg border" alt="leaf" /></a>}
      </div>
      <div><div className="text-xs font-semibold text-soil-500 mb-1">Why the AI escalated</div><ReasonChips reasons={q.reasons} /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-soil-100/60 p-3">
          <div className="text-xs font-semibold text-soil-500 mb-1">AI's attempted answer (not sent)</div>
          {q.ai_answer ? <div className="urdu text-base">{q.ai_answer}</div> : <div className="text-sm text-soil-500">No confident answer.</div>}
          <div className="mt-2"><ScoreBar label="Retrieval" value={q.retrieval_score} min={0.3} /></div>
        </div>
        <div className="rounded-xl bg-soil-100/60 p-3">
          <div className="text-xs font-semibold text-soil-500 mb-1">Retrieved sources</div>
          <ul className="space-y-1">{(q.retrieved || []).map((r: any) => <li key={r.kb_id} className="flex justify-between gap-2 text-sm"><span className="urdu !leading-normal">{r.title_ur}</span><span className="font-mono text-xs text-soil-500">{r.score.toFixed(2)}</span></li>)}</ul>
        </div>
      </div>

      {full.reviews?.filter((r: any) => r.action === 'reject').map((r: any) => <div key={r.id} className="rounded-lg bg-red-50 border border-red-200 p-2 text-sm">✕ Rejected by {r.reviewer}: {r.reason}</div>)}

      {q.status === 'approved' ? (
        <div className="rounded-xl border border-leaf-200 bg-leaf-100/40 p-4 space-y-2">
          <div className="flex items-center justify-between"><span className="chip bg-leaf-700 text-white">✓ Approved by {q.answered_by} · sent as voice callback</span>{q.final_audio_url && <audio src={q.final_audio_url} controls className="h-8" />}</div>
          <div className="urdu text-lg">{q.final_answer}</div>
          {q.promoted_kb_id ? <span className="chip bg-wheat/40">📚 In knowledge base (KB#{q.promoted_kb_id}). AI will answer this next time</span> :
            isSenior ? <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/promote`, { reviewer_id: me.id }), (r) => `Added to knowledge base as KB#${r.kb_id}. The AI will now answer this question`)} className="btn btn-wheat">📚 Promote to knowledge base</button>
              : <div className="text-xs text-soil-500">Only seniors can promote answers to the knowledge base.</div>}
        </div>
      ) : reviewing ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
            <div className="text-xs font-semibold text-sky-800 mb-1">Draft by {draft.expert} (junior)</div>
            <div className="urdu text-lg">{draft.text}</div>
            {draft.audio_url && <audio src={draft.audio_url} controls className="h-8 mt-1" />}
          </div>
          <label className="block text-sm font-semibold">Final answer (edit if needed)</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="rtl" className="w-full rounded-xl border border-soil-200 p-3 urdu text-lg !leading-[2.1]" />
          {changed && <div className="rounded-xl border border-soil-200 p-3"><div className="text-xs font-semibold text-soil-500 mb-1">Changes vs draft</div><Diff a={draft.text} b={text} /></div>}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" className="w-full rounded-xl border border-soil-200 px-3 py-2 text-sm" />
          <ErrorNote error={err} />
          <div className="flex flex-wrap gap-2">
            {!changed ? <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'approve' }), (r) => `Approved. Calling the farmer back now${r.promoted_to ? ` · ${draft.expert} promoted to ${r.promoted_to}!` : ''}`)} className="btn btn-primary">{busy ? <Spinner /> : '✓'} Approve & call farmer</button>
              : <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'edit_approve', final_text: text }), (r) => `Edited & approved (${r.outcome === 'clean' ? 'minor edit' : 'major edit, counts against junior score'}). Calling farmer`)} className="btn btn-primary">{busy ? <Spinner /> : '✎'} Edit & approve</button>}
            <button disabled={busy} onClick={() => act(() => post(`/api/expert/query/${q.id}/review`, { reviewer_id: me.id, action: 'reject', reason }), () => 'Rejected. Back in the queue')} className="btn btn-danger">✕ Reject</button>
          </div>
        </div>
      ) : q.status === 'drafted' ? (
        <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sm">Draft by {draft?.expert} is waiting for a senior review.<div className="urdu text-lg mt-1">{draft?.text}</div></div>
      ) : q.can_draft && me.verification_status === 'verified' ? (
        <div className="space-y-3">
          <label className="block text-sm font-semibold">{me.level === 'junior' ? 'Your draft (a senior will review it)' : 'Your answer (goes straight to the farmer)'}</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="rtl" placeholder="جواب آسان اردو میں لکھیں…" className="w-full rounded-xl border border-soil-200 p-3 urdu text-lg !leading-[2.1]" />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={recToggle} className={`btn ${rec.recording ? 'btn-danger' : 'btn-ghost'}`}>{rec.recording ? '■ Stop recording' : '🎙️ Record voice reply'}</button>
            {voice && <audio src={voice} controls className="h-8" />}
            {rec.error && <span className="text-xs text-red-700">{rec.error}</span>}
          </div>
          <ErrorNote error={err} />
          <button disabled={busy || !text.trim()} onClick={() => act(() => post(`/api/expert/query/${q.id}/draft`, { expert_id: me.id, text, audio_url: voice }), (r) => r.status === 'approved' ? 'Answer sent. Calling the farmer back' : r.spot_check ? 'Sent. Randomly picked for a senior spot check' : 'Draft submitted for senior review')} className="btn btn-primary">{busy ? <Spinner /> : '➤'} {me.level === 'junior' ? 'Submit draft' : 'Send answer'}</button>
        </div>
      ) : (
        <div className="rounded-xl bg-wheat/20 border border-wheat p-3 text-sm">{me.verification_status !== 'verified' ? 'Your degree verification is pending. You can answer once an admin approves it.' : '★ Senior-only topic (pesticide dose, banned chemical or suspected outbreak). A senior agronomist must answer this.'}</div>
      )}
    </div>
  )
}

function Diff({ a, b }: { a: string; b: string }) {
  const parts = diffWords(a, b)
  return <div className="urdu text-lg">{parts.map((p, i) => <span key={i} className={p.added ? 'bg-leaf-200 text-leaf-900 rounded px-0.5' : p.removed ? 'bg-red-100 text-red-800 line-through rounded px-0.5' : ''}>{p.value}</span>)}</div>
}
