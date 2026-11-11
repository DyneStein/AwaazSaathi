import { Link } from 'react-router-dom'
import { Phone, Stethoscope, Store, SlidersHorizontal, ChevronRight } from 'lucide-react'
import { Logo } from '../components/ui'

const DOORS = [
  { to: '/farmer', t: 'Farmer helpline', ur: 'کسان', d: 'Call from any phone, choose Punjabi or Urdu, ask by voice, hear the answer.', icon: Phone },
  { to: '/expert', t: 'Agronomist app', ur: 'ماہرین', d: 'Juniors draft, seniors approve. Approved answers teach the AI.', icon: Stethoscope },
  { to: '/dealer', t: 'Dealer app', ur: 'ڈیلر', d: 'Outbreak alerts and what to stock, on the dealer’s phone.', icon: Store },
  { to: '/admin', t: 'Demo control', ur: 'کنٹرول', d: 'Reset data, trigger the outbreak, switch to offline mode.', icon: SlidersHorizontal },
]

export default function Home() {
  return (
    <div className="min-h-full bg-field-900 text-white">
      <div className="mx-auto max-w-xl px-5 py-10">
        <div className="flex items-center gap-3"><Logo size={52} /><div><div className="text-2xl font-bold">AwaazSaathi</div><div className="urdu text-field-200 !text-left !leading-[1.6]" dir="rtl">آواز ساتھی</div></div></div>
        <h1 className="mt-8 text-[28px] leading-tight font-bold">The AI answers what it is sure of. Agronomists answer the rest.</h1>
        <p className="mt-3 text-field-200">A voice helpline for Punjab’s farmers, with verified experts and an outbreak network that alerts farmers and dealers before a disease spreads.</p>
        <ul className="mt-8 space-y-2.5">
          {DOORS.map(({ to, t, ur, d, icon: Icon }) => (
            <li key={to}><Link to={to} className="flex items-center gap-4 rounded-2xl bg-white/[.06] hover:bg-white/[.1] border border-white/10 p-4 transition">
              <span className="h-12 w-12 rounded-xl bg-mustard text-field-950 grid place-items-center shrink-0"><Icon size={22} /></span>
              <span className="flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="font-semibold">{t}</span><span className="urdu text-field-200 !leading-none">{ur}</span></span><span className="block text-sm text-field-200 mt-0.5">{d}</span></span>
              <ChevronRight size={18} className="text-field-200 shrink-0" />
            </Link></li>))}
        </ul>
      </div>
    </div>
  )
}
