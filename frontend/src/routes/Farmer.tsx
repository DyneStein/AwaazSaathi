import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Captions, Keyboard, Mic, MicOff, Send, SlidersHorizontal } from 'lucide-react'
import { api, post } from '../lib/api'
import { askMicPermission, beep, preloadVoice, speak, stopAudio, unlockAudio, useRecorder } from '../lib/audio'
import { usePollWhenOffline, useWS } from '../lib/ws'
import { useVideoCall } from '../lib/rtc'
import { DeviceFrame, LiveDot, Logo, Mock, Segmented, VideoCallView } from '../components/ui'
import { KeypadPhone, type Lcd, type PhoneKey } from '../components/KeypadPhone'
import { Decision } from '../components/Decision'
import { Chat, type Lang } from './farmer/Chat'
import { CallOverlay, KeypadScreen, SettingsSheet, SetupScreen, VoiceBanner, micAllowed, readSetup, saveSetup, useKeepAwake, useSecureLink, type PhoneSetup } from './farmer/PhoneMode'

type Step = 'idle' | 'connecting' | 'welcome' | 'notice' | 'tehsil' | 'tehsil_pick' | 'crop' | 'duration' | 'ask' | 'thinking'
  | 'answer' | 'escalated' | 'more' | 'consent' | 'ended'
type Prompt = { text: string; audio_url: string | null }
/** A call the helpline places to the farmer: an expert's answer, the 3-day follow-up, or a saved voice message being played. */
type Aux = { kind: 'callback' | 'followup' | 'message'; stage: 'ringing' | 'playing' | 'choose' | 'done'; data: any }
type Line = { id: number; who: 'line' | 'key' | 'farmer'; ur?: string; en?: string }
type View = 'both' | 'keypad' | 'smart'

