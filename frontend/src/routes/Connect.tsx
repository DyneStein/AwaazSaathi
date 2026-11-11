import { useEffect, useState } from 'react'
import { Phone, Stethoscope, SlidersHorizontal, Smartphone } from 'lucide-react'
import { api } from '../lib/api'
import { Logo } from '../components/ui'

/** Presenter page: QR code for the dealer's phone plus links to every screen. */
export default function Connect() {
  const [lan, setLan] = useState<any>(null)
  useEffect(() => { api('/api/lan').then(setLan).catch(() => {}) }, [])
  const base = lan?.base || location.origin
  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center gap-3"><Logo size={44} /><div><div className="text-2xl font-bold">Connect the demo</div><div className="text-muted">Phone and laptops must be on the same hotspot</div></div></div>
        <div className="mt-8 grid md:grid-cols-[320px_1fr] gap-8 items-start">
          <div className="surface p-5 text-center">
            {lan ? <img src={`/api/qr.svg?u=${encodeURIComponent(lan.dealer)}`} alt={`QR code for ${lan.dealer}`} className="w-full" /> : <div className="h-72" />}
            <div className="mt-3 font-semibold flex items-center justify-center gap-2"><Smartphone size={18} /> Scan with the dealer phone</div>
            <div className="text-sm text-muted break-all mt-1">{lan?.dealer}</div>
            <div className="text-sm text-muted mt-2">Log in: Aslam Zarai Markaz, PIN 1111</div>
          </div>
          <div className="space-y-3">
            {[['/farmer', 'Farmer helpline', Phone], ['/expert', 'Agronomist app', Stethoscope], ['/admin', 'Demo control', SlidersHorizontal]].map(([p, t, I]: any) => (
              <a key={p} href={p} target="_blank" className="surface p-4 flex items-center gap-3 hover:border-field-600"><span className="h-11 w-11 rounded-xl bg-field-50 border border-line text-field-700 grid place-items-center"><I size={20} /></span><span><span className="block font-semibold">{t}</span><span className="block text-sm text-muted">{base}{p}</span></span></a>))}
          </div>
        </div>
      </div>
    </div>
  )
}
