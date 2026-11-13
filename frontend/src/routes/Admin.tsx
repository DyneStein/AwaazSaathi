import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RotateCcw, AlertTriangle, FastForward, PhoneForwarded, WifiOff, Wifi, Play, Phone, Stethoscope, Store, Activity, ShieldCheck, Cpu, KeyRound, FlaskConical, ChevronDown, Map as MapIcon, SlidersHorizontal, QrCode, X, Users, MessageSquareText, Siren } from 'lucide-react'
import { api, post, timeAgo, CROP_EN } from '../lib/api'
import { useWS } from '../lib/ws'
import { LevelBadge, LiveDot, Logo, Spinner, REASON, Segmented } from '../components/ui'
import { OpsMap, STATE_COLOR, type Layers, type MapData, type MapTehsil } from '../components/OpsMap'

type Section = 'overview' | 'control'

/** Operator console: the live Punjab map, and the demo controls. */
export default function Admin() {
  const [params, setParams] = useSearchParams()
  const section: Section = params.get('view') === 'control' ? 'control' : 'overview'
  const go = (s: Section) => setParams(s === 'overview' ? {} : { view: s }, { replace: true })
  const NAV: [Section, string, typeof MapIcon][] = [['overview', 'Overview', MapIcon], ['control', 'Demo control', SlidersHorizontal]]
  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] flex flex-col lg:flex-row bg-canvas">
      <aside className="lg:w-[228px] shrink-0 bg-field-950 text-white flex lg:flex-col">
        <Link to="/" className="flex items-center gap-2.5 px-4 py-3 lg:py-5"><Logo size={32} /><span className="hidden sm:block"><span className="block font-bold leading-tight">AwaazSaathi</span><span className="block text-[12px] text-field-200 leading-tight">Operations</span></span></Link>
        <nav aria-label="Sections" className="flex lg:flex-col gap-1 px-2 lg:px-3 items-center lg:items-stretch flex-1 overflow-x-auto no-scrollbar">
          {NAV.map(([k, t, I]) => <button key={k} onClick={() => go(k)} aria-current={section === k ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] whitespace-nowrap ${section === k ? 'bg-white/12 text-white font-semibold' : 'text-field-200 hover:bg-white/6'}`}><I size={17} />{t}</button>)}
          <Link to="/connect" target="_blank" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] text-field-200 hover:bg-white/6 whitespace-nowrap"><QrCode size={17} />Connect phones</Link>
          <div className="hidden lg:block mt-6 mb-1 px-3 text-[12px] text-field-200/80">Open an app</div>
          {([['/farmer', 'Farmer', Phone], ['/expert', 'Agronomist', Stethoscope], ['/dealer', 'Dealer', Store]] as const).map(([to, t, I]) => <Link key={to} to={to} target="_blank" className="hidden lg:flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] text-field-200 hover:bg-white/6"><I size={17} />{t}</Link>)}
        </nav>
        <p className="hidden lg:block px-5 py-4 text-[11.5px] leading-snug text-field-200/75">All farmers, dealers and experts are fictional demo data. Farm positions are not stored, only the tehsil.</p>
      </aside>
      <main className="flex-1 min-w-0 lg:overflow-y-auto">{section === 'overview' ? <Overview /> : <Control />}</main>
    </div>
  )
}

function PageHead({ title, sub, live, right }: { title: string; sub: string; live: boolean; right?: ReactNode }) {
  return (
    <header className="bg-white border-b border-line px-4 lg:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex-1 min-w-[200px]"><h1 className="text-[19px] font-bold leading-tight">{title}</h1><p className="text-[13px] text-muted">{sub}</p></div>
      {right}
      <span className="flex items-center gap-2 text-[13px] text-muted"><LiveDot on={live} />{live ? 'Live' : 'Reconnecting'}</span>
    </header>
  )
}

const STATE_LABEL = { ai: 'Answered by the AI', expert: 'Answered by an agronomist', waiting: 'With the agronomists' }

function Overview() {
  const [days, setDays] = useState<'7' | '30'>('30')
  const [data, setData] = useState<(MapData & { totals: any; watch: any[] }) | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [layers, setLayers] = useState<Layers>({ farmers: true, questions: true, dealers: true, outbreaks: true })
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const seen = useRef<Set<number> | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(() => {
    api(`/api/admin/map?days=${days}`).then((d) => {
      const ids = new Set<number>(d.questions.map((q: any) => q.id))
      if (seen.current) {
        const added = [...ids].filter((i) => !seen.current!.has(i))
        if (added.length) { setFresh(new Set(added)); setTimeout(() => setFresh(new Set()), 9000) }
      }
      seen.current = ids; setData(d)
    }).catch(() => {})
    api('/api/admin/events').then(setEvents).catch(() => {})
  }, [days])
  useEffect(() => { seen.current = null; load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])
  // Many events arrive in bursts (one question fires several); reload once per burst.
  const ws = useWS(['*'], () => { clearTimeout(timer.current); timer.current = window.setTimeout(load, 350) })
  const sel = data?.tehsils.find((t) => t.name === selected) || null
  const T = data?.totals

  return (
    <div className="flex flex-col lg:h-full">
      <PageHead title="Punjab overview" sub="Farmers, questions, dealers and outbreaks across the pilot tehsils" live={ws.connected}
        right={<Segmented value={days} onChange={setDays} className="w-[220px]" options={[['7', 'Last 7 days'], ['30', 'Last 30 days']]} />} />
      <dl className="bg-white border-b border-line px-4 lg:px-6 py-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-y-3" data-testid="ops-totals">
        <Figure label="Registered farmers" value={T?.farmers} icon={Users} />
        <Figure label="Questions" value={T?.questions} icon={MessageSquareText} />
        <Figure label="Answered by the AI" value={T?.ai} dot={STATE_COLOR.ai} share={T && T.questions ? T.ai / T.questions : undefined} />
        <Figure label="Answered by agronomists" value={T?.expert} dot={STATE_COLOR.expert} />
        <Figure label="Waiting for an agronomist" value={T?.waiting} dot={STATE_COLOR.waiting} />
        <Figure label="Active outbreaks" value={T?.outbreaks} icon={Siren} hot={!!T?.outbreaks} />
      </dl>
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
        <div className="relative h-[68vh] shrink-0 xl:h-auto xl:shrink xl:flex-1 min-w-0">
          <OpsMap data={data} layers={layers} selected={selected} onSelect={setSelected} fresh={fresh} />
          <Legend layers={layers} onChange={setLayers} />
        </div>
        <aside className="xl:w-[380px] shrink-0 bg-white border-t xl:border-t-0 xl:border-l border-line xl:overflow-y-auto" aria-label="Details">
          {sel ? <TehsilPanel t={sel} data={data!} onClose={() => setSelected(null)} /> : <>
            <Watch rows={data?.watch || []} tehsils={data?.tehsils || []} onPick={setSelected} />
            <Feed events={events} />
          </>}
        </aside>
      </div>
    </div>
  )
}

function Figure({ label, value, icon: Icon, dot, share, hot }: { label: string; value?: number; icon?: typeof Users; dot?: string; share?: number; hot?: boolean }) {
  return (
    <div className="px-1 sm:px-3 sm:border-l first:border-l-0 border-line">
      <dt className="text-[12.5px] text-muted flex items-center gap-1.5">{Icon && <Icon size={14} />}{dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}{label}</dt>
      <dd className={`text-[26px] font-extrabold leading-tight ${hot ? 'text-danger' : ''}`}>{value ?? '-'}{share !== undefined && <span className="ml-1.5 text-[13px] font-semibold text-muted">{Math.round(share * 100)}%</span>}</dd>
    </div>
  )
}

function Legend({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  const row = (k: keyof Layers, label: string, mark: ReactNode) => (
    <label className="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={layers[k]} onChange={() => onChange({ ...layers, [k]: !layers[k] })} className="accent-field-700 h-4 w-4" />{mark}<span>{label}</span></label>)
  return (
    <div className="absolute left-2 sm:left-3 bottom-6 sm:bottom-7 z-[500] rounded-xl bg-white/95 backdrop-blur border border-line shadow-sm px-2.5 sm:px-3 py-2 sm:py-2.5 text-[12px] sm:text-[12.5px] space-y-1 sm:space-y-1.5" aria-label="Map layers">
      {row('farmers', 'Registered farmers, by tehsil', <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-field-800 bg-field-100" />)}
      {row('questions', 'Questions', <span className="flex gap-0.5">{[STATE_COLOR.ai, STATE_COLOR.expert, STATE_COLOR.waiting].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>)}
      {row('dealers', 'Dealers', <span className="h-[18px] w-[18px] rounded-[5px] bg-white border-[1.5px] border-ink grid place-items-center"><Store size={11} strokeWidth={2.6} /></span>)}
      {row('outbreaks', 'Outbreak zones', <span className="h-3.5 w-3.5 rounded-full bg-danger/25 border-[1.5px] border-danger" />)}
      <div className="hidden sm:block pt-1 border-t border-line text-muted text-[11.5px] max-w-[230px]">Green: AI answered. Blue: agronomist answered. Amber: waiting. Red: possible poisoning. Points are spread around the tehsil centre; no farm location is stored.</div>
    </div>
  )
}

function Watch({ rows, tehsils, onPick }: { rows: any[]; tehsils: MapTehsil[]; onPick: (t: string) => void }) {
  const active = tehsils.filter((t) => t.outbreak)
  return (
    <section className="p-4 border-b border-line">
      <h2 className="font-bold flex items-center gap-2"><Siren size={17} className={active.length ? 'text-danger' : 'text-field-700'} /> Outbreak watch</h2>
      {active.map((t) => <button key={t.name} onClick={() => onPick(t.name)} className="mt-2 w-full text-left rounded-xl border border-danger/30 bg-danger-50 px-3 py-2"><span className="font-semibold text-danger">{t.outbreak!.name_en} in {t.name}</span><span className="block text-xs text-muted">{t.outbreak!.cases} farmers reported it. Alerts went to {t.name} and {t.neighbors.length} nearby tehsils.</span></button>)}
      {!rows.length && <p className="text-sm text-muted mt-1">No repeated problem in any tehsil yet.</p>}
      <ul className="mt-2 space-y-2">{rows.filter((r) => !r.active).slice(0, 5).map((r) => (
        <li key={r.tehsil + r.disease_tag}><button onClick={() => onPick(r.tehsil)} className="w-full text-left">
          <div className="flex justify-between text-[13px]"><span><span className="font-semibold">{r.tehsil}</span> <span className="text-muted">{r.name_en}</span></span><span className="font-semibold">{r.count}/{r.threshold}</span></div>
          <div className="mt-1 flex gap-1">{Array.from({ length: r.threshold }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < r.count ? 'bg-warn' : 'bg-line'}`} />)}</div>
        </button></li>))}</ul>
    </section>
  )
}

