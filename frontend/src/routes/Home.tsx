import { Link } from 'react-router-dom'
import { Phone, Stethoscope, Store, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { Logo } from '../components/ui'

const DOORS = [
  { to: '/farmer', t: 'Farmer phones', ur: 'کسان', d: 'A button phone for the voice call, and a smartphone for photos, chat and video.', icon: Phone },
  { to: '/expert', t: 'Agronomist app', ur: 'ماہرین', d: 'Juniors draft, seniors approve, and approved answers join the knowledge base.', icon: Stethoscope },
  { to: '/dealer', t: 'Dealer app', ur: 'ڈیلر', d: 'Outbreak alerts, a stock checklist and local demand, on the dealer’s phone.', icon: Store },
  { to: '/admin', t: 'Demo control', ur: 'کنٹرول', d: 'Reset data, trigger the outbreak, run the safety evaluation.', icon: SlidersHorizontal },
]

export default function Home() {
  return (
    <div className="min-h-full bg-white text-ink">
      <div className="mx-auto max-w-xl px-5 py-10">
        <div className="flex items-center gap-3"><Logo size={52} /><div><div className="text-2xl font-bold">AwaazSaathi</div><div className="urdu text-muted !text-left !leading-[1.6]" dir="rtl">آواز ساتھی</div></div></div>
        <h1 className="mt-8 text-[28px] leading-tight font-bold">The AI answers what it is sure of. Agronomists answer the rest.</h1>
        <p className="mt-3 text-muted">A voice helpline for Punjab’s farmers, with verified experts and an outbreak network that alerts farmers and dealers before a disease spreads.</p>
        <ul className="mt-8 space-y-2.5">
          {DOORS.map(({ to, t, ur, d, icon: Icon }) => (
            <li key={to}><Link to={to} className="flex items-center gap-4 rounded-2xl bg-white border border-line hover:border-field-600 hover:shadow-sm p-4 transition">
              <span className="h-12 w-12 rounded-xl bg-field-50 text-field-700 border border-field-100 grid place-items-center shrink-0"><Icon size={22} /></span>
              <span className="flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="font-semibold">{t}</span><span className="urdu text-muted !leading-none">{ur}</span></span><span className="block text-sm text-muted mt-0.5">{d}</span></span>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link></li>))}
        </ul>
      </div>
    </div>
  )
}
