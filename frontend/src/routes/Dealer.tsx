import { useCallback, useEffect, useState } from 'react'
import { api, post, timeAgo } from '../lib/api'
import { beep, unlockAudio } from '../lib/audio'
import { useWS } from '../lib/ws'
import { Brand, Empty, ErrorNote, LiveDot, Spinner } from '../components/ui'

export default function Dealer() {
  const [me, setMe] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('dealer') || 'null') } catch { return null } })
  const [alerts, setAlerts] = useState<any[]>([])
  const [demand, setDemand] = useState<any[]>([])
  const [banner, setBanner] = useState<any>(null)
  const [armed, setArmed] = useState(false)
  const [tab, setTab] = useState<'alerts' | 'demand'>('alerts')

  useEffect(() => {
    // PWA: register the service worker only for the dealer app
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  const load = useCallback(() => {
    if (!me) return
    api(`/api/dealer/${me.id}/alerts`).then(setAlerts).catch(() => {})
    api('/api/dealer/demand').then(setDemand).catch(() => {})
  }, [me])
  useEffect(load, [load])

  const live = useWS(me ? ['dealer', 'outbreak', 'reset'] : [], (m) => {
    load()
    if (m.event === 'outbreak' && me && m.data.area?.includes(me.tehsil)) {
      setBanner(m.data)
      try { navigator.vibrate?.([400, 150, 400, 150, 600]) } catch { /* ignore */ }
      beep(880, 220, 4)
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('AwaazSaathi: outbreak alert', { body: `${m.data.disease_tag} in ${m.data.tehsil}. Stock up now.`, icon: '/icon.svg' }) } catch { /* ignore */ }
    }
    if (m.event === 'reset') setBanner(null)
  })

  const arm = () => {
    unlockAudio(); beep(660, 120)
    try { navigator.vibrate?.(80) } catch { /* ignore */ }
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* ignore */ }
    setArmed(true)
  }

  if (!me) return <Login onLogin={(d) => { setMe(d); localStorage.setItem('dealer', JSON.stringify(d)) }} />

  return (
    <div className="min-h-full bg-cream pb-24">
      <Brand dark app="Dealer network" right={<LiveDot on={live} />} />
      {banner && (
        <div className="fixed inset-x-3 top-3 z-50 slide-down rounded-2xl bg-alert text-white shadow-2xl p-4" onClick={() => { setBanner(null); setTab('alerts') }}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><span className="h-2 w-2 rounded-full bg-white animate-ping" /> Outbreak alert · {banner.tehsil}</div>
          <div className="urdu text-2xl font-bold mt-1">{banner.name_ur}</div>
          <div className="text-sm opacity-90">{banner.count} farmers reported it in 7 days. Stock these products now 👇</div>
        </div>)}
      <div className="px-4 pt-4 max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <div><div className="font-bold text-lg leading-tight">{me.shop}</div><div className="text-sm text-soil-500">{me.name} · {me.tehsil}</div></div>
          <button onClick={() => { localStorage.removeItem('dealer'); setMe(null) }} className="btn btn-ghost text-xs">Log out</button>
        </div>
        {!armed && <button onClick={arm} className="mt-3 w-full btn btn-wheat py-3">🔔 Enable alert sound & vibration</button>}
        <div className="flex gap-2 mt-4">
          {(['alerts', 'demand'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn flex-1 ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>{t === 'alerts' ? `Stock alerts${alerts.filter((a) => !a.confirmed_at).length ? ` (${alerts.filter((a) => !a.confirmed_at).length})` : ''}` : 'Area demand'}</button>)}
        </div>
        {tab === 'alerts' ? (
          alerts.length === 0 ? <Empty>No outbreaks near you. You will get an alert the moment one is detected.</Empty> :
            <div className="space-y-4 mt-4">{alerts.map((a) => <AlertCard key={a.id} a={a} onConfirm={load} />)}</div>
        ) : (
          <div className="card mt-4 divide-y divide-soil-200">
            <div className="px-4 py-3 text-sm text-soil-700">Farmer reports in the last 7 days, by tehsil</div>
            {demand.length === 0 ? <Empty>No reports yet</Empty> : demand.map((d) => (
              <div key={d.tehsil + d.disease_tag} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0"><div className="font-semibold">{d.tehsil} <span className="urdu text-base font-normal">· {d.tehsil_ur}</span></div><div className="text-xs text-soil-500 truncate">{d.name_en}</div></div>
                <div className="w-24 h-2 rounded-full bg-soil-100 overflow-hidden"><div className={`h-full ${d.count >= 3 ? 'bg-alert' : 'bg-leaf-500'}`} style={{ width: `${Math.min(100, d.count / 3 * 100)}%` }} /></div>
                <div className={`font-mono font-bold w-6 text-right ${d.count >= 3 ? 'text-alert' : ''}`}>{d.count}</div>
              </div>))}
          </div>
        )}
      </div>
    </div>
  )
}