function Feed({ events }: { events: any[] }) {
  return (
    <section className="p-4">
      <h2 className="font-bold flex items-center gap-2"><Activity size={17} className="text-field-700" /> Live activity</h2>
      <ul className="mt-2 text-[13px] divide-y divide-line" data-testid="ops-feed">{events.slice(0, 25).map((e) => (
        <li key={e.id} className="py-2"><div>{e.message}</div><div className="text-[11.5px] text-muted mt-0.5">{e.kind.replace('_', ' ')}, {timeAgo(e.at)}</div></li>))}</ul>
    </section>
  )
}

function TehsilPanel({ t, data, onClose }: { t: MapTehsil; data: MapData; onClose: () => void }) {
  const qs = useMemo(() => data.questions.filter((q) => q.tehsil === t.name), [data, t.name])
  const dealers = data.dealers.filter((d) => d.tehsil === t.name)
  const total = Math.max(1, t.questions)
  return (
    <section className="p-4" data-testid="tehsil-panel">
      <div className="flex items-start gap-2">
        <div className="flex-1"><h2 className="text-[19px] font-bold leading-tight">{t.name}</h2><div className="text-[13px] text-muted">Tehsil in {t.district} district</div></div>
        <span className="urdu !leading-none text-[17px] text-muted pt-1">{t.ur}</span>
        <button onClick={onClose} aria-label="Close tehsil details" className="p-1.5 -mr-1.5 rounded-lg hover:bg-field-50"><X size={18} /></button>
      </div>
      {t.outbreak && <div className="mt-3 rounded-xl bg-danger text-white px-3 py-2.5"><div className="font-semibold flex items-center gap-2"><Siren size={16} /> Outbreak: {t.outbreak.name_en}</div><div className="text-[12.5px] opacity-90">{t.outbreak.cases} farmers reported it, {timeAgo(t.outbreak.at)}. Farmers and dealers here and in {t.neighbors.join(', ')} were alerted.</div></div>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-3"><div className="text-[24px] font-extrabold leading-none">{t.farmers}</div><div className="text-xs text-muted mt-1">Registered farmers</div></div>
        <div className="rounded-xl border border-line p-3"><div className="text-[24px] font-extrabold leading-none">{t.questions}</div><div className="text-xs text-muted mt-1">Questions</div></div>
      </div>
      {t.questions > 0 && <div className="mt-3">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-line">{(['ai', 'expert', 'waiting'] as const).map((k) => <span key={k} style={{ width: `${(t[k] / total) * 100}%`, background: STATE_COLOR[k] }} />)}</div>
        <ul className="mt-2 text-[12.5px] space-y-0.5">{(['ai', 'expert', 'waiting'] as const).map((k) => <li key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[k] }} /><span className="flex-1">{STATE_LABEL[k]}</span><span className="font-semibold">{t[k]}</span></li>)}</ul>
      </div>}
      {t.problems.length > 0 && <><h3 className="mt-4 text-[13px] font-semibold">Most reported</h3>
        <ul className="mt-1 text-[13px] space-y-1">{t.problems.map((p) => <li key={p.tag} className="flex justify-between gap-2"><span>{p.name_en}</span><span className="text-muted">{p.count}</span></li>)}</ul></>}
      <h3 className="mt-4 text-[13px] font-semibold">Dealers</h3>
      {dealers.length ? <ul className="mt-1 text-[13px] space-y-1.5">{dealers.map((d) => <li key={d.id} className="flex items-center gap-2"><Store size={15} className="text-muted" /><span className="flex-1">{d.shop}</span>{d.confirmed ? <span className="tag bg-field-100 text-field-800">Stock ready</span> : d.alerted ? <span className="tag bg-warn-50 text-warn">Alerted</span> : null}</li>)}</ul>
        : <p className="text-[13px] text-muted mt-1">No partner dealer in this tehsil yet.</p>}
      <h3 className="mt-4 text-[13px] font-semibold">Recent questions</h3>
      {qs.length ? <ul className="mt-1 divide-y divide-line text-[13px]">{qs.slice(0, 8).map((q) => <li key={q.id} className="py-1.5 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: q.emergency ? STATE_COLOR.emergency : STATE_COLOR[q.state] }} />
        <span className="flex-1 min-w-0 truncate">{q.problem || 'Not identified'}<span className="text-muted">, {CROP_EN[q.crop] || q.crop || 'crop not given'}</span></span>
        <span className="text-[11.5px] text-muted shrink-0">{timeAgo(q.at)}</span></li>)}</ul>
        : <p className="text-[13px] text-muted mt-1">No questions in this period.</p>}
    </section>
  )
}

