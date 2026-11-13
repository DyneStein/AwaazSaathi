import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Settings, Camera, CheckCheck, Mic, Pause, Play, SendHorizontal, ShieldCheck, Square, UserRound, UserRoundCheck, Video, X, Eye, RotateCcw } from 'lucide-react'
import { api, post, CROP_UR } from '../../lib/api'
import { speak, stopAudio, useRecorder } from '../../lib/audio'
import { Logo, Spinner } from '../../components/ui'

export type Lang = 'ur' | 'pa'
const T = {
  ur: { name: 'آواز ساتھی', sub: 'زرعی ہیلپ لائن', intro: 'السلام علیکم! فصل کے پتے کی تصویر بھیجیں، یا اپنا مسئلہ لکھ کر یا بول کر بتائیں۔ جواب یہیں آواز اور تحریر میں ملے گا۔', write: 'پیغام لکھیں', listen: 'سنیں', stop: 'روکیں', human: 'ماہر سے پوچھیں', sent: 'ماہر کو بھیج دیا گیا، جواب یہیں آئے گا', saw: 'تصویر میں نظر آیا', fromKb: 'ماہرین کی منظور شدہ معلومات سے', toExpert: 'ماہر کو بھیج دیا گیا', expert: 'ماہر کا جواب', voice: 'آواز کا پیغام', listening: 'سن رہے ہیں', working: 'جائزہ لیا جا رہا ہے', cats: { disease: 'بیماری', pest: 'کیڑا', nutrient: 'کھاد / کمی', weed: 'جڑی بوٹی' }, crops: CROP_UR },
  pa: { name: 'آواز ساتھی', sub: 'زرعی ہیلپ لائن', intro: 'السلام علیکم! فصل دے پتے دی تصویر گھلو، یا اپنا مسئلہ لکھ کے یا بول کے دسو۔ جواب ایتھے ای آواز تے لکھت وچ ملے گا۔', write: 'سنیہا لکھو', listen: 'سنو', stop: 'روکو', human: 'ماہر توں پچھو', sent: 'ماہر نوں گھل دتا، جواب ایتھے ای آوے گا', saw: 'تصویر وچ دسیا', fromKb: 'ماہراں دی منظور شدہ معلومات توں', toExpert: 'ماہر نوں گھل دتا گیا', expert: 'ماہر دا جواب', voice: 'آواز دا سنیہا', listening: 'سن رہے آں', working: 'جائزہ لیا جا رہیا اے', cats: { disease: 'بیماری', pest: 'کیڑا', nutrient: 'کھاد / کمی', weed: 'جڑی بوٹی' }, crops: { ...CROP_UR, wheat: 'کنک', cotton: 'کپاہ' } as Record<string, string> },
}

type Msg = { id: string; at: number; side: 'in' | 'out'; text?: string; photo?: string; voice?: string; result?: any; sentToExpert?: boolean }

const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** The smartphone door: a chat with the helpline. Photo, voice note or typed question in; voice and text answer out.
 *  In production this is the helpline's WhatsApp number; here the chat is simulated inside the page. */
