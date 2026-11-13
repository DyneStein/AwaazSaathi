import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Stethoscope, Store, Globe, Wifi, Map as MapIcon, MonitorSmartphone, Laptop, Mic, MicOff, Copy, Check } from 'lucide-react'
import { api, post } from '../lib/api'
import { ErrorNote, Logo, Segmented, Spinner } from '../components/ui'

type Net = 'lan' | 'web'

const ROLES = [
  { key: 'farmer', path: '/farmer?device=phone', title: 'Farmer', ur: 'کسان', icon: Phone, how: 'Choose a button phone or a smartphone, then call the helpline or send a photo.' },
  { key: 'expert', path: '/expert', title: 'Agronomist', ur: 'ماہر', icon: Stethoscope, how: 'Pick an account: Hamza Tariq drafts answers, Dr. Ayesha Malik approves them.' },
  { key: 'dealer', path: '/dealer', title: 'Dealer', ur: 'ڈیلر', icon: Store, how: 'Log in as Aslam Zarai Markaz with PIN 1111 and turn on alert sound.' },
] as const

/** Presenter page: QR codes that turn any phone into the farmer, agronomist or dealer app. */
export default function Connect() {
  const onTunnel = location.protocol === 'https:'
  const [lan, setLan] = useState<any>(null)
  const [tunnel, setTunnel] = useState<any>(null)
  const [net, setNet] = useState<Net>(onTunnel ? 'web' : 'lan')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    api('/api/lan').then((l) => { setLan(l); if (l.public) setNet('web') }).catch(() => {})
    api('/api/tunnel').then(setTunnel).catch(() => {})
    // The Mac may move to a phone hotspot during setup: the codes follow its new address by themselves.
    const t = setInterval(() => api('/api/lan').then((l) => setLan((old: any) => (old && old.ip === l.ip && old.secure === l.secure && old.public === l.public ? old : l))).catch(() => {}), 5000)
    const u = setInterval(() => api('/api/tunnel').then(setTunnel).catch(() => {}), 2500)
    return () => { clearInterval(t); clearInterval(u) }
  }, [])
  const publicUrl: string | null = onTunnel ? location.origin : lan?.public || tunnel?.url || null
  const lanBase: string = lan?.secure || lan?.base || location.origin
  const base = net === 'web' ? publicUrl : lanBase

  const toggle = async (on: boolean) => {
    setBusy(true); setErr(null)
    try {
      const s = await post(on ? '/api/tunnel/start' : '/api/tunnel/stop')
      setTunnel(s); setLan(await api('/api/lan'))
      if (on && !s.url && !s.keeping) setErr(s.error || 'The internet link did not start.')
    } catch (e: any) { setErr(`Could not reach the server (${e.message}).`) } finally { setBusy(false) }
  }
  const trying = !!tunnel?.keeping && !publicUrl
  const copy = (u: string) => { navigator.clipboard?.writeText(u).then(() => { setCopied(u); setTimeout(() => setCopied(null), 1500) }).catch(() => {}) }

  return (
    <div className="min-h-full bg-canvas">
      <header className="bg-field-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-6 flex flex-wrap items-end gap-x-6 gap-y-4">
          <Link to="/" className="flex items-center gap-3 flex-1 min-w-[260px]"><Logo size={44} /><span><span className="block text-[24px] font-bold leading-tight">Put the demo on phones</span><span className="block text-field-200 text-[14px]">Scan a code with any phone camera. Each phone becomes one person in the story.</span></span></Link>
          {!onTunnel && <Segmented value={net} onChange={setNet} className="w-full sm:w-[380px] !bg-white/10 [&_[aria-selected=false]]:!text-field-200" options={[['lan', <span key="l" className="inline-flex items-center gap-1.5"><Wifi size={15} />Same Wi-Fi</span>], ['web', <span key="w" className="inline-flex items-center gap-1.5"><Globe size={15} />Any network</span>]]} />}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {net === 'lan' ? (<>
          <div className="surface p-4 flex flex-wrap items-start gap-x-5 gap-y-3 border-field-200 bg-field-50" data-testid="hotspot-note">
            <Wifi size={22} className="text-field-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[260px] text-[14px]">
              <div className="font-semibold">Anywhere, with no internet: use a phone hotspot</div>
              <ol className="mt-1 list-decimal pl-5 space-y-0.5 text-muted">
                <li>Turn on the hotspot on one phone.</li>
                <li>Connect this computer and every other phone to that hotspot.</li>
                <li>The codes below update by themselves within a few seconds. Scan them again.</li>
              </ol>
              <p className="text-muted mt-1">Everything runs on this computer, so the demo needs no outside service. This computer is on <span className="font-semibold text-ink">{lan?.ip || lanBase.replace(/^https?:\/\//, '').replace(/:\d+$/, '')}</span> right now.</p>
            </div>
          </div>
          {lan?.secure ? (
          <div className="surface p-4 flex flex-wrap items-start gap-x-5 gap-y-3 mt-4" data-testid="secure-link">
            <Mic size={22} className="text-field-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[260px] text-[14px]">
              <div className="font-semibold">Secure Wi-Fi link: the microphone works on phones</div>
              <p className="text-muted mt-0.5">Phones must be on the same Wi-Fi or hotspot as this computer. The first time, the phone warns that the connection is not private, because the certificate was made on this computer, not bought. That is expected for this demo:</p>
              <ul className="mt-1.5 space-y-0.5"><li><b>Android (Chrome):</b> tap <b>Advanced</b>, then <b>Proceed to {lan.ip}</b>.</li><li><b>iPhone (Safari):</b> tap <b>Show Details</b>, then <b>visit this website</b>, then <b>Visit Website</b>.</li></ul>
              <p className="text-muted mt-1.5">If the page does not open at all, this Wi-Fi keeps devices apart (common on university and office Wi-Fi). Use a phone hotspot as above.</p>
            </div>
          </div>
          ) : (
          <div className="flex flex-wrap items-start gap-3 mt-4 text-[14px] text-muted">
            <MicOff size={18} className="text-warn mt-0.5 shrink-0" />
            <p className="flex-1 min-w-[260px]">Phones must be on the same Wi-Fi or hotspot as this computer ({lanBase.replace('http://', '')}). The secure Wi-Fi link is not running, so phone browsers block the microphone here. For speaking on the phone, use <button onClick={() => setNet('web')} className="font-semibold text-field-700 underline underline-offset-2">Any network</button>.</p>
          </div>
          )}
        </>) : (
          <div className="surface p-4 flex flex-wrap items-center gap-x-5 gap-y-3" data-testid="internet-link">
            <Globe size={22} className="text-field-700 shrink-0" />
            <div className="flex-1 min-w-[260px]">
              {publicUrl ? <><div className="font-semibold flex items-center gap-2">Internet link is on{tunnel?.provider && <span className="text-[13px] font-normal text-muted">via {tunnel.provider}{tunnel.fixed ? ', fixed address' : ', temporary address'}</span>}<Mic size={15} className="text-field-700" /></div>
                <button onClick={() => copy(publicUrl)} className="text-[14px] text-field-700 break-all text-left inline-flex items-center gap-1.5">{publicUrl}{copied === publicUrl ? <Check size={14} /> : <Copy size={14} />}</button>
                <div className="text-[12.5px] text-muted">Works from any network, including mobile data, and the microphone works. {tunnel?.fixed ? 'This address stays the same every time.' : 'It is a random address: if the link has to restart, phones must scan again.'} Anyone with it can open the demo, so share it only with the team and judges. It is kept alive in the background.</div></>
                : trying ? <><div className="font-semibold flex items-center gap-2"><Spinner />{tunnel.phase || 'Setting up the internet link'}</div>
                <div className="text-[13.5px] text-muted">Keeps trying by itself{tunnel.attempts ? ` (${tunnel.attempts} ${tunnel.attempts === 1 ? 'attempt' : 'attempts'} so far)` : ''}. The QR codes switch over the moment it is up. Meanwhile the phone hotspot works.</div>
                {tunnel.error && <div className="text-[12.5px] text-warn mt-1">{tunnel.error}</div>}</>
                : <><div className="font-semibold">Let phones join from any network</div><div className="text-[13.5px] text-muted">Optional. Makes a free https link so phones can use their own mobile data. Tools are tried in turn: ngrok (fixed address, free account; see README), then Cloudflare, then localhost.run. A phone hotspot (Same Wi-Fi tab) needs nothing outside.{tunnel && !tunnel.available && ' No tunnel tool found on the server computer: brew install cloudflared (Mac).'}</div></>}
            </div>
            {!onTunnel && (publicUrl || trying
              ? <button onClick={() => toggle(false)} disabled={busy} className="btn btn-quiet text-sm">{busy && <Spinner />}{publicUrl ? 'Turn off' : 'Stop trying'}</button>
              : <button onClick={() => toggle(true)} disabled={busy || (tunnel && !tunnel.available)} className="btn btn-primary text-sm" data-testid="tunnel-on">{busy ? <><Spinner />Starting</> : 'Turn on internet link'}</button>)}
            {err && <div className="w-full"><ErrorNote error={err} /></div>}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ROLES.map(({ key, path, title, ur, icon: Icon, how }) => {
            const url = base ? `${base}${path}` : null
            return (
              <section key={key} className="surface p-5 flex flex-col" data-testid={`qr-${key}`}>
                <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-field-800 text-white grid place-items-center"><Icon size={21} /></span>
                  <div className="flex-1"><h2 className="font-bold text-[18px] leading-tight">{title}</h2><div className="text-[13px] text-muted">Scan with phone {ROLES.findIndex((r) => r.key === key) + 1}</div></div>
                  <span className="urdu !leading-none text-[18px] text-muted">{ur}</span></div>
                <div className="mt-4 aspect-square rounded-xl border border-line bg-white grid place-items-center overflow-hidden">
                  {url ? <img src={`/api/qr.svg?u=${encodeURIComponent(url)}`} alt={`QR code for the ${title.toLowerCase()} app`} className="w-full h-full" />
                    : <span className="text-[13px] text-muted px-6 text-center">Turn on the internet link to get this code.</span>}
                </div>
                {url && <button onClick={() => copy(url)} className="mt-2 text-[12.5px] text-muted break-all text-left inline-flex items-start gap-1.5">{url}{copied === url ? <Check size={13} className="shrink-0 mt-0.5" /> : <Copy size={13} className="shrink-0 mt-0.5" />}</button>}
                <p className="mt-2 text-[13.5px]">{how}</p>
              </section>)
          })}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="surface p-5">
            <h2 className="font-bold flex items-center gap-2"><MonitorSmartphone size={18} className="text-field-700" /> On this computer</h2>
            <p className="text-[13.5px] text-muted mt-1">Everything also runs on the laptop, without phones.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/farmer?device=stage" target="_blank" className="btn btn-quiet text-sm"><Phone size={16} />Farmer, both phones</Link>
              <Link to="/expert" target="_blank" className="btn btn-quiet text-sm"><Stethoscope size={16} />Agronomist</Link>
              <Link to="/dealer" target="_blank" className="btn btn-quiet text-sm"><Store size={16} />Dealer</Link>
              <Link to="/admin" target="_blank" className="btn btn-primary text-sm"><MapIcon size={16} />Operations map</Link>
            </div>
          </section>
          <section className="surface p-5">
            <h2 className="font-bold flex items-center gap-2"><Laptop size={18} className="text-field-700" /> A teammate’s laptop</h2>
            <p className="text-[13.5px] text-muted mt-1">Windows: in the downloaded AwaazSaathi folder, double-click <b className="text-ink">AwaazSaathi-Open.bat</b>. It finds this computer on the Wi-Fi and opens every screen. <b className="text-ink">AwaazSaathi-Close.bat</b> closes them again.</p>
            <p className="text-[13.5px] text-muted mt-2">Any other computer: open <span className="text-ink font-semibold break-all">{base || lanBase}/admin</span> in Chrome.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
