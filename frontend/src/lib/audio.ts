import { useRef, useState } from 'react'

let current: HTMLAudioElement | null = null

export function stopAudio() {
  current?.pause()
  current = null
  try { speechSynthesis.cancel() } catch { /* ignore */ }
}

/** Plays the mp3 if we have one; else tries the browser's own Urdu voice; else waits a reading-time delay. */
export function speak(url: string | null | undefined, text: string): Promise<void> {
  stopAudio()
  return new Promise((resolve) => {
    const fallback = () => {
      const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []
      const v = voices.find((x) => x.lang.toLowerCase().startsWith('ur'))
      if (v && text) {
        const u = new SpeechSynthesisUtterance(text)
        u.voice = v; u.lang = v.lang; u.rate = 0.95
        u.onend = () => resolve(); u.onerror = () => resolve()
        speechSynthesis.speak(u)
      } else {
        setTimeout(resolve, Math.min(9000, 1200 + text.length * 45))
      }
    }
    if (!url) return fallback()
    const a = new Audio(url)
    current = a
    a.onended = () => resolve()
    a.onerror = () => fallback()
    a.play().catch(() => fallback())
  })
}

let ctx: AudioContext | null = null
export function beep(freq = 880, ms = 180, times = 1) {
  try {
    ctx = ctx || new AudioContext()
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = freq; o.type = 'sine'
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * (ms + 90) / 1000)
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * (ms + 90) / 1000 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (i * (ms + 90) + ms) / 1000)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * (ms + 90) / 1000); o.stop(ctx.currentTime + (i * (ms + 90) + ms) / 1000 + 0.05)
    }
  } catch { /* ignore */ }
}
export function unlockAudio() { try { ctx = ctx || new AudioContext(); ctx.resume() } catch { /* ignore */ } }

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
