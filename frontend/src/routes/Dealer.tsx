import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, Store, CloudSun, Check, BellRing, LogOut, MapPin, Users, House, ChevronRight, Square, SquareCheck, Volume2, ShieldCheck, Droplets } from 'lucide-react'
import { api, post, timeAgo } from '../lib/api'
import { beep, unlockAudio } from '../lib/audio'
import { useWS } from '../lib/ws'
import { AppBar, AppShell, Empty, ErrorNote, LiveDot, Segmented, Spinner, Stat } from '../components/ui'

export default function Dealer() {
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('dealer') || 'null') } catch { return null } })
  const [alerts, setAlerts] = useState<any[]>([])
  const [demand, setDemand] = useState<any[]>([])
  const [overview, setOverview] = useState<any>(null)
  const [banner, setBanner] = useState<any>(null)
  const [armed, setArmed] = useState(false)
  const [tab, setTab] = useState('home')
  const [scope, setScope] = useState<'area' | 'all'>('area')

  useEffect(() => { if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {}) }, [])
  const load = useCallback(() => {
    if (!me) return
    api(`/api/dealer/${me.id}/alerts`).then(setAlerts).catch(() => {})
    api('/api/dealer/demand').then(setDemand).catch(() => {})
    api(`/api/dealer/${me.id}/overview`).then(setOverview).catch(() => {})
  }, [me])
  useEffect(load, [load])

  const ws = useWS(me ? ['dealer', 'outbreak', 'reset'] : [], (m) => {
    load()
    if (m.event === 'outbreak' && me && m.data.area?.includes(me.tehsil)) {
      setBanner(m.data); setTab('alerts')
      try { navigator.vibrate?.([400, 150, 400, 150, 600]) } catch { /* ignore */ }
      beep(880, 220, 4)
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Outbreak alert', { body: `${m.data.tehsil}: check what to stock`, icon: '/icon-dealer.svg' }) } catch { /* ignore */ }
      setTimeout(() => setBanner(null), 9000)
    }
    if (m.event === 'reset') setBanner(null)
  })
  const arm = () => { unlockAudio(); beep(660, 120); try { navigator.vibrate?.(80) } catch { /* ignore */ } try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* ignore */ } setArmed(true) }

  if (!me) return <Login onLogin={(d) => { setMe(d); localStorage.setItem('dealer', JSON.stringify(d)); setTab('home') }} />
  const pending = alerts.filter((a) => !a.confirmed_at)
  const area: string[] = overview?.area || [me.tehsil]
  const shown = scope === 'area' ? demand.filter((d) => area.includes(d.tehsil)) : demand
  const titles: Record<string, string> = { home: me.shop, alerts: 'Outbreak alerts', demand: 'Farmer demand', shop: 'My shop' }

  return (
    <AppShell active={tab} onTab={setTab}
      tabs={[{ key: 'home', label: 'Home', icon: House }, { key: 'alerts', label: 'Alerts', icon: BellRing, badge: pending.length }, { key: 'demand', label: 'Demand', icon: BarChart3 }, { key: 'shop', label: 'My shop', icon: Store }]}
      header={<AppBar logo="/icon-dealer.svg" title={titles[tab]} subtitle={tab === 'home' ? `${me.tehsil} dealer network` : me.shop} right={<LiveDot on={ws.connected} />} />}
      overlay={banner && (
        <button onClick={() => setBanner(null)} data-testid="outbreak-banner" className="absolute inset-x-3 top-9 z-50 drop-in rounded-2xl bg-danger text-white shadow-2xl p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={17} /> Outbreak near you: {banner.tehsil}</div>
          <div className="urdu text-[22px] font-bold !text-left !leading-[2.5]" dir="rtl">{banner.name_ur}</div>
          <div className="text-sm text-white/90">{banner.count} farmers reported it this week. Check what to stock.</div>
        </button>)}>

      {tab === 'home' && <div className="p-4 space-y-4">
        {pending.length > 0
          ? <button onClick={() => setTab('alerts')} className="w-full text-left rounded-2xl bg-danger text-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} /> Needs your action</div>
            <div className="text-[22px] font-extrabold leading-tight mt-1">{pending.length === 1 ? 'An outbreak near you' : `${pending.length} outbreaks near you`}</div>
            <div className="text-sm text-white/90 mt-0.5">{pending[0].name_en} in {pending[0].tehsil}, {pending[0].count} farmers</div>
            <div className="flex items-center text-sm font-semibold mt-3">See what to stock<ChevronRight size={16} className="ml-auto" /></div>
          </button>
          : <div className="rounded-2xl bg-field-900 text-white p-4">
            <div className="flex items-center gap-2 text-sm text-field-200"><ShieldCheck size={16} /> {alerts.length ? 'All alerts handled' : 'All clear'}</div>
            <div className="text-[22px] font-extrabold leading-tight mt-1">No outbreak needs you</div>
            <div className="text-sm text-field-200 mt-0.5">You are alerted the moment three farmers in your area report the same problem.</div>
          </div>}
        {!armed && <button onClick={arm} className="btn btn-accent w-full"><BellRing size={18} /> Turn on alert sound and vibration</button>}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={overview?.farmers_reporting ?? '…'} label="Farmers reporting this week" tone={overview?.farmers_reporting ? 'warn' : 'plain'} />
          <Stat value={overview?.farmers_in_area ?? '…'} label="Farmers in your area" />
          <Stat value={area.length} label="Tehsils you cover" />
        </div>
        {overview?.weather?.temp_c !== undefined && <div className="surface p-4 flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-field-50 border border-line text-field-700 grid place-items-center shrink-0"><CloudSun size={22} /></span>
          <div className="flex-1"><div className="font-semibold">{me.tehsil} today</div><div className="text-sm text-muted flex items-center gap-3"><span>{Math.round(overview.weather.temp_c)}°C</span><span className="flex items-center gap-1"><Droplets size={13} />{overview.weather.humidity}% humidity</span><span>{overview.weather.rain_chance ?? 0}% rain</span></div></div>
        </div>}
        <div>
          <div className="flex items-center justify-between mb-2"><h2 className="font-bold">What farmers near you report</h2><button onClick={() => { setTab('demand'); setScope('area') }} className="text-sm font-semibold text-field-700">See all</button></div>
          <DemandList rows={demand.filter((d) => area.includes(d.tehsil)).slice(0, 3)} empty="No reports from your area in the last 7 days." />
        </div>
      </div>}

      {tab === 'alerts' && (alerts.length === 0
        ? <Empty icon={BellRing} title="No outbreaks near you">You will be alerted the moment farmers around {me.tehsil} report a spreading problem.</Empty>
        : <div className="p-4 space-y-4">{alerts.map((a) => <AlertCard key={a.id} a={a} onChange={load} />)}</div>)}

      {tab === 'demand' && <div className="p-4 space-y-3">
        <Segmented value={scope} onChange={setScope} options={[['area', 'My area'], ['all', 'All tehsils']]} />
        <p className="text-sm text-muted">Farmers reporting each problem in the last 7 days. Three in one tehsil sends an outbreak alert.</p>
        <DemandList rows={shown} empty={scope === 'area' ? 'No reports from your area yet. Switch to all tehsils to see the wider picture.' : 'No reports yet.'} />
      </div>}

      {tab === 'shop' && <div className="p-4 space-y-3">
        <div className="surface p-4 flex items-center gap-3"><span className="h-12 w-12 rounded-xl bg-field-800 text-white grid place-items-center"><Store size={22} /></span><div><div className="font-bold">{me.shop}</div><div className="text-sm text-muted">{me.name}, {me.tehsil}</div></div></div>
        <div className="surface p-4">
          <div className="font-semibold flex items-center gap-2"><MapPin size={16} className="text-field-700" />Your alert area</div>
          <div className="text-sm text-muted mt-1">Alerts reach you for your own tehsil and its neighbours.</div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">{area.map((t, i) => <span key={t} className={`tag py-1 px-2.5 ${i === 0 ? 'bg-field-800 text-white' : 'bg-field-50 border border-line'}`}>{t}</span>)}</div>
        </div>
        <div className="surface divide-y divide-line">
          <div className="p-4 flex items-center gap-3"><Volume2 size={18} className="text-field-700 shrink-0" /><div className="flex-1"><div className="font-semibold">Alert sound and vibration</div><div className="text-sm text-muted">{armed ? 'On for this session' : 'Off until you turn it on'}</div></div>
            <button onClick={arm} role="switch" aria-checked={armed} aria-label="Alert sound and vibration" className={`h-7 w-12 rounded-full p-0.5 transition-colors ${armed ? 'bg-field-700' : 'bg-line'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${armed ? 'translate-x-5' : ''}`} /></button></div>
          <button onClick={() => { unlockAudio(); beep(880, 220, 4); try { navigator.vibrate?.([400, 150, 400]) } catch { /* ignore */ } }} className="w-full p-4 flex items-center gap-3 text-left"><BellRing size={18} className="text-field-700 shrink-0" /><div className="flex-1"><div className="font-semibold">Play a test alert</div><div className="text-sm text-muted">Hear what an outbreak alert sounds like</div></div><ChevronRight size={16} className="text-muted" /></button>
        </div>
        <div className="surface p-4 text-sm text-muted">Alerts list input categories only. Exact products and doses are confirmed by an agronomist or the Agriculture Department.</div>
        <button onClick={() => { localStorage.removeItem('dealer'); setMe(null) }} className="btn btn-quiet w-full"><LogOut size={17} /> Log out</button>
      </div>}
    </AppShell>
  )
}

