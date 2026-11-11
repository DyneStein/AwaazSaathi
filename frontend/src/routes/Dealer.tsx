import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, Store, Package, CloudSun, Check, BellRing, LogOut, MapPin, Users } from 'lucide-react'
import { api, post, timeAgo } from '../lib/api'
import { beep, unlockAudio } from '../lib/audio'
import { useWS } from '../lib/ws'
import { AppBar, AppShell, Empty, ErrorNote, LiveDot, Spinner } from '../components/ui'

export default function Dealer() {
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('dealer') || 'null') } catch { return null } })
  const [alerts, setAlerts] = useState<any[]>([])
  const [demand, setDemand] = useState<any[]>([])
  const [banner, setBanner] = useState<any>(null)
  const [armed, setArmed] = useState(false)
  const [tab, setTab] = useState('alerts')

  useEffect(() => { if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {}) }, [])
  const load = useCallback(() => {
    if (!me) return
    api(`/api/dealer/${me.id}/alerts`).then(setAlerts).catch(() => {})
    api('/api/dealer/demand').then(setDemand).catch(() => {})
  }, [me])
  useEffect(load, [load])

  const ws = useWS(me ? ['dealer', 'outbreak', 'reset'] : [], (m) => {
    load()
    if (m.event === 'outbreak' && me && m.data.area?.includes(me.tehsil)) {
      setBanner(m.data); setTab('alerts')
      try { navigator.vibrate?.([400, 150, 400, 150, 600]) } catch { /* ignore */ }
      beep(880, 220, 4)
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Outbreak alert', { body: `${m.data.tehsil}: stock up now`, icon: '/icon.svg' }) } catch { /* ignore */ }
      setTimeout(() => setBanner(null), 9000)
    }
    if (m.event === 'reset') setBanner(null)
  })
  const arm = () => { unlockAudio(); beep(660, 120); try { navigator.vibrate?.(80) } catch { /* ignore */ } try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* ignore */ } setArmed(true) }

  if (!me) return <Login onLogin={(d) => { setMe(d); localStorage.setItem('dealer', JSON.stringify(d)) }} />
  const pending = alerts.filter((a) => !a.confirmed_at).length

  return (
    <AppShell active={tab} onTab={setTab}
      tabs={[{ key: 'alerts', label: 'Alerts', icon: BellRing, badge: pending }, { key: 'demand', label: 'Area demand', icon: BarChart3 }, { key: 'shop', label: 'My shop', icon: Store }]}
      header={<AppBar logo="/icon-dealer.svg" title={me.shop} subtitle={`${me.tehsil} dealer network`} right={<LiveDot on={ws.connected} />} />}
      overlay={banner && (
        <button onClick={() => setBanner(null)} className="absolute inset-x-3 top-3 z-50 drop-in rounded-2xl bg-danger text-white shadow-2xl p-4 text-left">
          <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={17} /> Outbreak near you: {banner.tehsil}</div>
          <div className="urdu text-[24px] font-bold !text-left !leading-[1.9]" dir="rtl">{banner.name_ur}</div>
          <div className="text-sm text-white/90">{banner.count} farmers reported it this week. Check the stock list.</div>
        </button>)}>
      {!armed && tab === 'alerts' && <div className="px-4 pt-4"><button onClick={arm} className="btn btn-accent w-full"><BellRing size={18} /> Turn on alert sound and vibration</button></div>}
      {tab === 'alerts' && (alerts.length === 0
        ? <Empty icon={BellRing} title="No outbreaks near you">You will be alerted the moment farmers around {me.tehsil} report a spreading problem.</Empty>
        : <div className="p-4 space-y-4">{alerts.map((a) => <AlertCard key={a.id} a={a} onConfirm={load} />)}</div>)}
      {tab === 'demand' && (
        <div className="p-4">
          <p className="text-sm text-muted mb-3">Farmers reporting each problem in the last 7 days. Three or more in one tehsil triggers an outbreak alert.</p>
          {demand.length === 0 ? <Empty icon={BarChart3} title="No reports yet" /> : <ul className="surface divide-y divide-line">{demand.map((d) => (
            <li key={d.tehsil + d.disease_tag} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold flex items-center gap-1.5"><MapPin size={14} className="text-muted" />{d.tehsil}</span><span className={`font-bold ${d.count >= 3 ? 'text-danger' : ''}`}>{d.count} farmers</span></div>
              <div className="text-xs text-muted mb-1.5">{d.name_en}</div>
              <div className="h-1.5 rounded-full bg-line"><div className={`h-full rounded-full ${d.count >= 3 ? 'bg-danger' : 'bg-field-600'}`} style={{ width: `${Math.min(100, (d.count / 3) * 100)}%` }} /></div>
            </li>))}</ul>}
        </div>)}
      {tab === 'shop' && (
        <div className="p-4 space-y-3">
          <div className="surface p-4 flex items-center gap-3"><span className="h-12 w-12 rounded-xl bg-field-800 text-white grid place-items-center"><Store size={22} /></span><div><div className="font-bold">{me.shop}</div><div className="text-sm text-muted">{me.name}, {me.tehsil}</div></div></div>
          <div className="surface p-4 text-sm text-muted">AwaazSaathi alerts you when an outbreak is detected in your tehsil or a neighbouring one, with the input categories farmers will need. Exact products are confirmed by agronomists.</div>
          <button onClick={() => { localStorage.removeItem('dealer'); setMe(null) }} className="btn btn-quiet w-full"><LogOut size={17} /> Log out</button>
        </div>)}
    </AppShell>
  )
}

