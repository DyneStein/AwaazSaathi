import { useRef, useState } from 'react'

/* Playback that works on phones.
 * Phone browsers (iPhone above all) only play sound that a tap started. A helpline answer arrives seconds after the
 * last tap, so every clip is played through one shared AudioContext, unlocked by the farmer's taps and key presses
 * (every tap keeps it unlocked, also after the microphone was in use). If the browser still refuses, the clip waits
 * and the page shows "Tap to hear" instead of silently moving on. */
let ctx: AudioContext | null = null

/* Loudspeaker, not the ear speaker.
 * Phones switch to "voice call" audio (ear speaker) when a page records with echo cancellation, and iPhone Safari
 * keeps a page that used the microphone in that mode. The helpline never plays sound while it records, so:
 * record without echo cancellation, and on iPhone (Safari 16.4+) mark the page as media playback except while recording. */
export const MIC: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: true, autoGainControl: true }
function session(type: 'playback' | 'play-and-record') {
  try { const s = (navigator as any).audioSession; if (s && s.type !== type) s.type = type } catch { /* not supported: nothing to do */ }
}
/** Asks for microphone permission up front (so the dialog does not interrupt the question), then releases it. */
export function askMicPermission() {
  session('play-and-record')
  navigator.mediaDevices?.getUserMedia?.({ audio: MIC }).then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {}).finally(() => session('playback'))
}
let source: AudioBufferSourceNode | null = null
let element: HTMLAudioElement | null = null
let token = 0
let pending: { url: string; text: string; resolve: () => void; my: number } | null = null
const buffers = new Map<string, Promise<AudioBuffer>>()
const listeners = new Set<(blocked: boolean) => void>()
const setBlocked = (b: boolean) => listeners.forEach((f) => f(b))

/* Loud enough for a room: every clip goes through a compressor (evens out quiet syllables) and a gain above 1.
 * The clips themselves are normalised on the server; this adds the last few dB a phone speaker needs. */
const BOOST = 1.6
let out: GainNode | null = null
function context(): AudioContext | null {
  try { ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)() } catch { ctx = null }
  return ctx
}
function output(c: AudioContext): AudioNode {
  if (out) return out
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25
  out = c.createGain(); out.gain.value = BOOST
  comp.connect(out).connect(c.destination)
  // the compressor is the entry point: callers connect to it, the gain feeds the speaker
  ;(out as any)._entry = comp
  return out
}
const entry = (c: AudioContext): AudioNode => ((output(c) as any)._entry as AudioNode)

/** Call inside a tap or key press. Wakes the audio engine and plays any clip that was waiting for a tap. */
export function unlockAudio() {
  const c = context()
  if (c) {
    try {
      if (c.state !== 'running') c.resume().catch(() => {})
      const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0)
    } catch { /* ignore */ }
  }
  if (pending) { const p = pending; pending = null; setBlocked(false); play(p.url, p.text, p.my).then(p.resolve) }
}
if (typeof window !== 'undefined') {
  // Every tap or key press anywhere on the page keeps sound unlocked.
  window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true })
  window.addEventListener('keydown', unlockAudio, { capture: true })
}

/** Subscribe to "sound is blocked until the next tap" (for the Tap to hear button). */
export function onAudioBlocked(f: (blocked: boolean) => void) { listeners.add(f); return () => { listeners.delete(f) } }

export function stopAudio() {
  token++
  try { source?.stop() } catch { /* already stopped */ }
  source = null
  element?.pause()
  if (pending) { const p = pending; pending = null; setBlocked(false); p.resolve() }
  try { speechSynthesis.cancel() } catch { /* ignore */ }
}

/** Count of clips that really started (read by the browser tests). */
const played = () => { (window as any).__awaazPlayed = ((window as any).__awaazPlayed || 0) + 1 }

/* Voice clips are named by their content, so a cached copy is never stale. They are kept in the browser's cache
 * storage (https pages only) so each clip crosses a slow link once; plain http pages simply fetch. */
const VOICE_CACHE = 'awaaz-voice-v1'
async function fetchClip(url: string): Promise<ArrayBuffer> {
  const store = typeof caches !== 'undefined' ? await caches.open(VOICE_CACHE).catch(() => null) : null
  const hit = store ? await store.match(url).catch(() => undefined) : undefined
  if (hit) return hit.arrayBuffer()
  // Free tunnels sometimes answer 502 or drop a download: try again a few times before giving up.
  let last: unknown = null
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (r.ok) {
        const data = await r.arrayBuffer()
        if (store) store.put(url, new Response(data.slice(0), { headers: { 'Content-Type': 'audio/mpeg' } })).catch(() => {})
        return data
      }
      last = new Error(String(r.status))
      if (r.status < 500 && r.status !== 429) break          // a real "not found": retrying will not help
    } catch (e) { last = e }
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)))
  }
  throw last ?? new Error('voice clip unavailable')
}