function Control() {
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
      <PageHead title="Demo control" sub="Reset the data, fire sample questions and check the AI services" live={ws.connected} />
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

          <Evaluation />

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
              {[['/farmer', 'Farmer phones', Phone], ['/expert', 'Agronomist app', Stethoscope], ['/dealer', 'Dealer app', Store]].map(([to, t, I]: any) => <Link key={to} to={to} target="_blank" className="btn btn-quiet justify-start"><I size={17} />{t}</Link>)}
            </div>
            <Link to="/connect" target="_blank" className="btn btn-primary w-full mt-2 text-sm"><QrCode size={16} />QR codes for the phones</Link>
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

const VERDICT: Record<string, [string, string]> = {
  correct: ['Correct', 'bg-field-100 text-field-800'], over_escalated: ['Sent to a human, could have answered', 'bg-warn-50 text-warn'],
  unsafe_answer: ['Unsafe: answered, should not have', 'bg-danger text-white'], wrong_source: ['Unsafe: wrong source', 'bg-danger text-white'],
}

/** Runs the labelled question set through the live safety rules and shows the result, including every miss. */
function Evaluation() {
  const [r, setR] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async () => { setBusy(true); setErr(null); try { setR(await api('/api/admin/evaluation')) } catch (e: any) { setErr(`The evaluation did not run (${e.message}).`) } finally { setBusy(false) } }
  const misses = r?.rows.filter((x: any) => x.verdict !== 'correct') || []
  return (
    <section className="surface p-4" data-testid="evaluation">
      <div className="flex items-start gap-3">
        <div className="flex-1"><div className="font-bold flex items-center gap-2"><FlaskConical size={17} /> Safety evaluation</div>
          <div className="text-sm text-muted">Labelled farmer questions in Urdu, Punjabi and Roman Urdu, run through the same rules as a live call. Half must be answered, half must go to a human.</div></div>
        <button onClick={run} disabled={busy} className="btn btn-primary text-sm shrink-0">{busy ? <Spinner /> : <FlaskConical size={16} />}{r ? 'Run again' : 'Run evaluation'}</button>
      </div>
      {err && <div className="mt-3 text-sm rounded-xl bg-danger-50 text-danger px-3 py-2">{err}</div>}
      {r && <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
          <div className={`rounded-xl border p-3 ${r.unsafe ? 'border-danger/40 bg-danger-50' : 'border-field-200 bg-field-50'}`}><div className={`text-3xl font-extrabold ${r.unsafe ? 'text-danger' : 'text-field-800'}`} data-testid="eval-unsafe">{r.unsafe}</div><div className="text-xs text-muted mt-1">Unsafe answers</div></div>
          <div className="rounded-xl border border-line p-3"><div className="text-3xl font-extrabold">{r.correct}<span className="text-base font-semibold text-muted"> / {r.total}</span></div><div className="text-xs text-muted mt-1">Decided correctly</div></div>
          <div className="rounded-xl border border-line p-3"><div className="text-3xl font-extrabold">{r.answered_correctly}<span className="text-base font-semibold text-muted"> / {r.answer_cases}</span></div><div className="text-xs text-muted mt-1">Answerable questions answered</div></div>
          <div className="rounded-xl border border-line p-3"><div className="text-3xl font-extrabold">{r.over_escalated}</div><div className="text-xs text-muted mt-1">Sent to a human unnecessarily</div></div>
        </div>
        <p className="text-xs text-muted mt-2">Rules only, no language model, against {r.kb_entries} knowledge entries. The set is small and written by the team; it is a regression check, not a field trial.</p>
        {misses.length > 0 && <ul className="mt-3 space-y-1.5">{misses.map((x: any) => <li key={x.id} className="rounded-xl border border-line px-3 py-2 text-sm"><span className={`tag ${VERDICT[x.verdict][1]}`}>{VERDICT[x.verdict][0]}</span><div className="urdu text-[15px] !leading-[1.9] mt-1">{x.text}</div><div className="text-xs text-muted">{x.reasons.map((y: string) => REASON[y.split(':')[0]] || y).join(', ') || `answered from ${x.tag}`}</div></li>)}</ul>}
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-3 text-sm font-semibold text-field-700 flex items-center gap-1">{open ? 'Hide' : 'Show'} all {r.total} questions<ChevronDown size={15} className={open ? 'rotate-180' : ''} /></button>
        {open && <div className="mt-2 max-h-[420px] overflow-auto rounded-xl border border-line"><table className="w-full text-sm">
          <thead className="bg-field-50 text-xs text-muted sticky top-0"><tr><th className="text-left font-semibold px-3 py-2">Question</th><th className="text-left font-semibold px-3 py-2">Should</th><th className="text-left font-semibold px-3 py-2">Did</th></tr></thead>
          <tbody className="divide-y divide-line">{r.rows.map((x: any) => <tr key={x.id} className={x.verdict === 'correct' ? '' : 'bg-warn-50'}>
            <td className="px-3 py-1.5 urdu text-[14px] !leading-[1.9]">{x.text}</td>
            <td className="px-3 py-1.5 text-xs whitespace-nowrap">{x.expect === 'answer' ? 'Answer' : `Human: ${x.why}`}</td>
            <td className="px-3 py-1.5 text-xs">{x.answered ? `Answered (${x.score.toFixed(2)})` : (x.reasons.map((y: string) => REASON[y.split(':')[0]] || y).join(', '))}</td></tr>)}</tbody></table></div>}
      </>}
    </section>
  )
}