export function Chat({ meta, phone, lang, inbox, resetKey, onResult, onHeard, onSettings }: {
  meta: any; phone: string; lang: Lang; inbox: any[]; resetKey: number; onResult: (r: any) => void; onHeard: (item: any) => void; onSettings?: () => void
}) {
  const L = T[lang]
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [crop, setCrop] = useState('wheat')
  const [category, setCategory] = useState('')
  const [voice, setVoice] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const rec = useRecorder()
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLElement>(null)   // the scrolling message list
  const opened = useRef(Date.now())

  useEffect(() => { setMsgs([]); setErr(null) }, [resetKey, phone])

  // Expert answers, outbreak alerts and follow-ups reach the smartphone as chat messages (the text backup of the voice call).
  const all = useMemo(() => {
    const fromInbox = inbox.map((i) => ({ id: `inbox-${i.id}`, at: new Date(i.created_at).getTime(), side: 'in' as const, inbox: i }))
    return [...msgs, ...fromInbox].sort((a, b) => a.at - b.at)
  }, [msgs, inbox])
  useEffect(() => { const box = endRef.current; if (box) box.scrollTop = box.scrollHeight }, [all.length, busy, err])

  const pick = (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)); setErr(null) }
  const clearDraft = () => { setFile(null); setPreview(null); setVoice(null); setText('') }
  const toggleRec = async () => { if (rec.recording) setVoice(await rec.stop()); else { stopAudio(); setVoice(null); await rec.start() } }
  const play = async (id: string, url: string | null | undefined, t: string, after?: () => void) => {
    if (playing === id) { stopAudio(); setPlaying(null); return }
    setPlaying(id); await speak(url, t); setPlaying((p) => (p === id ? null : p)); after?.()
  }

  const send = async () => {
    if (busy || rec.recording || (!file && !voice && !text.trim())) return
    const out: Msg = { id: `m${Date.now()}`, at: Date.now(), side: 'out', text: text.trim() || undefined, photo: preview || undefined, voice: voice ? URL.createObjectURL(voice) : undefined }
    setMsgs((m) => [...m, out]); setBusy(true); setErr(null)
    const f = file, v = voice, t = text.trim()
    clearDraft()
    try {
      const c = await post('/api/call/start', { phone, language: lang })
      // The crop and problem chips only show with a photo; a text or voice question alone carries no crop choice.
      const fd = new FormData(); fd.append('crop', f ? crop : ''); fd.append('category', f ? category : ''); fd.append('transcript', t)
      if (v) fd.append('audio', v, 'question.webm')
      let r: any
      if (f) { fd.append('image', f); r = await api(`/api/call/${c.call_id}/photo`, { method: 'POST', body: fd }) }
      else { fd.append('channel', 'chat'); r = await api(`/api/call/${c.call_id}/ask`, { method: 'POST', body: fd }) }
      if (r.needs_text) { setErr(r.message || 'The voice note could not be understood on this device. Type the question and send again.'); return }
      setMsgs((m) => [...m, { id: `a${Date.now()}`, at: Date.now(), side: 'in', result: r, sentToExpert: r.escalated }])
      onResult(r)
      play(`a-${r.query.id}`, r.answer_audio, r.answer_text)
    } catch (e: any) { setErr(`Could not send (${e.message}). Check the connection and try again.`) } finally { setBusy(false) }
  }
  const toExpert = async (m: Msg) => {
    await post(`/api/query/${m.result.query.id}/to-expert`)
    setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, sentToExpert: true } : x)))
  }

  const canSend = !busy && !rec.recording && (!!file || !!voice || !!text.trim())
  return (
    <>
      <header className="shrink-0 flex items-center gap-3 px-3 py-2.5 bg-field-900 text-white" dir="rtl">
        <Logo size={38} />
        <div className="flex-1 min-w-0"><div className="urdu !leading-[1.5] text-[18px] font-bold">{L.name}</div><div className="urdu !leading-[1.4] text-[12px] text-field-200 flex items-center gap-1"><ShieldCheck size={12} /> {L.sub}</div></div>
        <span className="p-2 text-field-200" title="The agronomist starts video calls"><Video size={20} /></span>
        {onSettings && <button onClick={onSettings} aria-label="Settings" className="p-2 -ml-2 rounded-lg hover:bg-white/10"><Settings size={20} /></button>}
      </header>

      <main ref={endRef} className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-2.5 bg-[#EEF3EF]" dir="rtl" data-testid="chat">
        <div dir="ltr" className="text-center"><span className="inline-block rounded-lg bg-white/80 border border-line px-2.5 py-1 text-[11px] text-muted">Simulated chat. In production this is the helpline’s WhatsApp number.</span></div>
        <Bubble side="in" time={hhmm(opened.current)}><div className="urdu text-[16px]">{L.intro}</div></Bubble>

        {all.map((m: any) => {
          if (m.inbox) {
            const it = m.inbox, alert = it.kind === 'outbreak_alert', id = m.id
            return <Bubble key={id} side="in" time={hhmm(m.at)} tone={alert ? 'danger' : 'plain'} testid={`msg-${it.kind}`}>
              <div className={`flex items-center gap-1.5 urdu !leading-[1.8] font-bold text-[15px] ${alert ? 'text-danger' : 'text-field-800'}`}>{alert ? <AlertTriangle size={15} /> : it.kind === 'followup' ? <RotateCcw size={15} /> : <UserRound size={15} />}{it.title_ur}{!it.heard && <span className="h-2 w-2 rounded-full bg-danger" />}</div>
              <div className="urdu text-[16px]">{it.text_ur}</div>
              <VoiceRow on={playing === id} label={L.voice} listen={L.listen} stop={L.stop} onClick={() => play(id, it.audio_url, it.text_ur, () => !it.heard && onHeard(it))} />
            </Bubble>
          }
          if (m.side === 'out') return <Bubble key={m.id} side="out" time={hhmm(m.at)} sent>
            {m.photo && <img src={m.photo} alt="Crop photo" className="rounded-xl w-full max-h-48 object-cover mb-1" />}
            {m.voice && <VoiceRow on={playing === m.id} label={L.voice} listen={L.listen} stop={L.stop} onClick={() => play(m.id, m.voice, '')} />}
            {m.text && <div className="urdu text-[16px]">{m.text}</div>}
          </Bubble>
          const r = m.result, id = `a-${r.query.id}`
          return <Bubble key={m.id} side="in" time={hhmm(m.at)} testid={r.escalated ? 'msg-escalated' : 'msg-answer'}>
            {r.vision?.description_ur && <div className="mb-1.5 pb-1.5 border-b border-line"><div className="flex items-center gap-1 text-[12px] text-muted urdu !leading-[1.6]"><Eye size={12} /> {L.saw}</div><div className="urdu text-[15px] text-ink/80">{r.vision.description_ur}</div></div>}
            <div className={`tag mb-1 ${r.escalated ? 'bg-ink text-white' : 'bg-field-100 text-field-800'}`}>{r.escalated ? <UserRound size={12} /> : <ShieldCheck size={12} />}<span className="urdu !leading-[1.7] text-[12.5px]">{r.escalated ? L.toExpert : L.fromKb}</span></div>
            <div className="urdu text-[16px]">{r.answer_text}</div>
            <VoiceRow on={playing === id} label={L.voice} listen={L.listen} stop={L.stop} onClick={() => play(id, r.answer_audio, r.answer_text)} />
            {!r.escalated && (m.sentToExpert
              ? <div className="mt-1.5 tag bg-field-50 border border-line text-ink urdu !leading-[1.8] text-[13px]"><UserRoundCheck size={13} /> {L.sent}</div>
              : <button onClick={() => toExpert(m)} className="mt-1.5 w-full btn btn-quiet !py-1.5 text-sm"><UserRound size={15} /><span className="urdu !leading-[1.7]">{L.human}</span></button>)}
          </Bubble>
        })}
        {busy && <Bubble side="in"><div dir="ltr" className="flex items-center gap-2 text-sm text-muted"><Spinner size={14} /> Checking on this laptop, 10 to 20 seconds for a photo</div></Bubble>}
        {err && <div dir="ltr" role="alert" className="text-[13px] rounded-xl bg-warn-50 text-warn border border-warn/20 px-3 py-2">{err}</div>}
        {rec.error && <div dir="ltr" role="alert" className="text-[13px] rounded-xl bg-warn-50 text-warn border border-warn/20 px-3 py-2">{rec.error}</div>}
      </main>

      <footer className="shrink-0 bg-white border-t border-line px-2.5 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))]" dir="rtl">
        {(preview || voice) && <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2">
            {preview && <span className="relative"><img src={preview} alt="Selected photo" className="h-14 w-14 rounded-xl object-cover border border-line" /><button onClick={() => { setFile(null); setPreview(null) }} aria-label="Remove photo" className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-ink text-white grid place-items-center"><X size={12} /></button></span>}
            {voice && <span className="tag bg-field-100 text-field-800 py-1.5"><Mic size={13} /><span className="urdu !leading-[1.6] text-[13px]">{L.voice}</span><button onClick={() => setVoice(null)} aria-label="Remove voice note"><X size={13} /></button></span>}
          </div>
          {preview && <>
            <Chips value={crop} onChange={setCrop} options={Object.values(meta?.crops || {}).map((c: any) => [c, L.crops[c] || c])} />
            <Chips value={category} onChange={(v) => setCategory(category === v ? '' : v)} options={Object.entries(L.cats)} />
          </>}
        </div>}
        <div className="flex items-end gap-1.5">
          <button onClick={() => fileRef.current?.click()} aria-label="Attach a crop photo" className="h-11 w-11 shrink-0 rounded-full grid place-items-center text-field-800 hover:bg-field-50"><Camera size={22} /></button>
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="photo-input" onChange={(e) => { if (e.target.files?.[0]) pick(e.target.files[0]); e.target.value = '' }} />
          {rec.recording
            ? <div className="flex-1 h-11 rounded-full bg-danger-50 border border-danger/20 text-danger flex items-center gap-2 px-4"><span className="eq"><span /><span /><span /><span /></span><span className="urdu !leading-none text-[14px]">{L.listening}</span></div>
            : <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={L.write} aria-label="Message" className="flex-1 min-w-0 h-11 rounded-full bg-field-50 border border-line px-4 urdu !leading-none text-[15px] placeholder:text-muted/70 focus:outline-2 focus:outline-field-600" />}
          {canSend
            ? <button onClick={send} aria-label="Send" className="h-11 w-11 shrink-0 rounded-full bg-field-700 text-white grid place-items-center hover:bg-field-800"><SendHorizontal size={19} className="-scale-x-100" /></button>
            : <button onClick={toggleRec} disabled={busy} aria-label={rec.recording ? 'Stop recording' : 'Record a voice note'} className={`h-11 w-11 shrink-0 rounded-full grid place-items-center text-white ${rec.recording ? 'bg-danger' : 'bg-field-700 hover:bg-field-800'} disabled:opacity-50`}>{rec.recording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}</button>}
        </div>
      </footer>
    </>
  )
}

function Bubble({ side, time, children, tone = 'plain', sent, testid }: { side: 'in' | 'out'; time?: string; children: React.ReactNode; tone?: 'plain' | 'danger'; sent?: boolean; testid?: string }) {
  return (
    <div className={`flex ${side === 'out' ? 'justify-end' : 'justify-start'}`} data-testid={testid}>
      <div className={`max-w-[86%] px-3 pt-2 pb-1.5 ${side === 'out' ? 'bubble-out' : 'bubble-in'} ${tone === 'danger' ? '!border-danger/40 !bg-danger-50' : ''}`}>
        {children}
        {time && <div dir="ltr" className="flex items-center justify-end gap-1 text-[10.5px] text-muted mt-0.5">{time}{sent && <CheckCheck size={13} className="text-field-600" />}</div>}
      </div>
    </div>
  )
}

function VoiceRow({ on, label, listen, stop, onClick }: { on: boolean; label: string; listen: string; stop: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={on ? 'Stop' : `Listen: ${label}`} className="mt-1.5 w-full flex items-center gap-2.5 rounded-full bg-field-50 border border-line pl-3 pr-1.5 py-1 hover:border-field-600">
      <span className="h-8 w-8 rounded-full bg-field-700 text-white grid place-items-center shrink-0">{on ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="-scale-x-100" />}</span>
      <span className="flex-1 flex items-center gap-[3px] h-5" aria-hidden>{[5, 11, 7, 15, 9, 13, 6, 12, 16, 8, 11, 5, 9, 14, 7, 10].map((h, i) => <i key={i} className={`w-[3px] rounded-full ${on ? 'bg-field-600' : 'bg-field-200'}`} style={{ height: h }} />)}</span>
      <span className="urdu !leading-none text-[13px] text-field-800 pl-2">{on ? stop : listen}</span>
    </button>
  )
}

function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {options.map(([k, v]) => <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className={`tag shrink-0 py-1 px-2.5 urdu !leading-[1.7] text-[13px] ${value === k ? 'bg-field-800 text-white' : 'bg-white border border-line text-ink'}`}>{v}</button>)}
    </div>
  )
}
