import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, PhoneIncoming, Mic, Square, Inbox, Camera, ListChecks, Play, Pause, Send, AlertTriangle, ShieldCheck, Bot, UserRound, ImagePlus, Volume2, CheckCircle2 } from 'lucide-react'
import { api, post, timeAgo, CROP_EN, CROP_UR } from '../lib/api'
import { beep, speak, stopAudio, unlockAudio, useRecorder } from '../lib/audio'
import { useWS } from '../lib/ws'
import { useVideoCall } from '../lib/rtc'
import { AppBar, AppShell, LiveDot, Meter, Mock, Reasons, Spinner, VideoCallView, Empty } from '../components/ui'

type Step = 'idle' | 'connecting' | 'welcome' | 'notice' | 'tehsil' | 'tehsil_pick' | 'crop' | 'duration' | 'ask' | 'thinking'
  | 'answer' | 'escalated' | 'more' | 'consent' | 'ended'
type Prompt = { text: string; audio_url: string | null }

// English subtitles for the jury; the farmer hears and sees Urdu.
const EN: Record<string, string> = {
  welcome: 'Welcome to AwaazSaathi. Press 1 for Punjabi, 2 for Urdu.',
  ai_notice: 'You are speaking to an AI, not a person. If the question is hard, an agronomist will call you back.',
  tehsil_confirm: 'Is this your tehsil? 1 yes, 2 change.',
  tehsil_pick: 'Press the number of your tehsil.',
  crop: 'Which crop? 1 wheat, 2 cotton, 3 rice, 4 sugarcane, 5 maize.',
  duration: 'Since when? 1 under 3 days, 2 about a week, 3 longer.',
  ask: 'After the beep, describe the problem.',
  thinking: 'Understanding your question…',
  more: '1 ask another question, 2 end the call.',
  consent: 'May we keep this recording to improve the service? 1 keep, 2 delete now.',
}