function DemandList({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows.length) return <div className="surface p-4 text-sm text-muted">{empty}</div>
  return (
    <ul className="surface divide-y divide-line" data-testid="demand-list">{rows.map((d) => (
      <li key={d.tehsil + d.disease_tag} className="px-4 py-3">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold">{d.name_en}</span><span className={`font-bold whitespace-nowrap ${d.count >= 3 ? 'text-danger' : ''}`}>{d.count} {d.count === 1 ? 'farmer' : 'farmers'}</span></div>
        <div className="text-xs text-muted mb-1.5 flex items-center gap-1"><MapPin size={12} />{d.tehsil}</div>
        <div className="flex gap-1" aria-label={`${d.count} of 3 reports needed for an alert`}>{[0, 1, 2].map((i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${i < d.count ? (d.count >= 3 ? 'bg-danger' : 'bg-field-600') : 'bg-line'}`} />)}</div>
      </li>))}</ul>
  )
}

function AlertCard({ a, onChange }: { a: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<any[]>(a.products)
  useEffect(() => setItems(a.products), [a.products])
  const done = !!a.confirmed_at
  const ready = items.filter((p) => p.ready).length
  const tick = async (i: number) => {
    if (done) return
    const next = items.map((p, j) => (j === i ? { ...p, ready: !p.ready } : p)); setItems(next)
    try { await post(`/api/dealer/alerts/${a.id}/item`, { index: i, ready: next[i].ready }) } catch { setItems(items) }
  }
  return (
    <article className={`surface overflow-hidden ${done ? '' : 'border-danger/40'}`} data-testid="alert-card">
      <div className={`${done ? 'bg-field-800' : 'bg-danger'} text-white px-4 py-3`}>
        <div className="flex justify-between items-center text-sm"><span className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Outbreak in {a.tehsil}{a.distance_note !== 'same tehsil' ? ' (neighbouring tehsil)' : ''}</span><span className="text-white/80 text-xs">{timeAgo(a.created_at)}</span></div>
        <div className="urdu text-[22px] font-bold !text-left !leading-[2.5]" dir="rtl">{a.name_ur}</div>
        <div className="text-sm text-white/90 flex items-center gap-3"><span>{a.name_en}</span><span className="flex items-center gap-1"><Users size={13} />{a.count} farmers</span></div>
      </div>
      <div className="p-4">
        {a.weather?.humidity !== undefined && <div className="text-xs text-muted mb-3 flex items-center gap-1.5"><CloudSun size={14} /> {a.tehsil} now: {Math.round(a.weather.temp_c)}°C, humidity {a.weather.humidity}%</div>}
        <div className="flex items-baseline justify-between mb-2"><span className="font-semibold">Farmers will ask for</span><span className="text-xs text-muted">{ready} of {items.length} in stock</span></div>
        <ul className="space-y-2">{items.map((p: any, i: number) => (
          <li key={p.item}><button onClick={() => tick(i)} disabled={done} role="checkbox" aria-checked={!!p.ready} className={`w-full text-left flex items-start gap-3 rounded-xl border px-3 py-2.5 ${p.ready ? 'bg-field-100 border-field-200' : 'bg-field-50 border-line'}`}>
            {p.ready ? <SquareCheck size={20} className="text-field-700 mt-0.5 shrink-0" /> : <Square size={20} className="text-muted mt-0.5 shrink-0" />}
            <div><div className="font-semibold text-sm">{p.item}</div><div className="urdu text-[15px] text-muted !leading-[1.9]">{p.ur}</div></div>
          </button></li>))}</ul>
        <p className="text-[11px] text-muted mt-2">Categories only. Exact products and doses come from an agronomist or the Agriculture Department.</p>
        {done ? <div className="tag bg-field-100 text-field-800 mt-3"><Check size={13} /> Stock confirmed {timeAgo(a.confirmed_at)}</div>
          : <button disabled={busy} onClick={async () => { setBusy(true); await post(`/api/dealer/alerts/${a.id}/confirm`).catch(() => {}); setBusy(false); onChange() }} className="btn btn-primary w-full mt-3">{busy ? <Spinner /> : <Check size={18} />} Confirm stock is ready</button>}
      </div>
    </article>
  )
}

function Login({ onLogin }: { onLogin: (d: any) => void }) {
  const [dealers, setDealers] = useState<any[]>([])
  const [id, setId] = useState(1)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/api/dealer/list').then((d) => { setDealers(d); setId(d[0]?.id) }) }, [])
  const go = async () => {
    setErr(null); setBusy(true)
    try { onLogin(await post('/api/dealer/login', { dealer_id: id, pin })) }
    catch (e: any) { setErr(e.message === 'Wrong PIN' ? 'That PIN does not match this shop. Demo PINs are 1111 to 5555.' : `Could not log in (${e.message}).`) } finally { setBusy(false) }
  }
  return (
    <AppShell header={<AppBar logo="/icon-dealer.svg" title="AwaazSaathi Dealers" subtitle="Outbreak alerts and stock planning" />}>
      <div className="p-5 space-y-4">
        <div className="flex flex-col items-center pt-6 pb-4"><img src="/icon-dealer.svg" className="h-16 w-16 rounded-2xl" alt="" /><div className="font-bold text-xl mt-3">Log in to your shop</div><div className="text-sm text-muted mt-1 text-center">Know what farmers near you will need before they come asking.</div></div>
        <label className="block text-sm font-semibold">Shop<select value={id} onChange={(e) => setId(Number(e.target.value))} className="field mt-1 font-normal">{dealers.map((d) => <option key={d.id} value={d.id}>{d.shop}, {d.tehsil}</option>)}</select></label>
        <label className="block text-sm font-semibold">PIN<input value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" type="password" maxLength={4} placeholder="4 digits" className="field mt-1 text-lg tracking-[.4em]" /></label>
        <ErrorNote error={err} />
        <button onClick={go} disabled={busy || pin.length < 4} className="btn btn-primary w-full">{busy && <Spinner />} Log in</button>
        <p className="text-xs text-muted text-center">Demo: Aslam Zarai Markaz, PIN 1111</p>
      </div>
    </AppShell>
  )
}
