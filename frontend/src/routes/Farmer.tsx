import { useCallback, useEffect, useRef, useState } from 'react'
import { api, post, timeAgo, CROP_EN } from '../lib/api'
import { beep, speak, stopAudio, unlockAudio, useRecorder } from '../lib/audio'
import { useWS } from '../lib/ws'
import { Brand, LiveDot, ReasonChips, ScoreBar, Spinner, MockTag } from '../components/ui'

type Step = 'idle' | 'connecting' | 'welcome' | 'notice' | 'tehsil' | 'tehsil_pick' | 'crop' | 'duration' | 'ask' | 'thinking'
  | 'answer' | 'escalated' | 'more' | 'consent' | 'ended'
type Prompt = { text: string; audio_url: string | null }

const EN: Record<string, string> = {
  welcome: 'Welcome to AwaazSaathi. Press 1 for Punjabi, 2 for Urdu.',
  ai_notice: 'You are talking to a computer (AI), not a person. If the question is hard, an agronomist will call you back.',
  tehsil_confirm: 'Our records show your tehsil on screen. Press 1 if correct, 2 to change.',
  tehsil_pick: 'Press the number of your tehsil.',
  crop: 'Which crop? 1 wheat, 2 cotton, 3 rice, 4 sugarcane, 5 maize.',
  duration: 'Since when? 1 under 3 days, 2 about a week, 3 longer.',
  ask: 'After the beep, describe the problem. What do you see on leaves, stem or ears?',
  thinking: 'Thank you, understanding your question. Please wait.',
  escalated: 'Sent to our agronomist. An expert will call you back within a few hours. Do not spray anything before that.',
  more: 'Press 1 to ask another question, 2 to end the call.',
  consent: 'May we keep this call recording to improve the service? Your number is not stored. 1 = keep, 2 = delete now.',
  consent_yes: 'Thank you, recording kept. Goodbye.',
  consent_no: 'OK, your recording has been deleted. Goodbye.',
  photo_received: 'Photo received, looking at it.',
  not_heard: 'Sorry, could not hear clearly. Please say it again.',
}

const STATUS: Partial<Record<Step, { label: string; tone: string }>> = {
  thinking: { label: 'Thinking…', tone: 'bg-wheat/30 text-soil-900' },
  answer: { label: 'Speaking', tone: 'bg-leaf-100 text-leaf-800' },
  escalated: { label: 'Escalated to expert', tone: 'bg-orange-100 text-orange-800' },
}

