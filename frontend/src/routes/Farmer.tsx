import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, PhoneIncoming, Mic, Square, RotateCcw, UserRoundCheck, Eye, CloudSun, ThumbsUp, Inbox, Camera, ListChecks, Play, Pause, Send, AlertTriangle, ShieldCheck, Bot, UserRound, ImagePlus, Volume2, CheckCircle2 } from 'lucide-react'
import { api, post, timeAgo, CROP_EN, CROP_UR } from '../lib/api'
import { beep, speak, stopAudio, unlockAudio, useRecorder } from '../lib/audio'
import { useWS } from '../lib/ws'
import { useVideoCall } from '../lib/rtc'
import { AppBar, AppShell, LiveDot, Meter, Mock, Reasons, Spinner, VideoCallView, Empty } from '../components/ui'

type Step = 'idle' | 'connecting' | 'welcome' | 'notice' | 'tehsil' | 'tehsil_pick' | 'crop' | 'duration' | 'ask' | 'thinking'
  | 'answer' | 'escalated' | 'more' | 'consent' | 'ended'
type Prompt = { text: string; audio_url: string | null }
type Lang = 'ur' | 'pa'
const UI = {
  ur: { call: 'کال', inbox: 'جوابات', photo: 'تصویر', title: 'آواز ساتھی', hero: 'کسان کا ساتھی', sub: 'اپنی فصل کا سوال پوچھیں، اپنی زبان میں', callNow: 'ہیلپ لائن پر کال کریں', connecting: 'کال مل رہی ہے…', fromKb: 'ماہرین کی منظور شدہ معلومات سے جواب', toExpert: 'ماہر کو بھیج دیا گیا', listening: 'سن رہے ہیں', thinking: 'سمجھ رہے ہیں', stopHint: 'بات ختم ہو تو دبائیں', recHint: 'دبائیں اور اپنا سوال بولیں', typeHere: 'یا یہاں لکھیں', incoming: 'آنے والی کال', expert: 'آواز ساتھی ماہر', noInbox: 'ابھی کوئی جواب نہیں', stop: 'روکیں', listen: 'آواز میں سنیں', sendPhoto: 'پتے کی تصویر بھیجیں', pick: 'تصویر لیں یا چنیں', kept: 'ریکارڈنگ محفوظ کر لی گئی', deleted: 'ریکارڈنگ مٹا دی گئی', ai: 'AI جواب', inPhoto: 'تصویر میں:', lang: 'زبان', replay: 'جواب دوبارہ سنیں', rerecord: 'دوبارہ ریکارڈ', cats: { disease: 'بیماری', pest: 'کیڑا', nutrient: 'کھاد / کمی', weed: 'جڑی بوٹی' }, askAbout: 'تصویر کے بارے میں سوال بولیں', analyse: 'تصویر کا تجزیہ کریں', sees: 'AI کو تصویر میں نظر آیا', toExpertBtn: 'ماہر کو بھیجیں', sent: 'ماہر کو بھیج دیا گیا، وہ فون کرے گا', recorded: 'سوال ریکارڈ ہو گیا', followTitle: 'تین دن بعد خیریت کی کال', better: 'بہتر ہے', still: 'مسئلہ باقی ہے', thanks: 'شکریہ! خوشی ہوئی کہ فصل بہتر ہے', expertWill: 'ماہر آپ کو جلد فون کرے گا' },
  pa: { call: 'کال', inbox: 'جواب', photo: 'تصویر', title: 'آواز ساتھی', hero: 'کسان دا ساتھی', sub: 'اپنی فصل دا سوال پچھو، اپنی بولی وچ', callNow: 'ہیلپ لائن تے کال کرو', connecting: 'کال مل رہی اے…', fromKb: 'ماہراں دی منظور شدہ معلومات توں جواب', toExpert: 'ماہر نوں گھل دتا گیا', listening: 'سن رہے آں', thinking: 'سمجھ رہے آں', stopHint: 'گل مکے تے دباؤ', recHint: 'دباؤ تے اپنا سوال بولو', typeHere: 'یا ایتھے لکھو', incoming: 'آندی کال', expert: 'آواز ساتھی ماہر', noInbox: 'ہلے کوئی جواب نئیں', stop: 'روکو', listen: 'آواز وچ سنو', sendPhoto: 'پتے دی تصویر گھلو', pick: 'تصویر لوو یا چنو', kept: 'ریکارڈنگ محفوظ کر لئی گئی', deleted: 'ریکارڈنگ مٹا دتی گئی', ai: 'AI جواب', inPhoto: 'تصویر وچ:', lang: 'بولی', replay: 'جواب دوبارہ سنو', rerecord: 'دوبارہ ریکارڈ', cats: { disease: 'بیماری', pest: 'کیڑا', nutrient: 'کھاد / کمی', weed: 'جڑی بوٹی' }, askAbout: 'تصویر بارے سوال بولو', analyse: 'تصویر دا جائزہ لوو', sees: 'AI نوں تصویر وچ دسیا', toExpertBtn: 'ماہر نوں گھلو', sent: 'ماہر نوں گھل دتا، اوہ فون کرے گا', recorded: 'سوال ریکارڈ ہو گیا', followTitle: 'تن دناں بعد خیریت دی کال', better: 'بہتر اے', still: 'مسئلہ ہلے وی اے', thanks: 'شکریہ! خوشی ہوئی کہ فصل بہتر اے', expertWill: 'ماہر تہانوں چھیتی فون کرے گا' },
}
let L = UI.ur
const CROP_PA: Record<string, string> = { wheat: 'کنک', cotton: 'کپاہ', rice: 'مونجی', sugarcane: 'کماد', maize: 'مکئی' }
const cropName = (c: string) => (L === UI.pa ? CROP_PA[c] : CROP_UR[c])

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
  more: '1 new question, 2 end call, 3 hear the answer again, 4 record your question again.',
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
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('farmerLang') as Lang) || 'ur')
  L = UI[lang]
  const [crop, setCrop] = useState('')
  const [duration, setDuration] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [typed, setTyped] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [inbox, setInbox] = useState<any[]>([])
  const [incoming, setIncoming] = useState<any>(null)
  const [followup, setFollowup] = useState<any>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const rec = useRecorder()
  const stepRef = useRef<Step>('idle'); stepRef.current = step

  useEffect(() => {
    api('/api/demo/personas').then((m) => { setMeta(m); setPhone(m.personas[24]?.phone || m.personas[0].phone) })
    api('/api/status').then((s) => setOffline(s.offline)).catch(() => {})
  }, [])
  useEffect(() => { api(`/api/prompts?lang=${lang}`).then(setPrompts).catch(() => {}); try { localStorage.setItem('farmerLang', lang) } catch { /* ignore */ } }, [lang])
  useEffect(() => { if (phone) api(`/api/farmer/lookup?phone=${phone}`).then((r) => setFarmerId(r.farmer_id)) }, [phone])
  const loadInbox = useCallback(() => { if (farmerId) api(`/api/farmer/${farmerId}/inbox`).then(setInbox).catch(() => {}) }, [farmerId])
  useEffect(loadInbox, [loadInbox])

  const myTopic = farmerId ? `farmer:${farmerId}` : ''
  const ws = useWS(myTopic ? [myTopic, 'reset', 'status'] : ['reset', 'status'], (m) => {
    if (m.event.startsWith('rtc_')) { video.onSignal(m.event, m.data); return }
    if (m.event === 'callback') { loadInbox(); if (['idle', 'ended'].includes(stepRef.current)) { setIncoming(m.data); beep(660, 400, 3) } }
    if (m.event === 'inbox') { loadInbox(); beep(520, 250, 2) }
    if (m.event === 'followup') { loadInbox(); if (['idle', 'ended'].includes(stepRef.current)) { setFollowup({ ...m.data, stage: 'ringing' }); beep(660, 400, 3) } }
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
    const fd = new FormData(); fd.append('crop', crop); fd.append('duration', duration); fd.append('category', category)
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
    if (step === 'answer' || step === 'escalated') { go('more'); return }
    if (step === 'welcome' && (d === '1' || d === '2')) { const l: Lang = d === '1' ? 'pa' : 'ur'; const p = await api(`/api/prompts?lang=${l}`); setPrompts(p); setLang(l); post(`/api/call/${call.call_id}/language`, { language: l }); go('notice') }
    else if (step === 'notice') go(call?.known ? 'tehsil' : 'tehsil_pick')
    else if (step === 'tehsil') { if (d === '1') go('crop'); else if (d === '2') go('tehsil_pick') }
    else if (step === 'tehsil_pick') {
      const t = meta?.tehsils?.[Number(d === '0' ? 10 : d) - 1]
      if (t) { await post(`/api/call/${call.call_id}/tehsil`, { tehsil: t.name }); setCall({ ...call, tehsil: t.name, tehsil_ur: t.ur }); go('crop') }
    }
    else if (step === 'crop' && meta?.crops[d]) { setCrop(meta.crops[d]); go('duration') }
    else if (step === 'duration' && meta?.durations[d]) { setDuration(meta.durations[d]); go('ask') }
    else if (step === 'more') {
      if (d === '1') { setResult(null); setCategory(''); go('ask') }
      else if (d === '2') go('consent')
      else if (d === '3' && result) { setSpeaking(true); await speak(result.answer_audio, result.answer_text); setSpeaking(false); say('more') }
      else if (d === '4') { setResult(null); go('ask') }
    }
    else if (step === 'consent' && (d === '1' || d === '2')) {
      const keep = d === '1'
      await post(`/api/call/${call.call_id}/consent`, { keep })
      const p = prompts[keep ? 'consent_yes' : 'consent_no']; setSpeaking(true)
      await speak(p?.audio_url, p?.text || ''); setSpeaking(false)
      setStep('ended'); setNote(keep ? L.kept : L.deleted)
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
    { key: 'call', label: <span className="urdu !leading-none text-[13px]">{L.call}</span>, icon: Phone },
    { key: 'inbox', label: <span className="urdu !leading-none text-[13px]">{L.inbox}</span>, icon: Inbox, badge: unheard },
    { key: 'photo', label: <span className="urdu !leading-none text-[13px]">{L.photo}</span>, icon: Camera },
    { key: 'ai', label: <span className="text-[12px]">AI</span>, icon: ListChecks },
  ]

  return (
    <AppShell dir="rtl" tabs={inCall ? undefined : tabs} active={tab} onTab={setTab}
      header={<AppBar title={<span className="urdu !leading-tight text-[20px]">{L.title}</span>} subtitle={<span dir="ltr">Farmer helpline{offline ? ', offline mode' : ''}</span>} right={<>
        {!inCall && <div dir="rtl" role="group" aria-label="Language" className="flex rounded-lg border border-line bg-field-50 p-0.5">
          {(['ur', 'pa'] as Lang[]).map((l) => <button key={l} onClick={() => setLang(l)} className={`urdu !leading-none px-2.5 py-1.5 rounded-md text-[13px] ${lang === l ? 'bg-white shadow-sm text-field-800 font-bold' : 'text-muted'}`}>{l === 'ur' ? 'اردو' : 'پنجابی'}</button>)}
        </div>}
        <LiveDot on={ws.connected} /></>} />}
      aside={<Pipeline result={result} step={step} />}
      overlay={<>
        {incoming && <IncomingCallback by={incoming.by} onAccept={acceptIncoming} onDecline={() => setIncoming(null)} />}
        {followup && <FollowupCall f={followup} setF={setFollowup} />}
        <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'AwaazSaathi agronomist'} error={video.error} onAccept={video.accept} onDecline={video.decline} onHangup={video.hangup} />
      </>}>
      {tab === 'call' && (inCall ? (
        <InCall step={step} prompts={prompts} call={call} lang={lang} crop={crop} meta={meta} result={result} speaking={speaking} rec={rec}
          note={note} typed={typed} setTyped={setTyped} category={category} setCategory={setCategory} onPress={press} onRec={toggleRec} onSubmit={submit} onEnd={endCall} />
      ) : (
        <div className="flex flex-col items-center px-6 pt-10 pb-8 gap-6 text-center">
          <img src="/icon.svg" className="h-20 w-20 rounded-[22px] shadow-lg" alt="" />
          <div>
            <div className="urdu text-[28px] font-bold !text-center !leading-[1.9]">{L.hero}</div>
            <div className="urdu text-lg text-muted !text-center !leading-[2]">{L.sub}</div>
          </div>
          {step === 'ended' && note && <div className="w-full rounded-xl bg-field-100 text-field-900 px-4 py-2 urdu !text-center !leading-[2] flex items-center justify-center gap-2"><CheckCircle2 size={18} /> {note}</div>}
          <button onClick={startCall} aria-label="Call the helpline" className="h-24 w-24 rounded-full bg-field-700 hover:bg-field-800 text-white grid place-items-center shadow-xl ring-pulse"><Phone size={38} /></button>
          <div className="urdu text-lg !text-center !leading-[1.8]">{L.callNow}</div>
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

function InCall({ step, prompts, call, lang, crop, meta, result, speaking, rec, note, typed, setTyped, category, setCategory, onPress, onRec, onSubmit, onEnd }: any) {
  const pk: Record<string, string> = { welcome: 'welcome', notice: 'ai_notice', tehsil: 'tehsil_confirm', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', ask: 'ask', thinking: 'thinking', more: 'more', consent: 'consent' }
  const key = pk[step]
  return (
    <div className="min-h-full flex flex-col bg-white text-ink px-5 pt-4 pb-5">
      <div className="flex justify-center gap-1.5 flex-wrap">
        <span className="tag bg-field-50 text-field-800 border border-line"><Bot size={13} /> AI</span>
        {!['welcome', 'connecting'].includes(step) && <span className="tag bg-field-50 text-field-800 border border-line urdu !leading-normal">{lang === 'pa' ? 'پنجابی' : 'اردو'}</span>}
        {call?.tehsil_ur && !['welcome', 'connecting', 'notice'].includes(step) && <span className="tag bg-field-50 text-field-800 border border-line urdu !leading-normal">{call.tehsil_ur}</span>}
        {crop && <span className="tag bg-field-50 text-field-800 border border-line urdu !leading-normal">{cropName(crop)}</span>}
      </div>

      <div key={step} className="mt-4 rounded-2xl bg-field-50 border border-line p-4 min-h-[180px]">
        {step === 'connecting' && <div className="flex flex-col items-center gap-3 py-8"><div className="h-16 w-16 rounded-full bg-field-700 text-white grid place-items-center ring-pulse"><Phone size={28} /></div><div className="urdu text-muted !text-center">{L.connecting}</div></div>}
        {key && <>
          <div className="urdu text-[22px] !leading-[2.3]">{prompts[key]?.text}</div>
          {EN[key] && <div dir="ltr" className="text-[12px] text-muted mt-2 text-left">{EN[key]}</div>}
        </>}
        {step === 'tehsil' && <div className="mt-3 text-center"><span className="urdu text-[30px] font-bold text-field-700">{call?.tehsil_ur}</span></div>}
        {step === 'tehsil_pick' && <div className="grid grid-cols-2 gap-1.5 mt-3">{meta?.tehsils.slice(0, 10).map((t: any, i: number) => <div key={t.name} className="rounded-lg bg-white border border-line px-2 py-1 flex items-center gap-2"><b className="text-field-700">{(i + 1) % 10}</b><span className="urdu !leading-normal">{t.ur}</span></div>)}</div>}
        {(step === 'answer' || step === 'escalated') && result && <>
          <div className={`tag mb-2 ${step === 'answer' ? 'bg-field-700 text-white' : 'bg-ink text-white'}`}>
            {step === 'answer' ? <><ShieldCheck size={13} /> <span className="urdu !leading-normal">{L.fromKb}</span></> : <><UserRound size={13} /> <span className="urdu !leading-normal">{L.toExpert}</span></>}
          </div>
          <div className="urdu text-[21px] !leading-[2.25]">{result.answer_text}</div>
        </>}
      </div>

      <div className="h-9 mt-3 flex items-center justify-center">
        {rec.recording ? <span className="tag bg-danger text-white py-1"><span className="eq"><span /><span /><span /><span /></span> <span className="urdu !leading-normal">{L.listening}</span></span>
          : step === 'thinking' ? <span className="tag bg-field-100 text-field-800 py-1"><Spinner size={14} /> <span className="urdu !leading-normal">{L.thinking}</span></span>
          : speaking ? <span className="tag bg-field-50 text-field-800 border border-line py-1"><Volume2 size={14} /> <span className="eq text-field-600"><span /><span /><span /><span /></span></span> : null}
      </div>

      {step === 'ask' ? (
        <div className="flex flex-col items-center gap-3">
          <Categories value={category} onChange={setCategory} />
          <button onClick={onRec} aria-label={rec.recording ? 'Stop and send' : 'Record question'} className={`h-24 w-24 rounded-full grid place-items-center shadow-xl ${rec.recording ? 'bg-danger ring-pulse' : 'bg-field-700 text-white hover:bg-field-800'}`}>{rec.recording ? <Square size={32} fill="currentColor" /> : <Mic size={40} />}</button>
          <div className="urdu text-muted !text-center !leading-[1.8]">{rec.recording ? L.stopHint : L.recHint}</div>
          {(rec.error || note) && <div dir="ltr" className="text-xs rounded-lg bg-warn-50 text-warn px-3 py-2 w-full flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{rec.error || note}</div>}
          <div className="w-full flex gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={L.typeHere} className="flex-1 rounded-xl bg-white border border-line px-3 py-2 urdu !leading-normal placeholder:text-muted/70" />
            <button disabled={!typed.trim()} onClick={() => onSubmit({ transcript: typed })} aria-label="Send" className="btn btn-primary !px-3"><Send size={18} className="-scale-x-100" /></button>
          </div>
          <div dir="ltr" className="w-full">
            <div className="text-[11px] text-muted mb-1">Sample questions (offline-safe)</div>
            <div className="flex flex-wrap gap-1.5">
              {meta && Object.entries(meta.canned).map(([k, c]: any) => <button key={k} onClick={() => onSubmit({ transcript: c.transcript })} className="tag bg-white border border-line hover:border-field-600 text-ink py-1">{c.label.split('(')[0].replace(':', '')}</button>)}
            </div>
          </div>
        </div>
      ) : <>
        {step === 'more' && result && <div className="flex gap-2 mt-1"><button onClick={() => onPress('3')} className="btn btn-quiet flex-1 !py-2 text-sm"><RotateCcw size={16} /> <span className="urdu !leading-normal">{L.replay}</span></button><button onClick={() => onPress('4')} className="btn btn-quiet flex-1 !py-2 text-sm"><Mic size={16} /> <span className="urdu !leading-normal">{L.rerecord}</span></button></div>}
        <Keypad onPress={onPress} active={['welcome', 'notice', 'tehsil', 'tehsil_pick', 'crop', 'duration', 'more', 'consent', 'answer', 'escalated'].includes(step)} />
      </>}
      <button onClick={onEnd} aria-label="End call" className="mt-auto pt-4 mx-auto"><span className="h-14 w-14 rounded-full bg-danger text-white grid place-items-center"><PhoneOff size={24} /></span></button>
    </div>
  )
}

function Keypad({ onPress, active }: { onPress: (d: string) => void; active: boolean }) {
  return (
    <div dir="ltr" className={`grid grid-cols-3 gap-3 mt-2 px-3 ${active ? '' : 'opacity-35 pointer-events-none'}`}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
        <button key={k} onClick={() => onPress(k)} className="h-14 rounded-2xl bg-field-50 border border-line hover:bg-field-100 active:bg-field-700 active:text-white text-2xl font-semibold text-ink">{k}</button>))}
    </div>
  )
}

function IncomingCallback({ by, onAccept, onDecline }: { by: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-white text-ink flex flex-col items-center justify-center gap-6 px-6 text-center drop-in">
      <div className="urdu text-muted !text-center">{L.incoming}</div>
      <div className="h-24 w-24 rounded-full bg-field-700 text-white grid place-items-center ring-pulse"><PhoneIncoming size={40} /></div>
      <div><div className="urdu text-[26px] font-bold !text-center !leading-[1.9]">{L.expert}</div><div dir="ltr" className="text-muted text-sm">Answer approved by {by}</div></div>
      <div className="flex gap-14">
        <button onClick={onDecline} aria-label="Decline" className="h-16 w-16 rounded-full bg-danger text-white grid place-items-center"><PhoneOff /></button>
        <button onClick={onAccept} aria-label="Accept" className="h-16 w-16 rounded-full bg-field-700 text-white grid place-items-center"><Phone /></button>
      </div>
    </div>
  )
}

function FollowupCall({ f, setF }: { f: any; setF: (v: any) => void }) {
  const accept = async () => { setF({ ...f, stage: 'talking' }); await speak(f.audio_url, f.text); setF((x: any) => x && { ...x, stage: 'answer' }) }
  const reply = async (better: boolean) => {
    if (!better) await post(`/api/query/${f.query_id}/to-expert?source=followup`)
    setF({ ...f, stage: better ? 'thanks' : 'expert' }); setTimeout(() => setF(null), 2500)
  }
  return (
    <div className="absolute inset-0 z-30 bg-white text-ink flex flex-col items-center justify-center gap-6 px-6 text-center drop-in">
      <div className="urdu text-muted !text-center">{L.followTitle}</div>
      <div className={`h-24 w-24 rounded-full bg-field-700 text-white grid place-items-center ${f.stage === 'ringing' ? 'ring-pulse' : ''}`}>{f.stage === 'thanks' ? <ThumbsUp size={38} /> : <RotateCcw size={38} />}</div>
      <div className="urdu text-[22px] font-bold !text-center !leading-[1.9]">{L.expert}</div>
      {f.stage === 'ringing' && <div className="flex gap-14">
        <button onClick={() => setF(null)} aria-label="Decline" className="h-16 w-16 rounded-full bg-danger text-white grid place-items-center"><PhoneOff /></button>
        <button onClick={accept} aria-label="Accept" className="h-16 w-16 rounded-full bg-field-700 text-white grid place-items-center"><Phone /></button></div>}
      {f.stage === 'talking' && <div className="urdu text-[17px] !text-center">{f.text}</div>}
      {f.stage === 'answer' && <div className="w-full space-y-2">
        <button onClick={() => reply(true)} className="btn btn-primary w-full"><b>1</b> <span className="urdu !leading-normal">{L.better}</span></button>
        <button onClick={() => reply(false)} className="btn btn-quiet w-full"><b>2</b> <span className="urdu !leading-normal">{L.still}</span></button></div>}
      {f.stage === 'thanks' && <div className="urdu text-lg !text-center">{L.thanks}</div>}
      {f.stage === 'expert' && <div className="urdu text-lg !text-center">{L.expertWill}</div>}
    </div>
  )
}

function InboxList({ items, playing, onPlay }: { items: any[]; playing: number | null; onPlay: (it: any) => void }) {
  if (!items.length) return <Empty icon={Inbox} title={L.noInbox}><span dir="ltr">Expert answers and outbreak alerts arrive here as voice messages.</span></Empty>
  return (
    <ul className="p-4 space-y-3">
      {items.map((it) => {
        const alert = it.kind === 'outbreak_alert'
        const follow = it.kind === 'followup'
        return (
          <li key={it.id} className={`surface p-4 ${alert ? 'border-danger/30' : ''}`}>
            <div className="flex items-center gap-2">
              <span className={`h-9 w-9 rounded-xl grid place-items-center ${alert ? 'bg-danger-50 text-danger' : 'bg-field-100 text-field-800'}`}>{alert ? <AlertTriangle size={18} /> : follow ? <RotateCcw size={18} /> : <UserRound size={18} />}</span>
              <div className="flex-1"><div className="urdu font-bold !leading-[1.8]">{it.title_ur}</div><div dir="ltr" className="text-[11px] text-muted text-right">{timeAgo(it.created_at)}</div></div>
              {!it.heard && <span className="h-2.5 w-2.5 rounded-full bg-mustard" />}
            </div>
            <div className="urdu text-[17px] mt-2 text-ink/90">{it.text_ur}</div>
            <button onClick={() => onPlay(it)} className="btn btn-quiet w-full mt-2">{playing === it.id ? <><Pause size={18} /> <span className="urdu !leading-normal">{L.stop}</span></> : <><Play size={18} /> <span className="urdu !leading-normal">{L.listen}</span></>}</button>
          </li>)
      })}
      <li dir="ltr" className="text-[11px] text-muted text-center flex items-center justify-center gap-2"><Mock>SMS / WhatsApp backup simulated</Mock></li>
    </ul>
  )
}

function Categories({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-full flex gap-1.5 overflow-x-auto no-scrollbar">
      {Object.entries(L.cats).map(([k, v]) => <button key={k} onClick={() => onChange(value === k ? '' : k)} className={`tag shrink-0 py-1 px-2.5 urdu !leading-normal text-[13px] ${value === k ? 'bg-field-800 text-white' : 'bg-white border border-line text-ink'}`}>{v}</button>)}
    </div>
  )
}

function PhotoDoor({ meta, phone, lang, onResult }: { meta: any; phone: string; lang: string; onResult: (r: any) => void }) {
  const [crop, setCrop] = useState('wheat')
  const [category, setCategory] = useState('disease')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [voice, setVoice] = useState<Blob | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rec = useRecorder()
  const ref = useRef<HTMLInputElement>(null)
  const pick = (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)); setRes(null); setSent(false); setErr(null) }
  const toggleRec = async () => { if (rec.recording) setVoice(await rec.stop()); else { setVoice(null); await rec.start() } }
  const analyse = async () => {
    if (!file) return
    setBusy(true); setErr(null); setRes(null); setSent(false)
    try {
      const c = await post('/api/call/start', { phone, language: lang })
      const fd = new FormData(); fd.append('crop', crop); fd.append('category', category); fd.append('image', file); fd.append('transcript', text)
      if (voice) fd.append('audio', voice, 'question.webm')
      const r = await api(`/api/call/${c.call_id}/photo`, { method: 'POST', body: fd })
      if (r.needs_text) setErr(r.message); else { setRes(r); setSent(r.escalated); onResult(r) }
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const toExpert = async () => { await post(`/api/query/${res.query.id}/to-expert`); setSent(true) }
  return (
    <div className="p-4 space-y-3">
      <div className="surface p-4 space-y-3">
        <div className="flex items-center gap-2"><span className="h-9 w-9 rounded-xl bg-field-50 text-field-700 border border-line grid place-items-center"><Camera size={18} /></span>
          <div><div className="urdu font-bold !leading-[1.8]">{L.sendPhoto}</div><div dir="ltr" className="text-[11px] text-muted text-right">WhatsApp door, analysed on-device</div></div></div>
        <Categories value={category} onChange={setCategory} />
        <div className="flex flex-wrap gap-1.5">{meta && Object.values(meta.crops).map((c: any) => <button key={c} onClick={() => setCrop(c)} className={`tag py-1.5 px-3 urdu !leading-normal text-[14px] ${crop === c ? 'bg-field-800 text-white' : 'bg-field-50 border border-line'}`}>{cropName(c)}</button>)}</div>
        {preview ? <button onClick={() => ref.current?.click()} className="block w-full"><img src={preview} alt="Leaf" className="w-full max-h-52 object-cover rounded-xl border border-line" /></button>
          : <button onClick={() => ref.current?.click()} className="btn btn-quiet w-full !py-6 flex-col"><ImagePlus size={26} /><span className="urdu !leading-normal">{L.pick}</span></button>}
        <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <div className="flex items-center gap-2">
          <button onClick={toggleRec} className={`btn shrink-0 ${rec.recording ? 'btn-danger' : 'btn-quiet'}`}>{rec.recording ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}</button>
          <span className="urdu text-[14px] !leading-normal text-muted flex-1">{rec.recording ? L.listening : voice ? L.recorded : L.askAbout}</span>
          {voice && <button onClick={() => speak(URL.createObjectURL(voice), '')} aria-label="Play recording" className="btn btn-quiet !px-2.5"><Play size={16} /></button>}
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L.typeHere} className="field urdu !leading-normal" />
        <button disabled={busy || !file || rec.recording} onClick={analyse} className="btn btn-primary w-full">{busy ? <Spinner /> : <Eye size={18} />} <span className="urdu !leading-normal">{L.analyse}</span></button>
        {busy && <div dir="ltr" className="text-xs text-muted text-center">Analysing the photo on this device, about 10 to 20 seconds</div>}
      </div>
      {err && <div dir="ltr" className="text-sm rounded-xl bg-warn-50 text-warn px-3 py-2">{err}</div>}
      {res && <div className="surface p-4 space-y-3">
        {res.vision?.description_ur && <div><div className="text-xs text-muted urdu !leading-normal">{L.sees}</div><div className="urdu text-[16px]">{res.vision.description_ur}</div></div>}
        {!res.escalated && <div className="border-t border-line pt-3"><div className="tag bg-field-100 text-field-800 mb-1"><ShieldCheck size={13} /> <span className="urdu !leading-normal">{L.fromKb}</span></div><div className="urdu text-[17px]">{res.answer_text}</div></div>}
        <div className="flex gap-2">
          <button onClick={() => speak(res.answer_audio, res.answer_text)} className="btn btn-quiet flex-1"><Volume2 size={17} /> <span className="urdu !leading-normal">{L.listen}</span></button>
          {sent ? <span className="tag bg-ink/5 text-ink flex-1 justify-center urdu !leading-normal"><UserRoundCheck size={14} /> {L.sent}</span>
            : <button onClick={toExpert} className="btn btn-primary flex-1"><UserRound size={17} /> <span className="urdu !leading-normal">{L.toExpertBtn}</span></button>}
        </div>
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
          {q.understanding?.weather?.temp_c !== undefined && <div className="rounded-xl border border-line bg-field-50 px-3 py-2 text-sm flex items-center gap-2"><CloudSun size={16} className="text-field-700" /> Weather in {q.tehsil}: {Math.round(q.understanding.weather.temp_c)}°C, humidity {q.understanding.weather.humidity}%, rain chance {q.understanding.weather.rain_chance ?? 0}%. Added to the spoken advice.</div>}
          <div className="text-xs text-muted">Crop: {CROP_EN[q.crop] || '—'}. Tehsil: {q.tehsil}.</div>
        </div>)}
    </div>
  )
}
