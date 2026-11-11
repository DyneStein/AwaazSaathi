import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'

const DOORS = [
  { to: '/farmer', t: 'Farmer call', ur: 'کسان کی کال', d: 'Button-phone call simulator: choose Punjabi or Urdu, ask by voice, hear the answer.', e: '📞' },
  { to: '/expert', t: 'Expert console', ur: 'ماہرین', d: 'Junior agronomists draft, seniors review and approve, answers grow the knowledge base.', e: '🧑‍🔬' },
  { to: '/dealer', t: 'Dealer app', ur: 'ڈیلر', d: 'Outbreak alerts and "stock these products" cards on the dealer\'s phone.', e: '🏪' },
  { to: '/admin', t: 'Presenter panel', ur: 'کنٹرول', d: 'Reset, fire the outbreak scenario, offline mode, health and live feed.', e: '🎛️' },
]

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-leaf-800 to-leaf-900 text-white">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex items-center gap-4">
          <Logo size={64} />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Awaaz<span className="text-wheat">Saathi</span></h1>
            <div className="urdu text-2xl text-leaf-200 !text-left" dir="rtl">آواز ساتھی</div>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-lg text-leaf-100">A voice-first farm helpline for Punjab. The AI answers what it is sure of, verified agronomists answer the rest, and an outbreak network alerts farmers and dealers before a disease spreads.</p>
        <div className="mt-3 text-sm text-leaf-200">One brain, three doors: phone call · WhatsApp · dealer's shop</div>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {DOORS.map((d) => (
            <Link key={d.to} to={d.to} className="group rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 p-5 transition">
              <div className="flex items-center justify-between"><span className="text-3xl">{d.e}</span><span className="urdu text-xl text-wheat">{d.ur}</span></div>
              <div className="mt-2 text-xl font-bold group-hover:text-wheat transition">{d.t} →</div>
              <div className="text-sm text-leaf-200 mt-1">{d.d}</div>
            </Link>))}
        </div>
      </div>
    </div>
  )
}