export default function Farmer() {
  const [meta, setMeta] = useState<any>(null)
  const [prompts, setPrompts] = useState<Record<string, Prompt>>({})
  const [phone, setPhone] = useState('')
  const [farmerId, setFarmerId] = useState<number | null>(null)
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
  const [playingInbox, setPlayingInbox] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const rec = useRecorder()
  const stepRef = useRef<Step>('idle'); stepRef.current = step
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api('/api/demo/personas').then((m) => { setMeta(m); setPhone(m.personas[24]?.phone || m.personas[0].phone) })
    api('/api/prompts').then(setPrompts).catch(() => {})
    api('/api/status').then((s) => setOffline(s.offline)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!phone) return
    api(`/api/farmer/lookup?phone=${phone}`).then((r) => setFarmerId(r.farmer_id))
  }, [phone])

  const loadInbox = useCallback(() => { if (farmerId) api(`/api/farmer/${farmerId}/inbox`).then(setInbox).catch(() => {}) }, [farmerId])
  useEffect(loadInbox, [loadInbox])

  const live = useWS(farmerId ? [`farmer:${farmerId}`, 'reset', 'status'] : ['reset', 'status'], (m) => {
    if (m.event === 'callback') { loadInbox(); if (stepRef.current === 'idle' || stepRef.current === 'ended') { setIncoming(m.data); beep(660, 400, 3) } }
    if (m.event === 'inbox') { loadInbox(); beep(520, 250, 2) }
    if (m.event === 'reset') { loadInbox() }
    if (m.event === 'offline') setOffline(m.data.on)
  })

  const say = useCallback(async (key: string, after?: () => void) => {
    const p = prompts[key]
    setSpeaking(true)
    await speak(p?.audio_url, p?.text || '')
    setSpeaking(false)
    after?.()
  }, [prompts])

  const go = (s: Step) => { setStep(s); setNote(null) }

  // ---- step entry: play the prompt for each step
  useEffect(() => {
    const k: Partial<Record<Step, string>> = { welcome: 'welcome', tehsil: 'tehsil_confirm', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', more: 'more', consent: 'consent' }
    if (step === 'notice') say('ai_notice', () => stepRef.current === 'notice' && go(call?.known ? 'tehsil' : 'tehsil_pick'))
    else if (step === 'ask') say('ask', () => beep(1000, 220))
    else if (k[step]) say(k[step]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const startCall = async () => {
    unlockAudio()
    setResult(null); setCrop(''); setDuration(''); setTyped('')
    go('connecting')
    beep(440, 600, 2)
    try {
      const c = await post('/api/call/start', { phone, language: lang })
      setCall(c); setFarmerId(c.farmer_id)
      setTimeout(() => go('welcome'), 900)
    } catch (e: any) { setNote(e.message); go('idle') }
  }

  const endCall = () => { stopAudio(); go('idle'); setCall(null) }

  const submit = async (opts: { audio?: Blob; transcript?: string }) => {
    stopAudio()
    go('thinking')
    say('thinking')
    const fd = new FormData()
    fd.append('crop', crop); fd.append('duration', duration)
    if (opts.transcript) fd.append('transcript', opts.transcript)
    if (opts.audio) fd.append('audio', opts.audio, 'question.webm')
    try {
      const r = await api(`/api/call/${call.call_id}/ask`, { method: 'POST', body: fd })
      if (r.needs_text) {
        setNote(r.stt_engine === 'offline' ? 'Offline mode: speech recognition paused. Type the question or pick a sample.' : 'Could not transcribe. Type it or pick a sample.')
        go('ask'); return
      }
      deliver(r)
    } catch (e: any) { setNote(`Error: ${e.message}`); go('ask') }
  }

  const sendPhoto = async (file: File) => {
    go('thinking'); say('photo_received')
    const fd = new FormData()
    fd.append('crop', crop); fd.append('duration', duration); fd.append('image', file)
    try {
      const r = await api(`/api/call/${call.call_id}/photo`, { method: 'POST', body: fd })
      if (r.needs_text) { setNote(r.message); go('ask'); return }
      deliver(r)
    } catch (e: any) { setNote(`Error: ${e.message}`); go('ask') }
  }

  const deliver = async (r: any) => {
    setResult(r)
    go(r.escalated ? 'escalated' : 'answer')
    setSpeaking(true)
    await speak(r.answer_audio, r.answer_text)
    setSpeaking(false)
    if (['answer', 'escalated'].includes(stepRef.current)) go('more')
  }

  const press = async (d: string) => {
    if (step === 'idle' || step === 'ended' || step === 'connecting' || step === 'thinking') return
    beep(1200 + Number(d) * 40, 70)
    stopAudio(); setSpeaking(false)
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
      setSpeaking(true)
      await speak(prompts[keep ? 'consent_yes' : 'consent_no']?.audio_url, prompts[keep ? 'consent_yes' : 'consent_no']?.text || '')
      setSpeaking(false)
      setNote(keep ? 'Recording kept (consent = yes).' : 'Recording deleted (consent = no).')
      setStep('ended')
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (/^[0-9]$/.test(e.key) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) press(e.key) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const toggleRec = async () => {
    if (rec.recording) { const b = await rec.stop(); if (b && b.size > 1000) submit({ audio: b }); else setNote('Too short. Hold on and speak a bit longer.') }
    else { stopAudio(); await rec.start() }
  }

  const playInbox = async (it: any) => {
    setPlayingInbox(it.id)
    const intro = it.kind === 'callback' ? '' : ''
    await speak(it.audio_url, intro + it.text_ur)
    setPlayingInbox(null)
    post(`/api/inbox/${it.id}/heard`).then(loadInbox)
  }

  const acceptIncoming = async () => {
    const d = incoming; setIncoming(null)
    const item = inbox.find((i) => i.query_id === d.query_id) || { id: -1, audio_url: d.audio_url, text_ur: d.text, kind: 'callback' }
    setPlayingInbox(item.id)
    await speak(d.audio_url, d.text)
    if (d.expert_audio_url) await speak(d.expert_audio_url, '')
    setPlayingInbox(null)
    if (item.id > 0) post(`/api/inbox/${item.id}/heard`).then(loadInbox)
  }

  const promptKey: Partial<Record<Step, string>> = { welcome: 'welcome', notice: 'ai_notice', tehsil: 'tehsil_confirm', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', ask: 'ask', thinking: 'thinking', more: 'more', consent: 'consent' }
  const pk = promptKey[step]

  return (
    <div className="min-h-full bg-gradient-to-b from-soil-100 to-cream">
      <Brand app="Farmer call simulator" right={<>{offline && <span className="chip bg-orange-100 text-orange-800">Offline mode</span>}<LiveDot on={live} /></>} />
      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* ---------- PHONE ---------- */}
        <div className="mx-auto w-full max-w-[400px]">
          <div className="rounded-[2.6rem] bg-soil-900 p-3 shadow-2xl">
            <div className="relative rounded-[2.1rem] bg-gradient-to-b from-leaf-900 via-leaf-800 to-leaf-900 text-white min-h-[720px] flex flex-col overflow-hidden">
              <div className="flex justify-between px-6 pt-3 text-[11px] text-leaf-200"><span>Jazz 4G</span><span className="mx-auto h-5 w-24 rounded-full bg-black/60" /><span>📶 🔋</span></div>

              {step === 'idle' || step === 'ended' ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 fade-in">
                  <img src="/icon.svg" className="h-20 w-20 rounded-3xl shadow-lg" alt="" />
                  <div className="text-center">
                    <div className="text-2xl font-extrabold">AwaazSaathi</div>
                    <div className="urdu text-xl text-leaf-200 !text-center">آواز ساتھی — کسان کا ساتھی</div>
                  </div>
                  {step === 'ended' && <div className="rounded-xl bg-white/10 px-4 py-2 text-sm text-center">Call ended. {note}</div>}
                  <label className="w-full text-xs text-leaf-200">Calling from (demo caller ID)
                    <select value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2.5 text-white text-sm">
                      {meta?.personas.map((p: any) => <option key={p.phone} value={p.phone} className="text-black">{p.phone} · {p.tehsil}</option>)}
                    </select>
                  </label>
                  <button onClick={startCall} className="h-20 w-20 rounded-full bg-leaf-500 hover:bg-leaf-600 text-3xl shadow-lg pulse-ring" aria-label="Call">📞</button>
                  <div className="text-sm text-leaf-200">Tap to call the helpline</div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col px-5 pb-4">
                  <div className="text-center mt-3">
                    <div className="text-xs text-leaf-200">{step === 'connecting' ? 'Calling…' : 'In call · AwaazSaathi helpline'}</div>
                    <div className="flex justify-center gap-2 mt-2 flex-wrap">
                      {lang && step !== 'welcome' && step !== 'connecting' && <span className="chip bg-white/10">{lang === 'pa' ? 'پنجابی' : 'اردو'}</span>}
                      {call?.tehsil && !['welcome', 'connecting', 'notice'].includes(step) && <span className="chip bg-white/10">{call.tehsil}</span>}
                      {crop && <span className="chip bg-white/10">{CROP_EN[crop]}</span>}
                      <span className="chip bg-wheat text-soil-900">🤖 AI assistant</span>
                    </div>
                  </div>

                  {/* prompt card */}
                  <div className="mt-4 rounded-2xl bg-white/10 p-4 min-h-[170px] fade-in" key={step}>
                    {step === 'connecting' && <div className="flex flex-col items-center gap-3 py-6"><div className="h-16 w-16 rounded-full bg-leaf-500 ring-shake flex items-center justify-center text-2xl">📞</div><div className="text-leaf-200">Connecting…</div></div>}
                    {pk && <>
                      <div className="urdu text-[22px] leading-[2.4]">{prompts[pk]?.text}</div>
                      <div className="text-[12px] text-leaf-200 mt-1">{EN[pk === 'tehsil' ? 'tehsil_confirm' : pk]}</div>
                    </>}
                    {step === 'tehsil' && <div className="mt-2 text-center"><span className="urdu text-3xl font-bold text-wheat !text-center inline-block">{call?.tehsil_ur}</span><div className="text-xs text-leaf-200">{call?.tehsil}</div></div>}
                    {step === 'tehsil_pick' && <div className="grid grid-cols-2 gap-1 mt-2 text-sm">{meta?.tehsils.slice(0, 10).map((t: any, i: number) => <div key={t.name} className="rounded bg-white/5 px-2 py-1"><b className="text-wheat">{(i + 1) % 10}</b> {t.name}</div>)}</div>}
                    {(step === 'answer' || step === 'escalated') && result && <>
                      <div className={`chip mb-2 ${step === 'answer' ? 'bg-leaf-500' : 'bg-orange-500'}`}>{step === 'answer' ? '✓ AI answer (from expert-reviewed knowledge)' : '⇪ Sent to human expert'}</div>
                      <div className="urdu text-[21px] leading-[2.3]">{result.answer_text}</div>
                    </>}
                  </div>

                  {/* status line */}
                  <div className="h-8 mt-3 flex items-center justify-center gap-2 text-sm">
                    {rec.recording ? <span className="chip bg-red-500 text-white"><span className="bars text-white"><span /><span /><span /><span /></span> Listening…</span>
                      : step === 'thinking' ? <span className="chip bg-wheat text-soil-900"><Spinner /> Thinking… (speech → understanding → knowledge check)</span>
                      : speaking ? <span className="chip bg-white/15"><span className="bars text-wheat"><span /><span /><span /><span /></span> Speaking</span>
                      : STATUS[step] ? <span className={`chip ${STATUS[step]!.tone}`}>{STATUS[step]!.label}</span> : null}
                  </div>

                  {step === 'ask' ? (
                    <div className="mt-2 flex flex-col items-center gap-3">
                      <button onClick={toggleRec} className={`h-24 w-24 rounded-full text-4xl shadow-xl ${rec.recording ? 'bg-red-500 pulse-ring' : 'bg-wheat text-soil-900 hover:bg-wheat-600'}`} aria-label="Record question">{rec.recording ? '■' : '🎙️'}</button>
                      <div className="text-xs text-leaf-200">{rec.recording ? 'Tap to stop and send' : 'Tap, speak your question, tap again'}</div>
                      {(rec.error || note) && <div className="text-xs rounded-lg bg-orange-500/20 text-orange-100 px-3 py-2 w-full">{rec.error || note}</div>}
                      <div className="w-full flex gap-2">
                        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="یا یہاں لکھیں… / or type" dir="rtl" className="flex-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm placeholder:text-leaf-200/70 urdu !leading-normal" />
                        <button disabled={!typed.trim()} onClick={() => submit({ transcript: typed })} className="btn bg-white/15 text-sm">Send</button>
                      </div>
                      <div className="w-full flex flex-wrap gap-1.5">
                        {meta && Object.entries(meta.canned).filter(([, c]: any) => !crop || c.crop === crop).map(([k, c]: any) =>
                          <button key={k} onClick={() => submit({ transcript: c.transcript })} className="chip bg-white/10 hover:bg-white/20 text-[11px] text-left">▶ {c.label.split(':')[0]}: {c.label.split(':')[1]?.split('(')[0]}</button>)}
                      </div>
                      <button onClick={() => fileRef.current?.click()} className="btn bg-[#25D366] text-white w-full text-sm">📷 Send leaf photo (WhatsApp door)</button>
                      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && sendPhoto(e.target.files[0])} />
                    </div>
                  ) : (
                    <Keypad onPress={press} active={['welcome', 'notice', 'tehsil', 'tehsil_pick', 'crop', 'duration', 'more', 'consent'].includes(step)} />
                  )}
                  <button onClick={endCall} className="mt-auto mx-auto h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-2xl" aria-label="Hang up">✆</button>
                </div>
              )}

              {/* incoming callback overlay */}
              {incoming && (
                <div className="absolute inset-0 bg-leaf-900/95 flex flex-col items-center justify-center gap-6 slide-down z-10 px-6 text-center">
                  <div className="text-leaf-200 text-sm">Incoming call</div>
                  <div className="h-24 w-24 rounded-full bg-wheat text-4xl flex items-center justify-center ring-shake">👨‍🌾</div>
                  <div><div className="text-2xl font-bold">AwaazSaathi Expert</div><div className="text-leaf-200 text-sm">Answer approved by {incoming.by}</div></div>
                  <div className="flex gap-10">
                    <button onClick={() => setIncoming(null)} className="h-16 w-16 rounded-full bg-red-600 text-2xl">✕</button>
                    <button onClick={acceptIncoming} className="h-16 w-16 rounded-full bg-leaf-500 text-2xl pulse-ring">📞</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-soil-500 mt-3">Simulates a button-phone call. Use the on-screen keypad or your keyboard digits. <MockTag>telco simulated</MockTag></p>
        </div>

        {/* ---------- SIDE: pipeline + inbox ---------- */}
        <div className="space-y-6">
          <Pipeline result={result} step={step} />
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Farmer's callbacks & alerts</h2>
              <span className="text-xs text-soil-500">{farmerId ? `Farmer #${farmerId}` : ''} · SMS/WhatsApp backup <MockTag /></span>
            </div>
            {inbox.length === 0 ? <div className="text-sm text-soil-500 py-6 text-center">No callbacks yet. Expert answers arrive here as a voice call.</div> :
              <ul className="space-y-2">{inbox.map((it) => (
                <li key={it.id} className={`rounded-xl border p-3 fade-in ${it.kind === 'outbreak_alert' ? 'border-orange-300 bg-orange-50' : 'border-leaf-200 bg-leaf-100/40'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`chip ${it.kind === 'outbreak_alert' ? 'bg-orange-200 text-orange-900' : 'bg-leaf-200 text-leaf-900'}`}>{it.kind === 'outbreak_alert' ? '⚠ Outbreak alert' : '☎ Expert callback'}</span>
                    <span className="text-xs text-soil-500">{timeAgo(it.created_at)} {!it.heard && <b className="text-leaf-700">· new</b>}</span>
                  </div>
                  <div className="urdu text-lg mt-1">{it.text_ur}</div>
                  <button onClick={() => playInbox(it)} className="btn btn-ghost text-sm mt-1">{playingInbox === it.id ? <><span className="bars text-leaf-700"><span /><span /><span /></span> Playing</> : '▶ Play voice'}</button>
                </li>))}
              </ul>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Keypad({ onPress, active }: { onPress: (d: string) => void; active: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
  return (
    <div className={`grid grid-cols-3 gap-3 mt-3 px-4 ${active ? '' : 'opacity-40 pointer-events-none'}`}>
      {keys.map((k) => (
        <button key={k} onClick={() => onPress(k)} className="h-14 rounded-full bg-white/10 hover:bg-white/20 active:bg-wheat active:text-soil-900 text-2xl font-semibold">{k}</button>
      ))}
    </div>
  )
}

function Pipeline({ result, step }: { result: any; step: Step }) {
  const q = result?.query
  const stages = [
    { k: 'Voice gateway', d: 'Call + keypad triage', on: step !== 'idle' },
    { k: 'Speech-to-text', d: result?.stt_engine || 'Groq Whisper', on: !!q },
    { k: 'Understand', d: 'Crop, symptoms, risk flags', on: !!q },
    { k: 'RAG retrieval', d: q ? `top score ${q.retrieval_score.toFixed(2)}` : 'Expert-reviewed KB', on: !!q },
    { k: 'Nil detection', d: q ? (q.reasons.length ? 'escalate' : 'safe to answer') : 'Explicit rules', on: !!q, warn: q?.reasons?.length },
    { k: q?.status === 'answered_ai' ? 'AI answer → TTS' : 'Expert queue', d: q ? (q.status === 'answered_ai' ? 'Spoken now' : q.route === 'senior_only' ? 'Senior only' : 'Junior drafts → senior') : '', on: !!q },
  ]
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-lg">Behind the scenes</h2><span className="text-xs text-soil-500">What the AI decided, and why</span></div>
      <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {stages.map((s, i) => (
          <li key={s.k} className={`rounded-xl px-3 py-2 border text-sm transition ${s.on ? (s.warn ? 'border-orange-300 bg-orange-50' : 'border-leaf-200 bg-leaf-100/50') : 'border-soil-200 bg-soil-100/40 text-soil-500'}`}>
            <div className="font-semibold">{i + 1}. {s.k}</div><div className="text-xs opacity-80 truncate">{s.d}</div>
          </li>))}
      </ol>
      {!q ? <div className="text-sm text-soil-500">Ask a question in the call to see the transcript, the retrieved sources and the confidence checks.</div> : (
        <div className="space-y-3 fade-in">
          <div><div className="text-xs font-semibold text-soil-500 mb-1">Transcript ({q.channel})</div><div className="urdu text-lg bg-soil-100/60 rounded-lg px-3 py-1">{q.transcript}</div></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ScoreBar label="Retrieval confidence" value={q.retrieval_score} min={0.3} />
            <ScoreBar label="Grounding in sources" value={q.grounding} min={0.6} />
          </div>
          <div><div className="text-xs font-semibold text-soil-500 mb-1">Checks</div><ReasonChips reasons={q.reasons} /></div>
          <div><div className="text-xs font-semibold text-soil-500 mb-1">Retrieved knowledge</div>
            <ul className="space-y-1">{q.retrieved.map((r: any) => <li key={r.kb_id} className="flex items-center justify-between gap-2 text-sm"><span className="urdu !leading-normal">{r.title_ur}</span><span className="font-mono text-xs text-soil-500">KB#{r.kb_id} · {r.score.toFixed(2)}</span></li>)}</ul>
          </div>
        </div>)}
    </div>
  )
}