function AlertCard({ a, onConfirm }: { a: any; onConfirm: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className={`card overflow-hidden fade-in ${a.confirmed_at ? '' : 'ring-2 ring-alert/40'}`}>
      <div className="bg-gradient-to-r from-alert to-orange-500 text-white px-4 py-3">
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wider"><span>⚠ Outbreak · {a.tehsil}</span><span>{timeAgo(a.created_at)}</span></div>
        <div className="urdu text-2xl font-bold">{a.name_ur}</div>
        <div className="text-sm opacity-90">{a.name_en} · {a.count} farmers · {a.distance_note}</div>
      </div>
      <div className="p-4">
        {a.weather?.humidity !== undefined && <div className="text-xs text-soil-700 mb-3">🌦 {a.tehsil} now: {a.weather.temp_c}°C, humidity {a.weather.humidity}% (Open-Meteo)</div>}
        <div className="text-sm font-bold mb-2">Stock these products</div>
        <ul className="space-y-2">{a.products.map((p: any) => (
          <li key={p.item} className="flex items-start gap-3 rounded-xl bg-soil-100/60 px-3 py-2">
            <span className="text-lg">📦</span><div><div className="font-semibold text-sm">{p.item}</div><div className="urdu text-base text-soil-700 !leading-[1.9]">{p.ur}</div></div>
          </li>))}
        </ul>
        <div className="text-[11px] text-soil-500 mt-2">Product categories only. Exact products and doses must be confirmed by an agronomist / Agriculture Dept.</div>
        {a.confirmed_at ? <div className="mt-3 chip bg-leaf-100 text-leaf-800">✓ Stock confirmed {timeAgo(a.confirmed_at)}</div> :
          <button disabled={busy} onClick={async () => { setBusy(true); await post(`/api/dealer/alerts/${a.id}/confirm`); setBusy(false); onConfirm() }} className="mt-3 w-full btn btn-primary py-3">{busy ? <Spinner /> : '✓'} I have stock ready</button>}
      </div>
    </div>
  )
}

function Login({ onLogin }: { onLogin: (d: any) => void }) {
  const [dealers, setDealers] = useState<any[]>([])
  const [id, setId] = useState<number>(1)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api('/api/dealer/list').then((d) => { setDealers(d); setId(d[0]?.id) }) }, [])
  const go = async () => { setErr(null); try { onLogin(await post('/api/dealer/login', { dealer_id: id, pin })) } catch (e: any) { setErr(e.message) } }
  return (
    <div className="min-h-full bg-leaf-800 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 max-w-sm mx-auto w-full">
        <img src="/icon.svg" className="h-20 w-20 rounded-3xl" alt="" />
        <div className="text-center"><div className="text-2xl font-extrabold">AwaazSaathi <span className="text-wheat">Dealer</span></div><div className="text-leaf-200 text-sm">Outbreak alerts & stock planning</div></div>
        <select value={id} onChange={(e) => setId(Number(e.target.value))} className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-3">
          {dealers.map((d) => <option key={d.id} value={d.id} className="text-black">{d.shop} · {d.tehsil}</option>)}
        </select>
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="PIN (demo: 1111)" className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-3 text-center text-xl tracking-[.5em] placeholder:tracking-normal placeholder:text-base" />
        <ErrorNote error={err} />
        <button onClick={go} className="w-full btn btn-wheat py-3 text-lg">Log in</button>
        <div className="text-xs text-leaf-200 text-center">Demo PINs: 1111 to 5555 in dealer order</div>
      </div>
    </div>
  )
}
