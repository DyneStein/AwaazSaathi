import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, AlertTriangle, FastForward, PhoneForwarded, WifiOff, Wifi, Play, Phone, Stethoscope, Store, Activity, ShieldCheck, Cpu, KeyRound } from 'lucide-react'
import { api, post, timeAgo } from '../lib/api'
import { useWS } from '../lib/ws'
import { LevelBadge, LiveDot, Logo, Spinner } from '../components/ui'

export default function Admin() {
  const [h, setH] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [counters, setCounters] = useState<any[]>([])
  const [experts, setExperts] = useState<any[]>([])
  const [canned, setCanned] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    api('/api/admin/health').then(setH).catch(() => {})
    api('/api/admin/events').then(setEvents).catch(() => {})
    api('/api/admin/outbreak-counters').then(setCounters).catch(() => {})
    api('/api/expert/list').then(setExperts).catch(() => {})
  }, [])
  useEffect(() => { load(); api('/api/demo/personas').then((m) => setCanned(m.canned)); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])
  const ws = useWS(['*'], () => load())
  const run = async (k: string, fn: () => Promise<any>, ok: (r: any) => string) => {
    setBusy(k); setMsg(null)
    try { setMsg(ok(await fn())) } catch (e: any) { setMsg(`Failed: ${e.message}`) } finally { setBusy(null); load() }
  }
  const Btn = ({ k, icon: Icon, children, onClick, cls = 'btn-quiet' }: any) => <button disabled={!!busy} onClick={onClick} className={`btn ${cls} text-sm`}>{busy === k ? <Spinner /> : Icon && <Icon size={16} />}{children}</button>

  return (
    <div className="min-h-full">
      <header className="bg-field-800 text-white"><div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3"><Link to="/"><Logo size={32} /></Link><div className="flex-1"><div className="font-bold">Demo control</div><div className="text-xs text-field-200">Operator view for the live presentation</div></div><LiveDot on={ws.connected} /></div></header>
      <div className="mx-auto max-w-6xl p-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Btn k="reset" icon={RotateCcw} cls="btn-primary" onClick={() => confirm('Reset all demo data?') && run('reset', () => post('/api/admin/reset'), () => 'Demo data reset')}>Reset demo</Btn>
              <Btn k="ob" icon={AlertTriangle} cls="btn-accent" onClick={() => run('ob', () => post('/api/admin/outbreak-scenario'), () => 'Two more Okara yellow-rust reports sent')}>Trigger outbreak</Btn>
              <Btn k="fu" icon={PhoneForwarded} onClick={() => run('fu', () => post('/api/admin/followups'), (r) => `3-day follow-up calls placed to ${r.count} farmers`)}>3-day follow-up calls</Btn>
              <Btn k="sla" icon={FastForward} onClick={() => run('sla', () => post('/api/admin/sla-fast-forward'), (r) => `Moved 3 hours ahead: ${r.escalated} questions re-routed to another senior`)}>Skip 3 hours</Btn>
              <button onClick={() => run('off', () => post('/api/admin/offline', { on: !h?.offline }), (r) => r.offline ? 'Offline: cached voice and on-device rules only' : 'Back online')} className={`btn text-sm ml-auto ${h?.offline ? 'bg-warn-50 text-warn border border-warn/30' : 'btn-quiet'}`}>{h?.offline ? <WifiOff size={16} /> : <Wifi size={16} />}{h?.offline ? 'Offline mode on' : 'Online'}</button>
            </div>
            <div className="mt-3 text-xs text-muted">Send a sample farmer question</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(canned).map(([k, c]) => <Btn key={k} k={k} icon={Play} onClick={() => run(k, () => post(`/api/admin/canned/${k}`), (r) => `Question #${r.query_id}: ${r.status === 'answered_ai' ? 'answered by AI' : 'sent to experts'}`)}>{c.label}</Btn>)}</div>
            {msg && <div className="mt-3 text-sm rounded-xl bg-field-50 border border-line px-3 py-2">{msg}</div>}
          </section>

          <section className="surface p-4">
            <div className="font-bold">Outbreak watch</div>
            <div className="text-sm text-muted mb-3">An alert fires at {h?.thresholds.outbreak_min_cases ?? 3} farmers reporting the same problem in one tehsil within {h?.thresholds.outbreak_window_days ?? 7} days.</div>
            <div className="grid sm:grid-cols-2 gap-3">{counters.map((c) => (
              <div key={c.tehsil + c.disease_tag} className={`rounded-xl border p-3 ${c.active ? 'border-danger/40 bg-danger-50' : 'border-line'}`}>
                <div className="flex justify-between items-center"><span className="font-semibold">{c.tehsil}</span>{c.active && <span className="tag bg-danger text-white">Alert sent</span>}</div>
                <div className="text-xs text-muted">{c.name_en}</div>
                <div className="flex items-center gap-1.5 mt-2">
                  {Array.from({ length: Math.max(c.threshold, c.count) }).map((_, i) => <div key={i} className={`h-2.5 flex-1 rounded-full transition-colors duration-500 ${i < c.count ? (c.count >= c.threshold ? 'bg-danger' : 'bg-mustard') : 'bg-line'}`} />)}
                  <span className="font-bold w-10 text-right">{c.count}/{c.threshold}</span>
                </div>
              </div>))}
            </div>
          </section>

          <section className="surface p-4">
            <div className="font-bold flex items-center gap-2 mb-2"><Activity size={17} /> Live activity</div>
            <ul className="text-sm divide-y divide-line max-h-[420px] overflow-auto">{events.map((e) => (
              <li key={e.id} className="py-2 flex gap-3"><span className="tag bg-field-50 text-muted border border-line shrink-0 w-24 justify-center">{e.kind.replace('_', ' ')}</span><span className="flex-1">{e.message}</span><span className="text-xs text-muted shrink-0">{timeAgo(e.at)}</span></li>))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="surface p-4">
            <div className="font-bold mb-2">Open the apps</div>
            <div className="grid gap-2">
              {[['/farmer', 'Farmer helpline', Phone], ['/expert', 'Agronomist app', Stethoscope], ['/dealer', 'Dealer app', Store]].map(([to, t, I]: any) => <Link key={to} to={to} target="_blank" className="btn btn-quiet justify-start"><I size={17} />{t}</Link>)}
            </div>
            <div className="text-xs text-muted mt-2">Phone: open http://&lt;laptop IP&gt;:8000/dealer. The start script prints the address and a QR code.</div>
          </section>
          <section className="surface p-4">
            <div className="font-bold flex items-center gap-2 mb-2"><Cpu size={17} /> AI services</div>
            {!h ? <Spinner /> : <>
              <ul className="text-sm space-y-1.5">
                {Object.entries(h.local || {}).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className={v ? 'text-field-700 font-semibold' : 'text-muted'}>{v ? 'On device' : 'Not installed'}</span></li>)}
                {Object.entries(h.keys).map(([k, v]) => <li key={k} className="flex justify-between"><span className="flex items-center gap-1.5"><KeyRound size={13} className="text-muted" />{k}</span><span className={v ? 'text-field-700' : 'text-muted'}>{v ? 'Key set' : 'Optional'}</span></li>)}
              </ul>
              {Object.keys(h.services).length > 0 && <ul className="text-xs space-y-1 mt-3 border-t border-line pt-2">{Object.entries(h.services).map(([k, v]: any) => <li key={k} className="flex justify-between gap-2"><span className="font-semibold">{k}</span><span className={v.ok ? 'text-field-700 truncate' : 'text-danger truncate'} title={v.detail}>{v.ok ? `${v.detail}${v.ms ? `, ${v.ms} ms` : ''}` : 'error'}</span></li>)}</ul>}
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">{Object.entries(h.counts).map(([k, v]: any) => <div key={k} className="rounded-xl bg-field-50 border border-line py-2"><div className="font-bold text-lg">{v}</div><div className="text-[11px] text-muted">{k.replace('_', ' ')}</div></div>)}</div>
              <Thresholds t={h.thresholds} onSaved={load} />
            </>}
          </section>
          <section className="surface p-4">
            <div className="font-bold flex items-center gap-2 mb-2"><ShieldCheck size={17} /> Expert verification</div>
            <ul className="space-y-2">{experts.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{e.name}</span><LevelBadge level={e.level} />
                {e.verification_status === 'verified' ? <ShieldCheck size={16} className="text-field-700" /> : <button onClick={() => run('v' + e.id, () => post(`/api/admin/experts/${e.id}/verify?approve=true`), () => `${e.name} verified`)} className="btn btn-primary text-xs !py-1 !px-2">Approve</button>}
              </li>))}</ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function Thresholds({ t, onSaved }: { t: any; onSaved: () => void }) {
  const [r, setR] = useState(t.retrieval_min)
  const [g, setG] = useState(t.grounding_min)
  return (
    <div className="mt-4 space-y-2 text-sm border-t border-line pt-3">
      <div className="font-semibold">Safety thresholds</div>
      <label className="flex items-center gap-2">Retrieval<input type="range" min={0} max={0.8} step={0.01} value={r} onChange={(e) => setR(+e.target.value)} className="flex-1 accent-field-700" /><span className="w-10 text-right">{r.toFixed(2)}</span></label>
      <label className="flex items-center gap-2">Grounding<input type="range" min={0} max={1} step={0.01} value={g} onChange={(e) => setG(+e.target.value)} className="flex-1 accent-field-700" /><span className="w-10 text-right">{g.toFixed(2)}</span></label>
      <button onClick={() => post('/api/admin/thresholds', { retrieval_min: r, grounding_min: g }).then(onSaved)} className="btn btn-quiet text-xs">Apply</button>
    </div>
  )
}
