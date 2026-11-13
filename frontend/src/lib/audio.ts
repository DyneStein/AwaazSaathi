import { useRef, useState } from 'react'

/* Playback that works on phones.
 * Phone browsers (iPhone above all) only play sound that a tap started. A helpline answer arrives seconds after the
 * last tap, so every clip is played through one shared AudioContext, unlocked by the farmer's taps and key presses
 * (every tap keeps it unlocked, also after the microphone was in use). If the browser still refuses, the clip waits
 * and the page shows "Tap to hear" instead of silently moving on. */
let ctx: AudioContext | null = null
let source: AudioBufferSourceNode | null = null
let element: HTMLAudioElement | null = null
let token = 0
let pending: { url: string; text: string; resolve: () => void; my: number } | null = null
const buffers = new Map<string, Promise<AudioBuffer>>()
const listeners = new Set<(blocked: boolean) => void>()
const setBlocked = (b: boolean) => listeners.forEach((f) => f(b))

function context(): AudioContext | null {
  try { ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)() } catch { ctx = null }
  return ctx
}

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

function decode(url: string): Promise<AudioBuffer> {
  if (!buffers.has(url)) {
    const c = context()!
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
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

async function play(url: string, text: string, my: number): Promise<void> {
  const c = context()
  if (c) {
    try {
      const buf = await decode(url)
      if (my !== token) return
      if (c.state !== 'running') await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 400))])
      if (c.state === 'running') {
        return await new Promise<void>((resolve) => {
          const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination)
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
      g.gain.exponentialRampToValueAtTime(0.3, c.currentTime + i * (ms + 90) / 1000 + 0.02)
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.start()
      rec.current = r
      setRecording(true)
      return true
    } catch (e: any) {
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
      setRecording(false)
      resolve(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }))
    }
    r.stop()
  })
  return { recording, error, start, stop }
}