/** Downloads clips ahead of time (one after another, so the current clip is never starved). */
let preloading = Promise.resolve()
export function preloadVoice(urls: (string | null | undefined)[]) {
  for (const u of urls) {
    if (!u || buffers.has(u)) continue
    preloading = preloading.then(() => decode(u).then(() => undefined, () => undefined))
  }
}

function decode(url: string): Promise<AudioBuffer> {
  if (!buffers.has(url)) {
    const c = context()!
    const p = fetchClip(url)
      .then((a) => new Promise<AudioBuffer>((ok, bad) => c.decodeAudioData(a, ok, bad)))
    p.catch(() => buffers.delete(url))
    buffers.set(url, p)
  }
  return buffers.get(url)!
}

function readAloud(text: string): Promise<void> {
  return new Promise((resolve) => {
    const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []
    const v = voices.find((x) => x.lang.toLowerCase().startsWith('ur'))
    if (v && text) {
      const u = new SpeechSynthesisUtterance(text)
      u.voice = v; u.lang = v.lang; u.rate = 0.95
      u.onend = () => resolve(); u.onerror = () => resolve()
      speechSynthesis.speak(u)
    } else setTimeout(resolve, Math.min(9000, 1200 + text.length * 45))
  })
}

/* A clip that is not ready within SLOW_MS (weak link) must not leave the farmer in silence: the phone's own Urdu
 * voice reads the line if it has one; otherwise a "voice is loading" notice shows until the clip arrives. */
const SLOW_MS = 3000
const slowListeners = new Set<(slow: boolean) => void>()
const setSlow = (b: boolean) => slowListeners.forEach((f) => f(b))
export function onAudioSlow(f: (slow: boolean) => void) { slowListeners.add(f); return () => { slowListeners.delete(f) } }
function urduVoice(): SpeechSynthesisVoice | undefined {
  try { return speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('ur')) } catch { return undefined }
}
try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {} } catch { /* not available */ }

async function play(url: string, text: string, my: number): Promise<void> {
  session('playback')
  const c = context()
  if (c) {
    try {
      const pending = decode(url)
      const late = Symbol('late')
      let buf = await Promise.race([pending, new Promise<typeof late>((r) => setTimeout(() => r(late), SLOW_MS))])
      if (my !== token) return
      if (buf === late) {
        if (text && urduVoice()) { await readAloud(text); return }     // the clip keeps downloading for next time
        setSlow(true)
        try { buf = await pending } finally { setSlow(false) }
        if (my !== token) return
      }
      if (c.state !== 'running') await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 400))])
      if (c.state === 'running') {
        return await new Promise<void>((resolve) => {
          const s = c.createBufferSource(); s.buffer = buf as AudioBuffer; s.connect(entry(c))
          s.onended = () => { if (source === s) source = null; resolve() }
          source = s; s.start(0); played()
        })
      }
    } catch { /* fall through to the audio element */ }
  }
  if (my !== token) return
  return new Promise<void>((resolve) => {
    const a = element || (element = new Audio())
    a.src = url
    a.onended = () => resolve()
    a.onerror = () => readAloud(text).then(resolve)
    a.play().then(played).catch(() => {
      if (my !== token) return resolve()
      // Blocked until the next tap: wait for it rather than skipping the farmer's answer.
      pending = { url, text, resolve, my }
      setBlocked(true)
    })
  })
}

/** Plays the clip if there is one; else the browser's own Urdu voice; else waits a reading-time delay. */
export function speak(url: string | null | undefined, text: string): Promise<void> {
  stopAudio()
  const my = token
  if (!url) return readAloud(text)
  return play(url, text, my)
}

export function beep(freq = 880, ms = 180, times = 1) {
  try {
    const c = context(); if (!c) return
    if (c.state !== 'running') c.resume().catch(() => {})
    for (let i = 0; i < times; i++) {
      const o = c.createOscillator(); const g = c.createGain()
      o.frequency.value = freq; o.type = 'sine'
      g.gain.setValueAtTime(0.0001, c.currentTime + i * (ms + 90) / 1000)
      g.gain.exponentialRampToValueAtTime(0.8, c.currentTime + i * (ms + 90) / 1000 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (i * (ms + 90) + ms) / 1000)
      o.connect(g).connect(c.destination)
      o.start(c.currentTime + i * (ms + 90) / 1000); o.stop(c.currentTime + (i * (ms + 90) + ms) / 1000 + 0.05)
    }
  } catch { /* ignore */ }
}

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const start = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This link blocks the microphone (browsers allow it only on https or on the server computer). Use the internet link, a sample question or type it.')
      return false
    }
    try {
      session('play-and-record')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.start()
      rec.current = r
      setRecording(true)
      return true
    } catch (e: any) {
      session('playback')
      setError(e?.message || 'Microphone blocked')
      return false
    }
  }
  const stop = () => new Promise<Blob | null>((resolve) => {
    const r = rec.current
    if (!r || r.state === 'inactive') { rec.current = null; setRecording(false); return resolve(null) }   // already stopped: nothing to hand back
    rec.current = null
    r.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop())
      session('playback')
      setRecording(false)
      resolve(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }))
    }
    r.stop()
  })
  return { recording, error, start, stop }
}