function AlertCard({ a, onConfirm }: { a: any; onConfirm: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <article className={`surface overflow-hidden ${a.confirmed_at ? '' : 'border-danger/40'}`}>
      <div className="bg-danger text-white px-4 py-3">
        <div className="flex justify-between items-center text-sm"><span className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Outbreak in {a.tehsil}</span><span className="text-white/80 text-xs">{timeAgo(a.created_at)}</span></div>
        <div className="urdu text-[24px] font-bold !text-left !leading-[1.9]" dir="rtl">{a.name_ur}</div>
        <div className="text-sm text-white/90 flex items-center gap-3"><span>{a.name_en}</span><span className="flex items-center gap-1"><Users size={13} />{a.count} farmers</span></div>
      </div>
      <div className="p-4">
        {a.weather?.humidity !== undefined && <div className="text-xs text-muted mb-3 flex items-center gap-1.5"><CloudSun size={14} /> {a.tehsil} now: {a.weather.temp_c}°C, humidity {a.weather.humidity}%</div>}
        <div className="font-semibold mb-2">Stock these</div>
        <ul className="space-y-2">{a.products.map((p: any) => (
          <li key={p.item} className="flex items-start gap-3 rounded-xl bg-field-50 border border-line px-3 py-2.5">
            <Package size={18} className="text-field-700 mt-0.5 shrink-0" /><div><div className="font-semibold text-sm">{p.item}</div><div className="urdu text-[15px] text-muted !leading-[1.9]">{p.ur}</div></div>
          </li>))}</ul>
        <p className="text-[11px] text-muted mt-2">Input categories only. Exact products and doses are confirmed by an agronomist or the Agriculture Department.</p>
        {a.confirmed_at ? <div className="tag bg-field-100 text-field-800 mt-3"><Check size={13} /> Stock confirmed {timeAgo(a.confirmed_at)}</div>
          : <button disabled={busy} onClick={async () => { setBusy(true); await post(`/api/dealer/alerts/${a.id}/confirm`); setBusy(false); onConfirm() }} className="btn btn-primary w-full mt-3">{busy ? <Spinner /> : <Check size={18} />} Confirm stock is ready</button>}
      </div>
    </article>
  )
}

function Login({ onLogin }: { onLogin: (d: any) => void }) {
  const [dealers, setDealers] = useState<any[]>([])
  const [id, setId] = useState(1)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api('/api/dealer/list').then((d) => { setDealers(d); setId(d[0]?.id) }) }, [])
  const go = async () => { setErr(null); try { onLogin(await post('/api/dealer/login', { dealer_id: id, pin })) } catch (e: any) { setErr(e.message === 'Wrong PIN' ? 'That PIN does not match this shop. Demo PINs are 1111 to 5555.' : e.message) } }
  return (
    <AppShell header={<AppBar logo="/icon-dealer.svg" title="AwaazSaathi Dealers" subtitle="Outbreak alerts and stock planning" />}>
      <div className="p-5 space-y-4">
        <div className="flex flex-col items-center py-6"><img src="/icon-dealer.svg" className="h-16 w-16 rounded-2xl" alt="" /><div className="text-sm text-muted mt-3 text-center">Know what farmers near you will need before they come asking.</div></div>
        <label className="block text-sm font-semibold">Shop<select value={id} onChange={(e) => setId(Number(e.target.value))} className="field mt-1 font-normal">{dealers.map((d) => <option key={d.id} value={d.id}>{d.shop}, {d.tehsil}</option>)}</select></label>
        <label className="block text-sm font-semibold">PIN<input value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="numeric" type="password" placeholder="4 digits" className="field mt-1 text-lg tracking-[.4em]" /></label>
        <ErrorNote error={err} />
        <button onClick={go} className="btn btn-primary w-full">Log in</button>
        <p className="text-xs text-muted text-center">Demo: Aslam Zarai Markaz, PIN 1111</p>
      </div>
    </AppShell>
  )
}
