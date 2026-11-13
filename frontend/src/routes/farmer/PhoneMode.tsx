import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Mic, MicOff, MonitorSmartphone, Send, Settings, Smartphone, Grid3x3, Captions } from 'lucide-react'
import { KeypadPhone, type Lcd, type PhoneKey } from '../../components/KeypadPhone'
import { LiveDot, Logo, Segmented, Sheet } from '../../components/ui'
import type { Lang } from './Chat'

export type PhoneKind = 'keypad' | 'smart'
export type PhoneSetup = { kind: PhoneKind; phone: string; subtitles: boolean }

const KEY = 'awaaz.farmerPhone'
export function readSetup(): PhoneSetup | null {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && (s.kind === 'keypad' || s.kind === 'smart') && s.phone ? { subtitles: true, ...s } : null } catch { return null }
}
export function saveSetup(s: PhoneSetup | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* private mode: setup lasts for this visit only */ }
}
/** Phone browsers only allow the microphone on https:// pages (or localhost). */
export const micAllowed = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

/** On a plain http:// Wi-Fi address, the same page on the server's secure port (null when not available). */
export function useSecureLink(): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (window.isSecureContext) return
    fetch('/api/lan').then((r) => r.json()).then((l) => { if (l.secure) setUrl(`https://${location.hostname}:${new URL(l.secure).port}${location.pathname}${location.search}`) }).catch(() => {})
  }, [])
  return url
}

/** Shown when the microphone is blocked: one tap moves to the secure link where it works. */
export function VoiceBanner({ url, dark = false }: { url: string | null; dark?: boolean }) {
  if (micAllowed()) return null
  return (
    <div className={`rounded-xl px-3 py-2.5 text-[13px] ${dark ? 'bg-white text-ink' : 'bg-warn-50 text-ink border border-warn/20'}`} data-testid="voice-banner">
      <div className="flex items-start gap-2"><MicOff size={16} className="text-warn shrink-0 mt-0.5" /><span className="flex-1">{url ? 'Voice is off on this link. Open the secure link to speak. The phone warns once: tap Advanced, then Proceed.' : 'Voice is off on this link. Ask the presenter for the secure or internet link.'}</span></div>
      {url && <a href={url} className="btn btn-primary w-full mt-2 !py-2 text-[14px]"><Mic size={16} />Turn on voice</a>}
    </div>)
}

/** First screen on a real phone: which kind of phone this farmer has, and which farmer they are. */
export function SetupScreen({ meta, initial, onDone }: { meta: any; initial: PhoneSetup | null; onDone: (s: PhoneSetup) => void }) {
  const [kind, setKind] = useState<PhoneKind | null>(initial?.kind || null)
  const secure = useSecureLink()
  const [phone, setPhone] = useState(initial?.phone || '')
  // Each judge's phone starts as a different farmer, so two phones rarely share an inbox.
  useEffect(() => { if (!phone && meta?.personas?.length) setPhone(meta.personas[Math.floor(Math.random() * meta.personas.length)].phone) }, [meta, phone])
  const persona = meta?.personas.find((p: any) => p.phone === phone)
  const Choice = ({ k, icon: Icon, title, ur, desc }: { k: PhoneKind; icon: typeof Smartphone; title: string; ur: string; desc: string }) => (
    <button onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`choose-${k}`}
      className={`w-full text-left rounded-2xl border-2 p-4 flex items-center gap-4 transition-colors ${kind === k ? 'border-field-700 bg-field-50' : 'border-line bg-white'}`}>
      <span className={`h-14 w-14 shrink-0 rounded-2xl grid place-items-center ${kind === k ? 'bg-field-800 text-white' : 'bg-field-100 text-field-800'}`}><Icon size={28} /></span>
      <span className="flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="font-bold text-[17px]">{title}</span><span className="urdu !leading-none text-[15px] text-muted">{ur}</span></span>
        <span className="block text-[13.5px] text-muted mt-1 leading-snug">{desc}</span></span>
      <span className={`h-6 w-6 shrink-0 rounded-full border-2 grid place-items-center ${kind === k ? 'border-field-700 bg-field-700 text-white' : 'border-line'}`}>{kind === k && <Check size={14} strokeWidth={3} />}</span>
    </button>)
  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col" data-testid="phone-setup">
      <header className="bg-field-900 text-white px-5 pt-6 pb-7">
        <div className="flex items-center gap-3"><Logo size={40} /><div><div className="font-bold text-lg leading-tight">AwaazSaathi</div><div className="urdu !leading-[1.5] text-[13px] text-field-200 !text-left" dir="rtl">آواز ساتھی، زرعی ہیلپ لائن</div></div></div>
        <h1 className="mt-6 text-[24px] font-bold leading-tight">Be the farmer</h1>
        <p className="mt-1 text-field-200 text-[14.5px]">This phone becomes a farmer’s phone for the demo. You can change it later in Settings.</p>
      </header>
      <main className="flex-1 px-4 py-5 space-y-6 max-w-lg w-full mx-auto">
        <VoiceBanner url={secure} />
        <section>
          <h2 className="font-bold">Which phone does the farmer have?</h2>
          <div className="mt-2.5 space-y-2.5">
            <Choice k="keypad" icon={Grid3x3} title="Button phone" ur="سادہ فون" desc="A normal voice call to the helpline. No internet, no app, no reading needed." />
            <Choice k="smart" icon={Smartphone} title="Smartphone" ur="سمارٹ فون" desc="Chat with the helpline: send a crop photo, a voice note or a typed question." />
          </div>
        </section>
        <section>
          <h2 className="font-bold">Which farmer are you?</h2>
          <p className="text-[13px] text-muted">Fictional farmers. The helpline knows each caller only by a scrambled number and their tehsil.</p>
          <select value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-2" aria-label="Farmer">
            {meta?.personas.map((p: any, i: number) => <option key={p.phone} value={p.phone}>Farmer {i + 1}, {p.tehsil}</option>)}
          </select>
          {persona?.tehsil === 'Okara' && <p className="text-[12.5px] text-field-700 mt-1.5">Okara is where the demo outbreak happens, so this farmer will get the alert.</p>}
        </section>
      </main>
      <footer className="sticky bottom-0 bg-white border-t border-line px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <button disabled={!kind || !phone} onClick={() => kind && onDone({ kind, phone, subtitles: initial?.subtitles ?? true })} className="btn btn-primary w-full !py-3.5 text-[16px]" data-testid="setup-start">
          Start<ChevronRight size={18} /></button>
      </footer>
    </div>
  )
}