export default function Farmer() {
  const [meta, setMeta] = useState<any>(null)
  const [prompts, setPrompts] = useState<Record<string, Prompt>>({})
  const [phone, setPhone] = useState('')
  const [farmerId, setFarmerId] = useState<number | null>(null)
  const [tab, setTab] = useState('call')
  const [step, setStep] = useState<Step>('idle')
  const [call, setCall] = useState<any>(null)
  const [lang, setLang] = useState<'pa' | 'ur'>('pa')
  const [crop, setCrop] = useState('')
  const [duration, setDuration] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [inbox, setInbox] = useState<any[]>([])
  const [incoming, setIncoming] = useState<any>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const rec = useRecorder()
  const stepRef = useRef<Step>('idle'); stepRef.current = step

  useEffect(() => {
    api('/api/demo/personas').then((m) => { setMeta(m); setPhone(m.personas[24]?.phone || m.personas[0].phone) })
    api('/api/prompts').then(setPrompts).catch(() => {})
    api('/api/status').then((s) => setOffline(s.offline)).catch(() => {})
  }, [])
  useEffect(() => { if (phone) api(`/api/farmer/lookup?phone=${phone}`).then((r) => setFarmerId(r.farmer_id)) }, [phone])
  const loadInbox = useCallback(() => { if (farmerId) api(`/api/farmer/${farmerId}/inbox`).then(setInbox).catch(() => {}) }, [farmerId])
  useEffect(loadInbox, [loadInbox])

  const myTopic = farmerId ? `farmer:${farmerId}` : ''
  const ws = useWS(myTopic ? [myTopic, 'reset', 'status'] : ['reset', 'status'], (m) => {
    if (m.event.startsWith('rtc_')) { video.onSignal(m.event, m.data); return }
    if (m.event === 'callback') { loadInbox(); if (['idle', 'ended'].includes(stepRef.current)) { setIncoming(m.data); beep(660, 400, 3) } }
    if (m.event === 'inbox') { loadInbox(); beep(520, 250, 2) }
    if (m.event === 'reset') loadInbox()
    if (m.event === 'offline') setOffline(m.data.on)
  })
  const video = useVideoCall(ws.send, myTopic)

  const say = useCallback(async (key: string, after?: () => void) => {
    const p = prompts[key]; setSpeaking(true)
    await speak(p?.audio_url, p?.text || ''); setSpeaking(false); after?.()
  }, [prompts])
  const go = (s: Step) => { setStep(s); setNote(null) }

  useEffect(() => {
    const k: Partial<Record<Step, string>> = { welcome: 'welcome', tehsil: 'tehsil_confirm', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', more: 'more', consent: 'consent' }
    if (step === 'notice') say('ai_notice', () => stepRef.current === 'notice' && go(call?.known ? 'tehsil' : 'tehsil_pick'))
    else if (step === 'ask') say('ask', () => beep(1000, 220))
    else if (k[step]) say(k[step]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const startCall = async () => {
    unlockAudio(); setResult(null); setCrop(''); setDuration(''); setTyped(''); setTab('call')
    go('connecting'); beep(440, 600, 2)
    try { const c = await post('/api/call/start', { phone, language: lang }); setCall(c); setFarmerId(c.farmer_id); setTimeout(() => go('welcome'), 900) }
    catch (e: any) { setNote(e.message); go('idle') }
  }
  const endCall = () => { stopAudio(); go('idle'); setCall(null) }

  const deliver = async (r: any) => {
    setResult(r); go(r.escalated ? 'escalated' : 'answer'); setSpeaking(true)
    await speak(r.answer_audio, r.answer_text); setSpeaking(false)
    if (['answer', 'escalated'].includes(stepRef.current)) go('more')
  }
  const submit = async (opts: { audio?: Blob; transcript?: string }) => {
    stopAudio(); go('thinking'); say('thinking')
    const fd = new FormData(); fd.append('crop', crop); fd.append('duration', duration)
    if (opts.transcript) fd.append('transcript', opts.transcript)
    if (opts.audio) fd.append('audio', opts.audio, 'question.webm')
    try {
      const r = await api(`/api/call/${call.call_id}/ask`, { method: 'POST', body: fd })
      if (r.needs_text) { go('ask'); setNote(r.stt_engine === 'offline' ? 'Offline mode: speech recognition is paused. Type the question or pick a sample.' : 'The recording could not be transcribed. Type it or pick a sample.'); return }
      deliver(r)
    } catch (e: any) { go('ask'); setNote(`Could not reach the server (${e.message}). Try again.`) }
  }

  const press = async (d: string) => {
    if (['idle', 'ended', 'connecting', 'thinking'].includes(step)) return
    beep(1200 + Number(d) * 40, 70); stopAudio(); setSpeaking(false)
    if (step === 'welcome' && (d === '1' || d === '2')) { setLang(d === '1' ? 'pa' : 'ur'); go('notice') }
    else if (step === 'notice') go(call?.known ? 'tehsil' : 'tehsil_pick')
    else if (step === 'tehsil') { if (d === '1') go('crop'); else if (d === '2') go('tehsil_pick') }
    else if (step === 'tehsil_pick') {
      const t = meta?.tehsils?.[Number(d === '0' ? 10 : d) - 1]
      if (t) { await post(`/api/call/${call.call_id}/tehsil`, { tehsil: t.name }); setCall({ ...call, tehsil: t.name, tehsil_ur: t.ur }); go('crop') }
    }
    else if (step === 'crop' && meta?.crops[d]) { setCrop(meta.crops[d]); go('duration') }
    else if (step === 'duration' && meta?.durations[d]) { setDuration(meta.durations[d]); go('ask') }
    else if (step === 'more') { if (d === '1') { setResult(null); go('ask') } else if (d === '2') go('consent') }
    else if (step === 'consent' && (d === '1' || d === '2')) {
      const keep = d === '1'
      await post(`/api/call/${call.call_id}/consent`, { keep })
      const p = prompts[keep ? 'consent_yes' : 'consent_no']; setSpeaking(true)
      await speak(p?.audio_url, p?.text || ''); setSpeaking(false)
      setStep('ended'); setNote(keep ? 'ریکارڈنگ محفوظ کر لی گئی' : 'ریکارڈنگ مٹا دی گئی')
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (/^[0-9]$/.test(e.key) && !(e.target instanceof HTMLInputElement)) press(e.key) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const toggleRec = async () => {
    if (rec.recording) { const b = await rec.stop(); if (b && b.size > 1000) submit({ audio: b }); else setNote('Recording too short. Speak a little longer.') }
    else { stopAudio(); await rec.start() }
  }
  const playItem = async (it: any) => {
    if (playing === it.id) { stopAudio(); setPlaying(null); return }
    setPlaying(it.id); await speak(it.audio_url, it.text_ur); setPlaying(null)
    if (!it.heard) post(`/api/inbox/${it.id}/heard`).then(loadInbox)
  }
  const acceptIncoming = async () => {
    const d = incoming; setIncoming(null); setTab('inbox')
    const item = inbox.find((i) => i.query_id === d.query_id)
    setPlaying(item?.id ?? -1); await speak(d.audio_url, d.text)
    if (d.expert_audio_url) await speak(d.expert_audio_url, '')
    setPlaying(null); if (item) post(`/api/inbox/${item.id}/heard`).then(loadInbox)
  }

  const unheard = inbox.filter((i) => !i.heard).length
  const inCall = !['idle', 'ended'].includes(step)
  const tabs = [
    { key: 'call', label: <span className="urdu !leading-none text-[13px]">کال</span>, icon: Phone },
    { key: 'inbox', label: <span className="urdu !leading-none text-[13px]">جوابات</span>, icon: Inbox, badge: unheard },
    { key: 'photo', label: <span className="urdu !leading-none text-[13px]">تصویر</span>, icon: Camera },
    { key: 'ai', label: <span className="text-[12px]">AI</span>, icon: ListChecks },
  ]

  return (
    <AppShell dir="rtl" tabs={inCall ? undefined : tabs} active={tab} onTab={setTab}
      header={<AppBar title={<span className="urdu !leading-tight text-[20px]">آواز ساتھی</span>} subtitle={<span dir="ltr">Farmer helpline{offline ? ', offline mode' : ''}</span>} right={<LiveDot on={ws.connected} />} />}
      aside={<Pipeline result={result} step={step} />}
      overlay={<>
        {incoming && <IncomingCallback by={incoming.by} onAccept={acceptIncoming} onDecline={() => setIncoming(null)} />}
        <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'AwaazSaathi agronomist'} error={video.error} onAccept={video.accept} onDecline={video.decline} onHangup={video.hangup} />
      </>}>
      {tab === 'call' && (inCall ? (
        <InCall step={step} prompts={prompts} call={call} lang={lang} crop={crop} meta={meta} result={result} speaking={speaking} rec={rec}
          note={note} typed={typed} setTyped={setTyped} onPress={press} onRec={toggleRec} onSubmit={submit} onEnd={endCall} />
      ) : (
        <div className="flex flex-col items-center px-6 pt-10 pb-8 gap-6 text-center">
          <img src="/icon.svg" className="h-20 w-20 rounded-[22px] shadow-lg" alt="" />
          <div>
            <div className="urdu text-[28px] font-bold !text-center !leading-[1.9]">کسان کا ساتھی</div>
            <div className="urdu text-lg text-muted !text-center !leading-[2]">اپنی فصل کا سوال پوچھیں، اپنی زبان میں</div>
          </div>
          {step === 'ended' && note && <div className="w-full rounded-xl bg-field-100 text-field-900 px-4 py-2 urdu !text-center !leading-[2] flex items-center justify-center gap-2"><CheckCircle2 size={18} /> {note}</div>}
          <button onClick={startCall} aria-label="Call the helpline" className="h-24 w-24 rounded-full bg-field-700 hover:bg-field-800 text-white grid place-items-center shadow-xl ring-pulse"><Phone size={38} /></button>
          <div className="urdu text-lg !text-center !leading-[1.8]">ہیلپ لائن پر کال کریں</div>
          <label className="w-full text-start" dir="ltr">
            <span className="text-xs text-muted">Demo caller ID (stored only as a hash)</span>
            <select value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1 text-sm">
              {meta?.personas.map((p: any) => <option key={p.phone} value={p.phone}>{p.phone}, {p.tehsil}</option>)}
            </select>
          </label>
          <div dir="ltr" className="text-[11px] text-muted flex items-center gap-2"><Mock>Telco simulated</Mock> Works on any button phone in production</div>
        </div>
      ))}
      {tab === 'inbox' && <InboxList items={inbox} playing={playing} onPlay={playItem} />}
      {tab === 'photo' && <PhotoDoor meta={meta} phone={phone} lang={lang} onResult={(r) => { setResult(r); speak(r.answer_audio, r.answer_text) }} />}
      {tab === 'ai' && <div dir="ltr" className="p-4"><Pipeline result={result} step={step} /></div>}
    </AppShell>
  )
}

function InCall({ step, prompts, call, lang, crop, meta, result, speaking, rec, note, typed, setTyped, onPress, onRec, onSubmit, onEnd }: any) {
  const pk: Record<string, string> = { welcome: 'welcome', notice: 'ai_notice', tehsil: 'tehsil_confirm', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', ask: 'ask', thinking: 'thinking', more: 'more', consent: 'consent' }
  const key = pk[step]
  return (
    <div className="min-h-full flex flex-col bg-field-900 text-white px-5 pt-4 pb-5">
      <div className="flex justify-center gap-1.5 flex-wrap">
        <span className="tag bg-white/10 text-white"><Bot size={13} /> AI</span>
        {!['welcome', 'connecting'].includes(step) && <span className="tag bg-white/10 text-white urdu !leading-normal">{lang === 'pa' ? 'پنجابی' : 'اردو'}</span>}
        {call?.tehsil_ur && !['welcome', 'connecting', 'notice'].includes(step) && <span className="tag bg-white/10 text-white urdu !leading-normal">{call.tehsil_ur}</span>}
        {crop && <span className="tag bg-white/10 text-white urdu !leading-normal">{CROP_UR[crop]}</span>}
      </div>

      <div key={step} className="mt-4 rounded-2xl bg-white/[.07] border border-white/10 p-4 min-h-[180px]">
        {step === 'connecting' && <div className="flex flex-col items-center gap-3 py-8"><div className="h-16 w-16 rounded-full bg-field-600 grid place-items-center ring-pulse"><Phone size={28} /></div><div className="urdu text-field-200 !text-center">کال مل رہی ہے…</div></div>}
        {key && <>
          <div className="urdu text-[22px] !leading-[2.3]">{prompts[key]?.text}</div>
          {EN[key] && <div dir="ltr" className="text-[12px] text-field-200 mt-2 text-left">{EN[key]}</div>}
        </>}
        {step === 'tehsil' && <div className="mt-3 text-center"><span className="urdu text-[30px] font-bold text-mustard">{call?.tehsil_ur}</span></div>}
        {step === 'tehsil_pick' && <div className="grid grid-cols-2 gap-1.5 mt-3">{meta?.tehsils.slice(0, 10).map((t: any, i: number) => <div key={t.name} className="rounded-lg bg-white/5 px-2 py-1 flex items-center gap-2"><b className="text-mustard">{(i + 1) % 10}</b><span className="urdu !leading-normal">{t.ur}</span></div>)}</div>}
        {(step === 'answer' || step === 'escalated') && result && <>
          <div className={`tag mb-2 ${step === 'answer' ? 'bg-field-600 text-white' : 'bg-mustard text-field-950'}`}>
            {step === 'answer' ? <><ShieldCheck size={13} /> <span className="urdu !leading-normal">ماہرین کی منظور شدہ معلومات سے جواب</span></> : <><UserRound size={13} /> <span className="urdu !leading-normal">ماہر کو بھیج دیا گیا</span></>}
          </div>
          <div className="urdu text-[21px] !leading-[2.25]">{result.answer_text}</div>
        </>}
      </div>

      <div className="h-9 mt-3 flex items-center justify-center">
        {rec.recording ? <span className="tag bg-danger text-white py-1"><span className="eq"><span /><span /><span /><span /></span> <span className="urdu !leading-normal">سن رہے ہیں</span></span>
          : step === 'thinking' ? <span className="tag bg-mustard text-field-950 py-1"><Spinner size={14} /> <span className="urdu !leading-normal">سمجھ رہے ہیں</span></span>
          : speaking ? <span className="tag bg-white/15 text-white py-1"><Volume2 size={14} /> <span className="eq text-mustard"><span /><span /><span /><span /></span></span> : null}
      </div>

      {step === 'ask' ? (
        <div className="flex flex-col items-center gap-3">
          <button onClick={onRec} aria-label={rec.recording ? 'Stop and send' : 'Record question'} className={`h-24 w-24 rounded-full grid place-items-center shadow-xl ${rec.recording ? 'bg-danger ring-pulse' : 'bg-mustard text-field-950 hover:bg-mustard-600'}`}>{rec.recording ? <Square size={32} fill="currentColor" /> : <Mic size={40} />}</button>
          <div className="urdu text-field-200 !text-center !leading-[1.8]">{rec.recording ? 'بات ختم ہو تو دبائیں' : 'دبائیں اور اپنا سوال بولیں'}</div>
          {(rec.error || note) && <div dir="ltr" className="text-xs rounded-lg bg-mustard/15 text-mustard-100 px-3 py-2 w-full flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{rec.error || note}</div>}
          <div className="w-full flex gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="یا یہاں لکھیں" className="flex-1 rounded-xl bg-white/10 border border-white/15 px-3 py-2 urdu !leading-normal placeholder:text-field-200/60" />
            <button disabled={!typed.trim()} onClick={() => onSubmit({ transcript: typed })} aria-label="Send" className="btn bg-white/15 !px-3"><Send size={18} className="-scale-x-100" /></button>
          </div>
          <div dir="ltr" className="w-full">
            <div className="text-[11px] text-field-200 mb-1">Sample questions (offline-safe)</div>
            <div className="flex flex-wrap gap-1.5">
              {meta && Object.entries(meta.canned).map(([k, c]: any) => <button key={k} onClick={() => onSubmit({ transcript: c.transcript })} className="tag bg-white/10 hover:bg-white/20 text-white py-1">{c.label.split('(')[0].replace(':', '')}</button>)}
            </div>
          </div>
        </div>
      ) : <Keypad onPress={onPress} active={['welcome', 'notice', 'tehsil', 'tehsil_pick', 'crop', 'duration', 'more', 'consent'].includes(step)} />}
      <button onClick={onEnd} aria-label="End call" className="mt-auto pt-4 mx-auto"><span className="h-14 w-14 rounded-full bg-danger grid place-items-center"><PhoneOff size={24} /></span></button>
    </div>
  )
}

function Keypad({ onPress, active }: { onPress: (d: string) => void; active: boolean }) {
  return (
    <div dir="ltr" className={`grid grid-cols-3 gap-3 mt-2 px-3 ${active ? '' : 'opacity-35 pointer-events-none'}`}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
        <button key={k} onClick={() => onPress(k)} className="h-14 rounded-2xl bg-white/[.08] hover:bg-white/15 active:bg-mustard active:text-field-950 text-2xl font-semibold">{k}</button>))}
    </div>
  )
}

function IncomingCallback({ by, onAccept, onDecline }: { by: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-field-950/97 text-white flex flex-col items-center justify-center gap-6 px-6 text-center drop-in">
      <div className="urdu text-field-200 !text-center">آنے والی کال</div>
      <div className="h-24 w-24 rounded-full bg-mustard text-field-950 grid place-items-center ring-pulse"><PhoneIncoming size={40} /></div>
      <div><div className="urdu text-[26px] font-bold !text-center !leading-[1.9]">آواز ساتھی ماہر</div><div dir="ltr" className="text-field-200 text-sm">Answer approved by {by}</div></div>
      <div className="flex gap-14">
        <button onClick={onDecline} aria-label="Decline" className="h-16 w-16 rounded-full bg-danger grid place-items-center"><PhoneOff /></button>
        <button onClick={onAccept} aria-label="Accept" className="h-16 w-16 rounded-full bg-field-600 grid place-items-center"><Phone /></button>
      </div>
    </div>
  )
}

function InboxList({ items, playing, onPlay }: { items: any[]; playing: number | null; onPlay: (it: any) => void }) {
  if (!items.length) return <Empty icon={Inbox} title="ابھی کوئی جواب نہیں"><span dir="ltr">Expert answers and outbreak alerts arrive here as voice messages.</span></Empty>
  return (
    <ul className="p-4 space-y-3">
      {items.map((it) => {
        const alert = it.kind === 'outbreak_alert'
        return (
          <li key={it.id} className={`surface p-4 ${alert ? 'border-danger/30' : ''}`}>
            <div className="flex items-center gap-2">
              <span className={`h-9 w-9 rounded-xl grid place-items-center ${alert ? 'bg-danger-50 text-danger' : 'bg-field-100 text-field-800'}`}>{alert ? <AlertTriangle size={18} /> : <UserRound size={18} />}</span>
              <div className="flex-1"><div className="urdu font-bold !leading-[1.8]">{it.title_ur}</div><div dir="ltr" className="text-[11px] text-muted text-right">{timeAgo(it.created_at)}</div></div>
              {!it.heard && <span className="h-2.5 w-2.5 rounded-full bg-mustard" />}
            </div>
            <div className="urdu text-[17px] mt-2 text-ink/90">{it.text_ur}</div>
            <button onClick={() => onPlay(it)} className="btn btn-quiet w-full mt-2">{playing === it.id ? <><Pause size={18} /> <span className="urdu !leading-normal">روکیں</span></> : <><Play size={18} /> <span className="urdu !leading-normal">آواز میں سنیں</span></>}</button>
          </li>)
      })}
      <li dir="ltr" className="text-[11px] text-muted text-center flex items-center justify-center gap-2"><Mock>SMS / WhatsApp backup simulated</Mock></li>
    </ul>
  )
}

function PhotoDoor({ meta, phone, lang, onResult }: { meta: any; phone: string; lang: string; onResult: (r: any) => void }) {
  const [crop, setCrop] = useState('wheat')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const send = async (f: File) => {
    setPreview(URL.createObjectURL(f)); setBusy(true); setErr(null); setRes(null)
    try {
      const c = await post('/api/call/start', { phone, language: lang })
      const fd = new FormData(); fd.append('crop', crop); fd.append('image', f)
      const r = await api(`/api/call/${c.call_id}/photo`, { method: 'POST', body: fd })
      if (r.needs_text) setErr(r.message); else { setRes(r); onResult(r) }
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="p-4 space-y-4">
      <div className="surface p-4">
        <div className="flex items-center gap-2"><span className="h-9 w-9 rounded-xl bg-[#25D366]/15 text-[#128C4B] grid place-items-center"><Camera size={18} /></span>
          <div><div className="urdu font-bold !leading-[1.8]">پتے کی تصویر بھیجیں</div><div dir="ltr" className="text-[11px] text-muted text-right">WhatsApp door, analysed by a vision model</div></div></div>
        <div className="flex flex-wrap gap-1.5 mt-3">{meta && Object.values(meta.crops).map((c: any) => <button key={c} onClick={() => setCrop(c)} className={`tag py-1.5 px-3 urdu !leading-normal text-[14px] ${crop === c ? 'bg-field-800 text-white' : 'bg-field-50 border border-line'}`}>{CROP_UR[c]}</button>)}</div>
        <button disabled={busy} onClick={() => ref.current?.click()} className="btn btn-primary w-full mt-3">{busy ? <Spinner /> : <ImagePlus size={18} />} <span className="urdu !leading-normal">تصویر لیں یا چنیں</span></button>
        <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      </div>
      {preview && <img src={preview} alt="Leaf" className="w-full max-h-64 object-cover rounded-2xl border border-line" />}
      {err && <div dir="ltr" className="text-sm rounded-xl bg-warn-50 text-warn px-3 py-2">{err}</div>}
      {res && <div className="surface p-4">
        <div className={`tag mb-2 ${res.escalated ? 'bg-mustard-100 text-field-950' : 'bg-field-100 text-field-800'}`}>{res.escalated ? 'ماہر کو بھیج دیا گیا' : 'AI جواب'}</div>
        <div className="urdu text-[18px]">{res.answer_text}</div>
        {res.vision?.description_ur && <div className="urdu text-sm text-muted mt-2">تصویر میں: {res.vision.description_ur}</div>}
      </div>}
    </div>
  )
}

function Pipeline({ result, step }: { result: any; step: Step }) {
  const q = result?.query
  const stages = [
    ['Voice gateway', 'Keypad triage', step !== 'idle'],
    ['Speech to text', result?.stt_engine || 'Groq Whisper', !!q],
    ['Understand', 'Crop, symptoms, risk', !!q],
    ['Retrieve', q ? `Score ${q.retrieval_score.toFixed(2)}` : 'Reviewed knowledge', !!q],
    ['Safety rules', q ? (q.reasons.length ? 'Escalate' : 'Safe to answer') : 'Explicit checks', !!q],
    [q?.status === 'answered_ai' ? 'Answer by voice' : 'Expert queue', q ? (q.status === 'answered_ai' ? 'Spoken now' : q.route === 'senior_only' ? 'Senior only' : 'Junior, then senior') : 'Or human expert', !!q],
  ] as const
  return (
    <div className="surface p-5" dir="ltr">
      <div className="font-bold text-lg">How the AI decided</div>
      <div className="text-sm text-muted mb-4">Every answer passes explicit safety rules before it is spoken.</div>
      <ol className="grid grid-cols-2 gap-2 mb-5">
        {stages.map(([k, d, on], i) => {
          const warn = i === 4 && q?.reasons?.length
          return <li key={k} className={`rounded-xl px-3 py-2 border text-sm ${on ? (warn ? 'border-warn/30 bg-warn-50' : 'border-field-200 bg-field-50') : 'border-line text-muted'}`}>
            <div className="font-semibold flex items-center gap-1.5"><span className={`h-5 w-5 rounded-full text-[11px] grid place-items-center ${on ? 'bg-field-800 text-white' : 'bg-line'}`}>{i + 1}</span>{k}</div>
            <div className="text-xs opacity-80 truncate mt-0.5">{d}</div>
          </li>
        })}
      </ol>
      {!q ? <div className="text-sm text-muted">Ask a question in the call to see the transcript, sources and confidence checks.</div> : (
        <div className="space-y-4">
          <div><div className="text-xs text-muted mb-1">Transcript</div><div className="urdu text-lg bg-field-50 border border-line rounded-xl px-3 py-1">{q.transcript}</div></div>
          <Meter label="Retrieval confidence" value={q.retrieval_score} min={0.3} />
          <Meter label="Grounding in sources" value={q.grounding} min={0.6} />
          <div><div className="text-xs text-muted mb-1.5">Safety checks</div><Reasons reasons={q.reasons} /></div>
          <div><div className="text-xs text-muted mb-1">Sources retrieved</div>
            <ul className="divide-y divide-line">{q.retrieved.map((r: any) => <li key={r.kb_id} className="flex items-center justify-between gap-3 py-1.5"><span className="text-xs text-muted">{r.score.toFixed(2)}</span><span className="urdu !leading-[1.9] text-[15px]">{r.title_ur}</span></li>)}</ul>
          </div>
          <div className="text-xs text-muted">Crop: {CROP_EN[q.crop] || '—'}. Tehsil: {q.tehsil}.</div>
        </div>)}
    </div>
  )
}