const HELPLINE = '0800 29229'
// English subtitles for the audience; the farmer only hears the Urdu or Punjabi voice.
const EN: Record<string, string> = {
  welcome: 'Welcome to AwaazSaathi. Press 1 for Punjabi, 2 for Urdu.',
  ai_notice: 'You are speaking to an AI, not a person. If the question is hard, an agronomist will call you back.',
  tehsil_confirm: 'Our record says this is your tehsil. Press 1 if correct, 2 to change.',
  tehsil_pick: 'Press the number of your tehsil.',
  crop: 'Which crop? 1 wheat, 2 cotton, 3 rice, 4 sugarcane, 5 maize.',
  duration: 'Since when? 1 under 3 days, 2 about a week, 3 longer.',
  ask: 'After the beep, describe the problem. Press any key when you finish.',
  thinking: 'Thank you. Understanding your question, please wait.',
  more: '1 new question, 2 end call, 3 hear the answer again, 4 record your question again.',
  consent: 'May we keep this recording to improve the service? 1 keep, 2 delete now.',
  consent_yes: 'Thank you, your recording is saved. Goodbye.',
  consent_no: 'Your recording has been deleted. Goodbye.',
}
const FOLLOW = {
  ur: { thanks: 'شکریہ! خوشی ہوئی کہ فصل بہتر ہے۔ اللہ حافظ۔', expert: 'ٹھیک ہے، ہمارا ماہر آپ کو جلد فون کرے گا۔ اللہ حافظ۔' },
  pa: { thanks: 'شکریہ! خوشی ہوئی کہ فصل بہتر اے۔ اللہ حافظ۔', expert: 'ٹھیک اے، ساڈا ماہر تہانوں چھیتی فون کرے گا۔ اللہ حافظ۔' },
}
const IN_CALL_KEYS: Step[] = ['welcome', 'notice', 'tehsil', 'tehsil_pick', 'crop', 'duration', 'ask', 'more', 'consent', 'answer', 'escalated']
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Farmer() {
  // On a real phone (opened from the QR code, or any narrow screen) the page becomes one phone; on a laptop it is the presenter stage.
  const [params] = useSearchParams()
  const phoneMode = params.get('device') === 'phone' || (params.get('device') !== 'stage' && window.innerWidth < 768)
  const [setup, setSetup] = useState<PhoneSetup | null>(() => (phoneMode ? readSetup() : null))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const secureLink = useSecureLink()
  useKeepAwake(phoneMode && !!setup)
  const [meta, setMeta] = useState<any>(null)
  const [prompts, setPrompts] = useState<Record<string, Prompt>>({})
  const [phone, setPhone] = useState('')
  const [farmerId, setFarmerId] = useState<number | null>(null)
  const [view, setView] = useState<View>(() => (window.innerWidth >= 1024 ? 'both' : 'keypad'))
  const [step, setStep] = useState<Step>('idle')
  const [call, setCall] = useState<any>(null)
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('farmerLang') as Lang) || 'pa')
  const [crop, setCrop] = useState('')
  const [duration, setDuration] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [inbox, setInbox] = useState<any[]>([])
  const [aux, setAux] = useState<Aux | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [keys, setKeys] = useState<string[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [offline, setOffline] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [touched, setTouched] = useState(Date.now())
  const rec = useRecorder()
  const stepRef = useRef<Step>('idle'); stepRef.current = step
  const auxRef = useRef<Aux | null>(null); auxRef.current = aux
  const recRef = useRef(false); recRef.current = rec.recording
  const t0 = useRef(0)
  const lineId = useRef(0)
  const consentDone = useRef(true)
  const logEnd = useRef<HTMLDivElement>(null)   // the scrolling captions box

  useEffect(() => {
    api('/api/demo/personas').then((m) => {
      setMeta(m)
      const saved = phoneMode ? readSetup() : null
      setPhone(saved && m.personas.some((p: any) => p.phone === saved.phone) ? saved.phone : m.personas[24]?.phone || m.personas[0].phone)
    })
    api('/api/status').then((s) => setOffline(s.offline)).catch(() => {})
  }, [])
  useEffect(() => { api(`/api/prompts?lang=${lang}`).then(setPrompts).catch(() => {}); try { localStorage.setItem('farmerLang', lang) } catch { /* ignore */ } }, [lang])
  // Fetch the call's voice prompts while the farmer is still looking at the phone, so a weak link does not delay them.
  useEffect(() => { if (phoneMode) preloadVoice(['welcome', 'ai_notice', 'tehsil_confirm', 'crop', 'duration', 'ask', 'thinking', 'more', 'consent', 'consent_yes', 'consent_no', 'tehsil_pick'].map((k) => prompts[k]?.audio_url)) }, [prompts, phoneMode])
  useEffect(() => { if (phone) api(`/api/farmer/lookup?phone=${phone}`).then((r) => setFarmerId(r.farmer_id)) }, [phone])
  const loadInbox = useCallback(() => { if (farmerId) api(`/api/farmer/${farmerId}/inbox`).then(setInbox).catch(() => {}); else setInbox([]) }, [farmerId])
  useEffect(loadInbox, [loadInbox])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { const box = logEnd.current; if (box) box.scrollTop = box.scrollHeight }, [lines.length])   // scroll the captions box only, never the page

  const addLine = useCallback((l: Omit<Line, 'id'>) => setLines((x) => [...x.slice(-40), { ...l, id: ++lineId.current }]), [])
  const lineFree = () => ['idle', 'ended'].includes(stepRef.current) && !auxRef.current

  const myTopic = farmerId ? `farmer:${farmerId}` : ''
  const ws = useWS(myTopic ? [myTopic, 'reset', 'status'] : ['reset', 'status'], (m) => {
    if (m.event.startsWith('rtc_')) { video.onSignal(m.event, m.data); return }
    if (m.event === 'callback') {
      loadInbox()
      if (m.data.channel && m.data.channel !== 'voice') beep(520, 200, 2)              // asked from the smartphone: answer arrives in the chat
      else if (lineFree()) { setMenu(null); setAux({ kind: 'callback', stage: 'ringing', data: m.data }) }
    }
    if (m.event === 'inbox') { loadInbox(); beep(520, 250, 2); setTouched(Date.now()) }
    if (m.event === 'followup') { loadInbox(); if (lineFree()) { setMenu(null); setAux({ kind: 'followup', stage: 'ringing', data: m.data }) } }
    if (m.event === 'reset') { loadInbox(); setResetKey((k) => k + 1); setResult(null); setLines([]); setAux(null) }
    if (m.event === 'offline') setOffline(m.data.on)
  })
  const video = useVideoCall(ws.send, myTopic)

  // A call that arrived while the phone was asleep or offline rings as soon as the phone is back (phone mode only).
  usePollWhenOffline(ws.connected || !farmerId, () => { recheck.current = true; loadInbox() })
  const recheck = useRef(false)
  const rang = useRef<Set<number>>(new Set())
  const wasConnected = useRef(false)
  useEffect(() => {
    if (ws.connected && !wasConnected.current && farmerId) { recheck.current = true; loadInbox() }
    wasConnected.current = ws.connected
  }, [ws.connected, farmerId, loadInbox])
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible') { recheck.current = true; loadInbox() } }
    document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h)
  }, [loadInbox])
  useEffect(() => {
    if (!recheck.current || !phoneMode) return
    recheck.current = false
    const recent = Date.now() - 15 * 60 * 1000
    const it = inbox.find((i) => !i.heard && ['callback', 'followup'].includes(i.kind) && (i.channel || 'voice') === 'voice' && new Date(i.created_at).getTime() > recent && !rang.current.has(i.id))
    if (it && lineFree()) { rang.current.add(it.id); setMenu(null); setAux({ kind: it.kind, stage: 'ringing', data: { query_id: it.query_id, text: it.text_ur, audio_url: it.audio_url, by: 'the agronomist' } }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, phoneMode])

  // The phone keeps ringing until it is answered or rejected.
  useEffect(() => {
    if (aux?.stage !== 'ringing') return
    beep(740, 380, 2); try { navigator.vibrate?.([300, 150, 300]) } catch { /* ignore */ }
    const t = setInterval(() => beep(740, 380, 2), 2400)
    return () => clearInterval(t)
  }, [aux?.stage, aux?.data])

  const say = useCallback(async (key: string, after?: () => void, override?: Prompt) => {
    const p = override || prompts[key]
    addLine({ who: 'line', ur: p?.text, en: EN[key] })
    setSpeaking(true); await speak(p?.audio_url, p?.text || ''); setSpeaking(false); after?.()
  }, [prompts, addLine])
  const go = (s: Step) => { setStep(s); setNote(null) }

  const startListening = async () => {
    beep(1000, 220); await wait(280)                     // wait so the beep is not part of the recording
    if (stepRef.current !== 'ask' || recRef.current) return
    if (!(await rec.start())) setNote('The microphone is not available here. Use a sample question or type one below.')
  }

  useEffect(() => {
    const k: Partial<Record<Step, string>> = { welcome: 'welcome', tehsil_pick: 'tehsil_pick', crop: 'crop', duration: 'duration', more: 'more', consent: 'consent' }
    if (step === 'notice') say('ai_notice', () => stepRef.current === 'notice' && go(call?.known ? 'tehsil' : 'tehsil_pick'))
    else if (step === 'tehsil') {
      const p: Prompt = call?.tehsil_confirm || prompts.tehsil_confirm
      if (p && !p.audio_url) api(`/api/tts?text=${encodeURIComponent(p.text)}`).then((r) => { if (stepRef.current === 'tehsil') say('tehsil_confirm', undefined, { ...p, audio_url: r.audio_url }) }).catch(() => say('tehsil_confirm', undefined, p))
      else say('tehsil_confirm', undefined, p)
    }
    else if (step === 'ask') say('ask', () => { if (stepRef.current === 'ask') startListening() })
    else if (k[step]) say(k[step]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // A recording never runs longer than 40 seconds.
  const finishRecording = useRef<() => void>(() => {})
  useEffect(() => { if (!rec.recording) return; const t = setTimeout(() => finishRecording.current(), 40000); return () => clearTimeout(t) }, [rec.recording])

  const startCall = async () => {
    unlockAudio(); stopAudio(); setResult(null); setCrop(''); setDuration(''); setTyped(''); setKeys([]); setLines([]); setMenu(null)
    go('connecting'); beep(440, 600, 2)
    // Ask for the microphone now, so the browser's permission box does not interrupt the question later.
    askMicPermission()
    try {
      const c = await post('/api/call/start', { phone, language: lang })
      setCall(c); setFarmerId(c.farmer_id); consentDone.current = false
      setTimeout(() => { if (stepRef.current === 'connecting') { t0.current = Date.now(); go('welcome') } }, 900)
    } catch (e: any) { setNote(`The call could not connect (${e.message}).`); go('idle') }
  }
  const endCall = () => {
    stopAudio(); setSpeaking(false)
    if (rec.recording) rec.stop()
    // Hanging up before the consent question means no consent: the recording is deleted.
    if (call && !consentDone.current) { consentDone.current = true; post(`/api/call/${call.call_id}/consent`, { keep: false }).catch(() => {}) }
    go('ended'); setCall(null)
  }

  const deliver = async (r: any) => {
    setResult(r); go(r.escalated ? 'escalated' : 'answer')
    addLine({ who: 'farmer', ur: r.query.transcript, en: 'What the helpline heard' })
    const src = r.query.understanding?.evidence
    addLine({ who: 'line', ur: r.answer_text, en: r.escalated ? 'Not answered by the AI. Sent to an agronomist, who will call back.' : `Reviewed answer${src?.title_en ? `: ${src.title_en}` : ''}, read word for word${(r.query.understanding?.answer_parts?.length || 0) > 1 ? ', plus advice from today’s weather' : ''}.` })
    setSpeaking(true); await speak(r.answer_audio, r.answer_text); setSpeaking(false)
    if (['answer', 'escalated'].includes(stepRef.current)) go('more')
  }
  const submit = async (opts: { audio?: Blob; transcript?: string }) => {
    if (!call) return
    if (recRef.current) await rec.stop()
    stopAudio(); go('thinking'); say('thinking')
    const fd = new FormData(); fd.append('crop', crop); fd.append('duration', duration)
    if (opts.transcript) fd.append('transcript', opts.transcript)
    if (opts.audio) fd.append('audio', opts.audio, 'question.webm')
    try {
      const r = await api(`/api/call/${call.call_id}/ask`, { method: 'POST', body: fd })
      if (stepRef.current !== 'thinking') return
      if (r.needs_text) { go('ask'); setNote(r.stt_engine === 'offline' ? 'Offline mode: speech recognition is paused. Use a sample question or type one.' : 'The recording could not be understood. Speak again after the beep, or use a sample question.'); return }
      setTyped(''); deliver(r)
    } catch (e: any) { if (stepRef.current === 'thinking') { go('ask'); setNote(`The server did not answer (${e.message}). Try again.`) } }
  }
  finishRecording.current = async () => { const b = await rec.stop(); if (b && b.size > 1000) submit({ audio: b }); else setNote('That recording was too short. Press any key and speak again.') }

  const press = async (d: string) => {
    if (!IN_CALL_KEYS.includes(step) || !call) return
    beep(d === '*' ? 1180 : d === '#' ? 1560 : 1200 + Number(d) * 40, 70); stopAudio(); setSpeaking(false)
    setKeys((k) => [...k.slice(-7), d]); addLine({ who: 'key', en: d })
    if (step === 'ask') { if (rec.recording) finishRecording.current(); else startListening(); return }
    if (step === 'answer' || step === 'escalated') { go('more'); return }
    if (step === 'welcome' && (d === '1' || d === '2')) {
      const l: Lang = d === '1' ? 'pa' : 'ur'
      const p = await api(`/api/prompts?lang=${l}`); setPrompts(p); setLang(l)
      const c = await post(`/api/call/${call.call_id}/language`, { language: l }); if (c.tehsil_confirm) setCall({ ...call, tehsil_confirm: c.tehsil_confirm })
      go('notice')
    }
    else if (step === 'notice') go(call.known ? 'tehsil' : 'tehsil_pick')
    else if (step === 'tehsil') { if (d === '1') go('crop'); else if (d === '2') go('tehsil_pick') }
    else if (step === 'tehsil_pick') {
      const t = meta?.tehsils?.[Number(d === '0' ? 10 : d) - 1]
      if (t) { await post(`/api/call/${call.call_id}/tehsil`, { tehsil: t.name }); setCall({ ...call, tehsil: t.name, tehsil_ur: t.ur }); go('crop') }
    }
    else if (step === 'crop' && meta?.crops[d]) { setCrop(meta.crops[d]); go('duration') }
    else if (step === 'duration' && meta?.durations[d]) { setDuration(meta.durations[d]); go('ask') }
    else if (step === 'more') {
      if (d === '1' || d === '4') { setResult(null); go('ask') }
      else if (d === '2') go('consent')
      else if (d === '3' && result) { setSpeaking(true); await speak(result.answer_audio, result.answer_text); setSpeaking(false); if (stepRef.current === 'more') say('more') }
    }
    else if (step === 'consent' && (d === '1' || d === '2')) {
      const keep = d === '1'
      consentDone.current = true
      await post(`/api/call/${call.call_id}/consent`, { keep })
      await say(keep ? 'consent_yes' : 'consent_no')
      if (stepRef.current === 'consent') { setCall(null); go('ended') }
    }
  }

  const markHeard = (it: any) => post(`/api/inbox/${it.id}/heard`).then(loadInbox).catch(() => {})
  const finishAux = (ms = 1600) => { setAux((a) => a && { ...a, stage: 'done' }); setTimeout(() => setAux((a) => (a?.stage === 'done' ? null : a)), ms) }
  const acceptAux = async () => {
    const a = auxRef.current; if (!a) return
    unlockAudio(); t0.current = Date.now(); setLines([]); setAux({ ...a, stage: 'playing' })
    const d = a.data
    if (a.kind === 'callback') {
      addLine({ who: 'line', ur: d.text, en: `The agronomist’s answer, approved by ${d.by}.` })
      await speak(d.audio_url, d.text)
      if (d.expert_audio_url) await speak(d.expert_audio_url, '')
      const item = inbox.find((i) => i.query_id === d.query_id && i.kind === 'callback'); if (item) markHeard(item)
      finishAux()
    } else {
      addLine({ who: 'line', ur: d.text, en: 'Three days later: did the advice work? 1 it is better, 2 the problem is still there.' })
      await speak(d.audio_url, d.text)
      setAux((x) => x && { ...x, stage: 'choose' })
    }
  }
  const followReply = async (better: boolean) => {
    const a = auxRef.current; if (!a) return
    addLine({ who: 'key', en: better ? '1' : '2' })
    if (!better) await post(`/api/query/${a.data.query_id}/to-expert?source=followup`).catch(() => {})
    const text = FOLLOW[lang][better ? 'thanks' : 'expert']
    addLine({ who: 'line', ur: text, en: better ? 'Glad the crop is better. Goodbye.' : 'An agronomist will call you soon. Goodbye.' })
    const item = inbox.find((i) => i.query_id === a.data.query_id && i.kind === 'followup'); if (item) markHeard(item)
    finishAux(2600)
  }
  const playMessage = async (it: any) => {
    unlockAudio(); t0.current = Date.now(); setMenu(null); setLines([]); setAux({ kind: 'message', stage: 'playing', data: it })
    addLine({ who: 'line', ur: it.text_ur, en: it.kind === 'outbreak_alert' ? 'Outbreak alert for the farmer’s tehsil.' : it.kind === 'followup' ? 'Follow-up call (saved message).' : 'The agronomist’s answer (saved message).' })
    await speak(it.audio_url, it.text_ur)
    if (!it.heard) markHeard(it)
    finishAux(800)
  }

  const onKey = (k: PhoneKey) => {
    setTouched(Date.now())
    if (aux) {
      if (aux.stage === 'ringing') { if (['call', 'softL', 'ok'].includes(k)) acceptAux(); else if (k === 'end' || k === 'softR') setAux(null); return }
      if (k === 'end' || k === 'softR') { stopAudio(); setAux(null); return }
      if (aux.stage === 'choose' && (k === '1' || k === '2')) { beep(1240, 70); followReply(k === '1') }
      return
    }
    if (menu !== null) {
      if (k === 'up') setMenu(Math.max(0, menu - 1))
      else if (k === 'down') setMenu(Math.min(Math.max(0, inbox.length - 1), menu + 1))
      else if (['ok', 'softL', 'call'].includes(k) && inbox[menu]) playMessage(inbox[menu])
      else if (k === 'softR' || k === 'end') setMenu(null)
      return
    }
    if (step === 'idle' || step === 'ended') {
      if (['call', 'softR', 'ok'].includes(k)) startCall()
      else if (k === 'softL') { unlockAudio(); setMenu(0) }
      return
    }
    if (k === 'end' || k === 'softR') { endCall(); return }
    if (/^[0-9*#]$/.test(k)) press(k)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (/^[0-9*#]$/.test(e.key)) onKey(e.key as PhoneKey)
      else if (e.key === 'Enter' && !el.closest('button, a')) onKey('call')
      else if (e.key === 'Escape') onKey('end')
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const unheard = inbox.filter((i) => !i.heard).length
  const inCall = !['idle', 'ended'].includes(step)
  const secs = Math.max(0, Math.floor((now - t0.current) / 1000))
  const MSG: Record<string, string> = { callback: 'Expert answer', outbreak_alert: 'Outbreak alert', followup: 'Follow-up call' }
  const lcd: Lcd = (() => {
    if (aux) {
      if (aux.stage === 'ringing') return { title: 'Incoming call', icon: 'ring', lines: [{ text: 'AwaazSaathi', big: true, blink: true }, { text: HELPLINE }], softL: 'Answer', softR: 'Reject' }
      if (aux.stage === 'done') return { title: 'Call ended', lines: [{ text: 'AwaazSaathi', big: true }, { text: mmss(secs) }] }
      return { title: aux.kind === 'message' ? 'Voice message' : 'In call', icon: aux.stage === 'choose' ? null : 'speaker', lines: [{ text: 'AwaazSaathi', big: true }, { text: mmss(secs) }, { text: aux.stage === 'choose' ? 'Press 1 or 2' : '', blink: true }], softR: 'End' }
    }
    if (menu !== null) {
      if (!inbox.length) return { title: 'Voice inbox', lines: [{ text: 'No messages' }], softR: 'Back' }
      const from = Math.min(Math.max(0, menu - 1), Math.max(0, inbox.length - 3))
      return { title: `Voice inbox ${menu + 1}/${inbox.length}`, lines: inbox.slice(from, from + 3).map((it, i) => ({ text: `${it.heard ? ' ' : '*'} ${MSG[it.kind] || 'Message'}`, invert: from + i === menu })), softL: 'Play', softR: 'Back' }
    }
    if (step === 'idle' || step === 'ended') return {
      title: unheard ? 'New voice message' : step === 'ended' ? 'Call ended' : 'Helpline', icon: unheard ? 'voicemail' : null,
      lines: [{ text: HELPLINE, big: true }, { text: unheard ? `${unheard} not heard yet` : 'Press the call key' }], softL: 'Inbox', softR: 'Call', lit: now - touched < 15000,
    }
    if (step === 'connecting') return { title: 'Calling', lines: [{ text: HELPLINE, big: true }, { text: 'Connecting...', blink: true }], softR: 'End' }
    return {
      title: 'In call', icon: rec.recording ? 'rec' : speaking ? 'speaker' : null,
      lines: [{ text: 'AwaazSaathi', big: true }, { text: mmss(secs) }, { text: rec.recording ? 'Listening...' : step === 'thinking' ? 'Please wait...' : keys.length ? `> ${keys.join(' ')}` : '' }], softR: 'End',
    }
  })()

  const askOpen = step === 'ask' && !!call
  const showKeypad = view !== 'smart', showSmart = view !== 'keypad'

  if (phoneMode) {
    const applySetup = (s: PhoneSetup) => {
      if (setup && s.kind !== setup.kind && inCall) endCall()
      saveSetup(s); setSetup(s); setPhone(s.phone)
    }
    if (!setup) return <SetupScreen meta={meta} initial={readSetup()} onDone={(s) => { unlockAudio(); applySetup(s) }} />
    const settings = settingsOpen && <SettingsSheet meta={meta} setup={setup} lang={lang} inCall={inCall} onLang={setLang} onChange={applySetup}
      onRestart={() => { if (inCall) endCall(); setSettingsOpen(false); saveSetup(null); setSetup(null) }} onClose={() => setSettingsOpen(false)} />
    const last = [...lines].reverse().find((l) => l.who === 'line')
    if (setup.kind === 'keypad') return (
      <div className="relative">
        <KeypadScreen lcd={lcd} onKey={onKey} ringing={aux?.stage === 'ringing'} clock={new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          connected={ws.connected} onSettings={() => setSettingsOpen(true)} askOpen={askOpen} recording={rec.recording} note={note}
          samples={meta ? Object.entries(meta.canned).slice(0, 5).map(([k, c]: any) => [k, c.label.split(':')[0], c.transcript]) : []}
          onSample={(t) => submit({ transcript: t })} onTyped={(t) => submit({ transcript: t })}
          subtitle={setup.subtitles && last && (inCall || aux) ? { ur: last.ur, en: last.en } : null} />
        {video.state !== 'idle' && <div className="absolute inset-0 z-40" data-testid="video-on-keypad">
          <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'AwaazSaathi agronomist'} error={video.error} onAccept={video.accept} onDecline={video.decline} onHangup={video.hangup} />
          <div className="absolute top-3 inset-x-3 z-50 text-center text-[12px] text-white/90 bg-black/45 rounded-lg px-2 py-1">A video call needs the farmer’s smartphone. Shown here for the demo.</div>
        </div>}
        {settings && <div className="fixed inset-0 z-50">{settings}</div>}
      </div>)
    return (
      <div className="min-h-[100dvh] bg-canvas">
        <DeviceFrame statusTone="dark" label="Smartphone">
          {!micAllowed() && <div className="shrink-0 order-last px-3 pb-2 bg-white"><VoiceBanner url={secureLink} /></div>}
          <Chat meta={meta} phone={phone} lang={lang} inbox={inbox} resetKey={resetKey} onResult={setResult} onHeard={markHeard} onSettings={() => setSettingsOpen(true)} />
          <CallOverlay aux={aux} secs={secs} onAnswer={acceptAux} onEnd={() => { stopAudio(); setAux(null) }} onChoice={followReply} />
          <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'AwaazSaathi agronomist'} error={video.error} onAccept={video.accept} onDecline={video.decline} onHangup={video.hangup} />
          {settings}
        </DeviceFrame>
      </div>)
  }

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="bg-white border-b border-line">
        <div className="mx-auto max-w-[1480px] px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/" aria-label="Home" className="flex items-center gap-2.5"><Logo size={34} /><span><span className="block font-bold leading-tight">The farmer’s side</span><span className="block text-[12.5px] text-muted leading-tight">Two ways to reach the helpline{offline ? ', offline mode' : ''}</span></span></Link>
          <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto min-w-0">
            <Segmented value={view} onChange={setView} className="flex-1 min-w-0 sm:flex-none sm:w-[340px]" options={[['keypad', 'Button phone'], ['smart', 'Smartphone'], ...(window.innerWidth >= 1024 ? [['both', 'Both'] as [View, string]] : [])]} />
            <div role="group" aria-label="Farmer’s language" className={`flex rounded-xl bg-field-100/70 p-1 ${inCall ? 'opacity-50 pointer-events-none' : ''}`}>
              {(['pa', 'ur'] as Lang[]).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`urdu !leading-none px-3 py-1.5 rounded-lg text-[13px] ${lang === l ? 'bg-white shadow-sm text-field-900 font-bold' : 'text-muted'}`}>{l === 'ur' ? 'اردو' : 'پنجابی'}</button>)}
            </div>
            <LiveDot on={ws.connected} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-5 flex flex-wrap justify-center items-start gap-x-9 gap-y-7">
        {showKeypad && <section aria-label="Button phone" className="flex flex-col items-center gap-3">
          <div className="text-center"><h2 className="font-bold">Button phone</h2><p className="text-[13px] text-muted">A normal voice call. No app, no internet, no reading.</p></div>
          <KeypadPhone lcd={lcd} onKey={onKey} ringing={aux?.stage === 'ringing'} clock={new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
          <p className="text-[12px] text-muted flex items-center gap-1.5"><Keyboard size={13} /> Number keys, Enter to call, Esc to hang up</p>
          <section className="surface p-4 w-[340px] max-w-full text-left" aria-label="Presenter tools" dir="ltr">
            <h2 className="font-bold flex items-center gap-2"><SlidersHorizontal size={17} className="text-field-700" /> Presenter tools</h2>
            <label className="block mt-3"><span className="text-xs text-muted">Who is calling (stored only as a hash, with the tehsil)</span>
              <select value={phone} onChange={(e) => setPhone(e.target.value)} disabled={inCall || !!aux} className="field mt-1 text-sm">
                {meta?.personas.map((p: any) => <option key={p.phone} value={p.phone}>{p.phone}, {p.tehsil}</option>)}
              </select></label>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {rec.recording ? <><span className="h-7 w-7 rounded-full bg-danger text-white grid place-items-center"><Mic size={15} /></span><span className="font-semibold text-danger">Listening. Press any phone key to finish.</span></>
                : rec.error ? <><span className="h-7 w-7 rounded-full bg-warn-50 text-warn grid place-items-center"><MicOff size={15} /></span><span className="text-warn">{rec.error}</span></>
                  : <><span className="h-7 w-7 rounded-full bg-field-50 border border-line text-field-700 grid place-items-center"><Mic size={15} /></span><span className="text-muted">The laptop microphone stands in for the phone’s.</span></>}
            </div>
            {note && <div role="alert" className="mt-3 text-sm rounded-xl bg-warn-50 text-warn border border-warn/20 px-3 py-2">{note}</div>}
            <div className="mt-3 text-xs text-muted">{askOpen ? 'Send a sample question instead of speaking' : 'Sample questions unlock when the helpline asks for the problem'}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {meta && Object.entries(meta.canned).slice(0, 3).map(([k, c]: any) => <button key={k} disabled={!askOpen} onClick={() => submit({ transcript: c.transcript })} data-testid={`sample-${k}`} className="btn btn-quiet !py-1.5 !px-3 text-[13px]">{c.label.split(':')[0]}</button>)}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askOpen && typed.trim() && submit({ transcript: typed })} disabled={!askOpen} dir="rtl" placeholder="سوال یہاں لکھیں" aria-label="Type the farmer’s question" className="field urdu !leading-normal !py-1.5 disabled:bg-field-50" />
              <button disabled={!askOpen || !typed.trim()} onClick={() => submit({ transcript: typed })} aria-label="Send typed question" className="btn btn-primary !px-3"><Send size={17} /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5"><Mock>Phone network simulated</Mock><Mock>Chat delivery simulated</Mock></div>
          </section>
        </section>}

        {showSmart && <section aria-label="Smartphone" className="flex flex-col items-center gap-3 max-w-full">
          <div className="text-center"><h2 className="font-bold">Smartphone</h2><p className="text-[13px] text-muted">Send a crop photo or a voice note. Take a video call from the agronomist.</p></div>
          <DeviceFrame fill={false} statusTone="dark" label="Smartphone">
            <Chat meta={meta} phone={phone} lang={lang} inbox={inbox} resetKey={resetKey} onResult={setResult} onHeard={markHeard} />
            <VideoCallView state={video.state} local={video.local} remote={video.remote} peerName={video.peer?.name || 'AwaazSaathi agronomist'} error={video.error} onAccept={video.accept} onDecline={video.decline} onHangup={video.hangup} />
          </DeviceFrame>
        </section>}

        <aside className="w-full max-w-[440px] space-y-4" dir="ltr">
          <section className="surface p-5" aria-label="On the line">
            <h2 className="font-bold text-lg flex items-center gap-2"><Captions size={19} className="text-field-700" /> On the line</h2>
            <p className="text-sm text-muted">Captions for the audience. The farmer only hears this.</p>
            <div ref={logEnd} className="mt-3 max-h-[330px] overflow-y-auto no-scrollbar space-y-2" data-testid="captions" aria-live="polite">
              {!lines.length && <p className="text-sm text-muted rounded-xl border border-dashed border-line px-3 py-4">Press the green call key on the button phone. Everything the helpline says shows up here.</p>}
              {lines.map((l) => l.who === 'key'
                ? <div key={l.id} className="flex justify-end"><span className="tag bg-ink text-white">Farmer pressed {l.en}</span></div>
                : <div key={l.id} className={`rounded-xl border px-3 py-2 ${l.who === 'farmer' ? 'border-field-200 bg-field-50 ml-8' : 'border-line mr-8'}`}>
                  <div className="text-[11px] font-semibold text-muted">{l.who === 'farmer' ? 'Farmer' : 'Helpline'}</div>
                  {l.ur && <div className="urdu text-[16px] !leading-[2.1] pb-1.5">{l.ur}</div>}
                  {l.en && <div className="text-[12.5px] text-muted border-t border-line/70 pt-1.5">{l.en}</div>}
                </div>)}
            </div>
          </section>

          <Decision result={result} started={inCall} />
        </aside>
      </div>
    </div>
  )
}