/** Settings sheet: switch phone type, farmer, language and subtitles at any time. */
export function SettingsSheet({ meta, setup, lang, inCall, onLang, onChange, onRestart, onClose }: {
  meta: any; setup: PhoneSetup; lang: Lang; inCall: boolean; onLang: (l: Lang) => void; onChange: (s: PhoneSetup) => void; onRestart: () => void; onClose: () => void
}) {
  const secure = useSecureLink()
  const Row = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => <div className="py-3.5 border-b border-line last:border-0"><div className="font-semibold">{title}</div>{sub && <div className="text-[12.5px] text-muted">{sub}</div>}<div className="mt-2">{children}</div></div>
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div dir="ltr" data-testid="phone-settings">
        <Row title="Phone type" sub={inCall ? 'Switching ends the call in progress.' : 'Switch between the two ways farmers reach the helpline.'}>
          <Segmented value={setup.kind} onChange={(k) => onChange({ ...setup, kind: k })} options={[['keypad', 'Button phone'], ['smart', 'Smartphone']]} />
        </Row>
        <Row title="Farmer">
          <select value={setup.phone} onChange={(e) => onChange({ ...setup, phone: e.target.value })} disabled={inCall} className="field" aria-label="Farmer">
            {meta?.personas.map((p: any, i: number) => <option key={p.phone} value={p.phone}>Farmer {i + 1}, {p.tehsil}</option>)}
          </select>
        </Row>
        <Row title="Language" sub={setup.kind === 'keypad' ? 'The call also asks for it: 1 Punjabi, 2 Urdu.' : undefined}>
          <div role="group" aria-label="Language" className={`flex rounded-xl bg-field-100/70 p-1 ${inCall ? 'opacity-50 pointer-events-none' : ''}`}>
            {(['pa', 'ur'] as Lang[]).map((l) => <button key={l} onClick={() => onLang(l)} aria-pressed={lang === l} className={`flex-1 urdu !leading-none !text-center py-2 rounded-lg text-[14px] ${lang === l ? 'bg-white shadow-sm text-field-900 font-bold' : 'text-muted'}`}>{l === 'ur' ? 'اردو' : 'پنجابی'}</button>)}
          </div>
        </Row>
        {setup.kind === 'keypad' && <Row title="Subtitles" sub="Show what the helpline says under the phone, for the audience.">
          <button role="switch" aria-checked={setup.subtitles} onClick={() => onChange({ ...setup, subtitles: !setup.subtitles })} className={`relative h-7 w-12 rounded-full transition-colors ${setup.subtitles ? 'bg-field-700' : 'bg-line'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${setup.subtitles ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </Row>}
        <Row title="Microphone" sub={micAllowed() ? 'Available. Speak after the beep.' : 'Phone browsers allow the microphone only on secure (https) links.'}>
          {micAllowed() ? <span className="tag bg-field-100 text-field-800"><Mic size={13} />On</span> : <VoiceBanner url={secure} />}
        </Row>
        <div className="pt-4 grid gap-2">
          <button onClick={onRestart} className="btn btn-quiet w-full">Start setup again</button>
          <Link to="/farmer?device=stage" className="btn btn-quiet w-full"><MonitorSmartphone size={17} />Presenter view (both phones)</Link>
        </div>
      </div>
    </Sheet>
  )
}

/** The button phone filling a real phone's screen, with a fallback for when the browser blocks the microphone. */
export function KeypadScreen({ lcd, onKey, ringing, clock, connected, onSettings, askOpen, recording, note, samples, onSample, onTyped, subtitle }: {
  lcd: Lcd; onKey: (k: PhoneKey) => void; ringing: boolean; clock: string; connected: boolean; onSettings: () => void
  askOpen: boolean; recording: boolean; note: string | null; samples: [string, string, string][]; onSample: (transcript: string) => void; onTyped: (t: string) => void
  subtitle: { ur?: string; en?: string } | null
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [pick, setPick] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    const fit = () => { const el = wrap.current; if (!el) return; setScale(Math.max(0.7, Math.min(1.35, (el.clientWidth - 24) / 290, (el.clientHeight - 12) / 600))) }
    fit(); const ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current); return () => ro.disconnect()
  }, [])
  useEffect(() => { if (!askOpen) setPick(false) }, [askOpen])
  const noMic = !micAllowed()
  const secure = useSecureLink()
  return (
    <div className="relative h-[100dvh] flex flex-col bg-[radial-gradient(120%_80%_at_50%_0%,#123F2C_0%,#082E20_55%,#061F16_100%)] text-white overflow-hidden" data-testid="keypad-screen">
      <header className="shrink-0 flex items-center gap-2.5 px-4 pt-[max(.6rem,env(safe-area-inset-top))] pb-1">
        <Logo size={28} /><span className="flex-1 text-[14px] font-semibold">Farmer’s button phone</span>
        <LiveDot on={connected} />
        <button onClick={onSettings} aria-label="Settings" className="p-2 -mr-2 rounded-lg hover:bg-white/10"><Settings size={21} /></button>
      </header>
      <div ref={wrap} className="flex-1 min-h-0 grid place-items-center">
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}><KeypadPhone lcd={lcd} onKey={onKey} ringing={ringing} clock={clock} /></div>
      </div>
      <div className="shrink-0 px-4 pb-[max(.8rem,env(safe-area-inset-bottom))] pt-1 space-y-2 min-h-[64px]">
        {noMic && !askOpen && <VoiceBanner url={secure} dark />}
        {note && <div role="alert" className="text-[13px] rounded-xl bg-warn-50 text-warn px-3 py-2">{note}</div>}
        {askOpen ? <>
          {recording && <p className="text-center text-[13px] text-white flex items-center justify-center gap-1.5"><Mic size={14} className="text-[#F97066]" />Listening. Speak, then press any key.</p>}
          <button onClick={() => setPick(true)} data-testid="pick-question" className={`btn w-full ${noMic ? 'bg-white text-field-900' : 'bg-white/10 text-white border border-white/20'}`}>{noMic ? <MicOff size={17} /> : <Mic size={17} />}{noMic ? 'Microphone blocked on this link: choose a question' : 'Or choose a question instead of speaking'}</button>
        </>
          : subtitle?.ur ? <div className="rounded-xl bg-black/25 px-3 py-2" aria-live="polite"><div className="flex items-center gap-1.5 text-[11px] text-field-200"><Captions size={13} />Helpline</div><div className="urdu text-[15px] !leading-[1.95] line-clamp-2">{subtitle.ur}</div>{subtitle.en && <div className="text-[12px] text-field-200 line-clamp-2">{subtitle.en}</div>}</div>
            : <p className="text-center text-[13px] text-field-200">{recording ? 'Listening. Press any key when you finish.' : 'Press the green key to call the helpline.'}</p>}
      </div>
      {pick && <div className="absolute inset-0 z-40 text-ink"><Sheet title="Choose the farmer’s question" onClose={() => setPick(false)}>
        <div dir="ltr" className="space-y-2">
          <p className="text-[13px] text-muted">{noMic ? 'This page is on a local http:// link, where phone browsers block the microphone. On the https internet link you can speak instead.' : 'Sends the question as if the farmer had said it.'}</p>
          {samples.map(([k, label, t]) => <button key={k} onClick={() => { setPick(false); onSample(t) }} data-testid={`phone-sample-${k}`} className="w-full text-left rounded-xl border border-line px-3 py-2.5 hover:border-field-600">
            <span className="block text-[13px] font-semibold">{label}</span><span className="block urdu text-[15px] !leading-[1.9] text-muted">{t}</span></button>)}
          <div className="flex gap-2 pt-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} dir="rtl" placeholder="یا اپنا سوال لکھیں" aria-label="Type the farmer’s question" className="field urdu !leading-normal" />
            <button disabled={!typed.trim()} onClick={() => { setPick(false); onTyped(typed.trim()); setTyped('') }} aria-label="Send typed question" className="btn btn-primary !px-3"><Send size={17} /></button>
          </div>
        </div>
      </Sheet></div>}
    </div>
  )
}
