import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, post, timeAgo } from '../lib/api'
import { useWS } from '../lib/ws'
import { Brand, LevelBadge, LiveDot, Spinner } from '../components/ui'

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
  const live = useWS(['*'], () => load())

  const run = async (k: string, fn: () => Promise<any>, ok: (r: any) => string) => {
    setBusy(k); setMsg(null)
    try { const r = await fn(); setMsg(ok(r)) } catch (e: any) { setMsg(`Error: ${e.message}`) } finally { setBusy(null); load() }
  }
  const B = ({ k, children, onClick, cls = 'btn-ghost' }: any) => <button disabled={!!busy} onClick={onClick} className={`btn ${cls} text-sm`}>{busy === k ? <Spinner /> : null}{children}</button>

  return (
    <div className="min-h-full">
      <Brand app="Presenter / operator panel" right={<LiveDot on={live} />} />
      <div className="mx-auto max-w-7xl p-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <B k="reset" cls="btn-danger" onClick={() => confirm('Reset all demo data?') && run('reset', () => post('/api/admin/reset'), () => 'Demo data reset')}>⟲ Reset demo</B>
              <B k="ob" cls="btn-wheat" onClick={() => run('ob', () => post('/api/admin/outbreak-scenario'), () => 'Outbreak scenario fired: 2 more Okara yellow-rust cases')}>⚠ Fire outbreak scenario</B>
              <B k="sla" onClick={() => run('sla', () => post('/api/admin/sla-fast-forward'), (r) => `SLA fast-forward: ${r.escalated} auto-escalated`)}>⏩ +3h (SLA test)</B>
              <label className={`ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer ${h?.offline ? 'bg-orange-100 text-orange-900' : 'bg-leaf-100 text-leaf-900'}`}>
                <input type="checkbox" checked={!!h?.offline} onChange={(e) => run('off', () => post('/api/admin/offline', { on: e.target.checked }), (r) => r.offline ? 'OFFLINE mode: cached audio + local rules only' : 'Online mode')} />
                {h?.offline ? 'Offline mode ON' : 'Online'}
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{Object.entries(canned).map(([k, c]) => <B key={k} k={k} onClick={() => run(k, () => post(`/api/admin/canned/${k}`), (r) => `#${r.query_id} ${r.status}${r.reasons?.length ? ' · ' + r.reasons.join('; ') : ''}`)}>▶ {c.label}</B>)}</div>
            {msg && <div className="mt-3 text-sm rounded-lg bg-soil-100 px-3 py-2">{msg}</div>}
          </div>

          <div className="card p-4">
            <h2 className="font-bold mb-3">Outbreak engine · ≥{h?.thresholds.outbreak_min_cases ?? 3} farmers, same tehsil, {h?.thresholds.outbreak_window_days ?? 7} days</h2>
            <div className="grid sm:grid-cols-2 gap-3">{counters.map((c) => (
              <div key={c.tehsil + c.disease_tag} className={`rounded-xl border p-3 ${c.active ? 'border-alert bg-orange-50' : 'border-soil-200'}`}>
                <div className="flex justify-between items-center"><div className="font-semibold">{c.tehsil}</div>{c.active && <span className="chip bg-alert text-white">ACTIVE</span>}</div>
                <div className="text-xs text-soil-500">{c.name_en}</div>
                <div className="flex items-center gap-2 mt-2">
                  {Array.from({ length: Math.max(c.threshold, c.count) }).map((_, i) => <div key={i} className={`h-3 flex-1 rounded-full transition-all duration-500 ${i < c.count ? (c.count >= c.threshold ? 'bg-alert' : 'bg-wheat') : 'bg-soil-100'}`} />)}
                  <div className="font-mono font-bold text-lg w-12 text-right">{c.count}/{c.threshold}</div>
                </div>
              </div>))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="font-bold mb-2">Live system feed</h2>
            <ul className="text-sm divide-y divide-soil-200 max-h-[420px] overflow-auto">{events.map((e) => (
              <li key={e.id} className="py-1.5 flex gap-2"><span className="chip bg-soil-100 text-soil-700 shrink-0 w-24 justify-center">{e.kind}</span><span className="flex-1">{e.message}</span><span className="text-xs text-soil-500 shrink-0">{timeAgo(e.at)}</span></li>))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-bold mb-2">Open the apps</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link to="/farmer" target="_blank" className="btn btn-primary">Farmer</Link>
              <Link to="/expert" target="_blank" className="btn btn-primary">Expert</Link>
              <Link to="/dealer" target="_blank" className="btn btn-primary">Dealer</Link>
              <a href="/docs" target="_blank" className="btn btn-ghost">API docs</a>
            </div>
            <div className="text-xs text-soil-500 mt-2">On the phone, open <b>http://&lt;laptop-ip&gt;:8000/dealer</b>. start.sh prints it with a QR code.</div>
          </div>
          <div className="card p-4">
            <h2 className="font-bold mb-2">System health</h2>
            {!h ? <Spinner /> : <>
              <ul className="text-sm space-y-1">
                {Object.entries(h.keys).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k} key</span><span>{v ? '✅' : '—'}</span></li>)}
                {Object.entries(h.services).map(([k, v]: any) => <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className={v.ok ? 'text-leaf-700' : 'text-red-700'} title={v.detail}>{v.ok ? `ok · ${v.detail}${v.ms ? ` · ${v.ms}ms` : ''}` : 'error'}</span></li>)}
              </ul>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {Object.entries(h.counts).map(([k, v]: any) => <div key={k} className="rounded-lg bg-soil-100 py-2"><div className="font-bold text-lg">{v}</div><div className="text-[10px] uppercase text-soil-500">{k.replace('_', ' ')}</div></div>)}
              </div>
              <Thresholds t={h.thresholds} onSaved={load} />
            </>}
          </div>
          <div className="card p-4">
            <h2 className="font-bold mb-2">Expert verification <span className="chip bg-soil-100 text-soil-700 text-[10px]">MOCK</span></h2>
            <ul className="space-y-2">{experts.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{e.name}</span><LevelBadge level={e.level} />
                {e.verification_status === 'verified' ? <span className="text-leaf-700 text-xs">✓</span> :
                  <button onClick={() => run('v' + e.id, () => post(`/api/admin/experts/${e.id}/verify?approve=true`), () => `${e.name} verified`)} className="btn btn-primary text-xs !py-1">Approve degree</button>}
              </li>))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function Thresholds({ t, onSaved }: { t: any; onSaved: () => void }) {
  const [r, setR] = useState(t.retrieval_min)
  const [g, setG] = useState(t.grounding_min)
  return (
    <div className="mt-4 space-y-2 text-sm">
      <div className="font-semibold">Nil-detection thresholds (live)</div>
      <label className="flex items-center gap-2">Retrieval min <input type="range" min={0} max={0.8} step={0.01} value={r} onChange={(e) => setR(+e.target.value)} className="flex-1" /><span className="font-mono w-10">{r.toFixed(2)}</span></label>
      <label className="flex items-center gap-2">Grounding min <input type="range" min={0} max={1} step={0.01} value={g} onChange={(e) => setG(+e.target.value)} className="flex-1" /><span className="font-mono w-10">{g.toFixed(2)}</span></label>
      <button onClick={() => post('/api/admin/thresholds', { retrieval_min: r, grounding_min: g }).then(onSaved)} className="btn btn-ghost text-xs">Apply</button>
    </div>
  )
}
