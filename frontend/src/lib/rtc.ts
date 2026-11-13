import { useCallback, useRef, useState } from 'react'

/** Live video call (WebRTC). Signalling goes through our own WebSocket relay.
 *  On one Wi-Fi or hotspot the phones talk directly. Across networks (mobile data) the public STUN servers find a path,
 *  and the free Open Relay TURN servers carry the call when the carrier's NAT allows nothing else. */
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
]

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'

export function useVideoCall(send: (to: string, event: string, data: unknown) => void, myTopic: string) {
  const [state, setState] = useState<CallState>('idle')
  const [peer, setPeer] = useState<{ topic: string; name?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<MediaStream | null>(null)
  const [remote, setRemote] = useState<MediaStream | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const pendingOffer = useRef<any>(null)
  const peerRef = useRef<string>('')

  const getMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS or localhost. See the README for the Chrome flag.')
    return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true })
  }
  const makePC = (to: string, stream: MediaStream) => {
    const p = new RTCPeerConnection({ iceServers: ICE, iceCandidatePoolSize: 2 })
    stream.getTracks().forEach((t) => p.addTrack(t, stream))
    p.onicecandidate = (e) => e.candidate && send(to, 'rtc_ice', { from: myTopic, candidate: e.candidate.toJSON() })
    p.ontrack = (e) => setRemote(e.streams[0])
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') setState('connected')
      if (p.connectionState === 'failed') setError('The two phones could not reach each other. Put them on the same Wi-Fi or hotspot and call again.')
      if (['failed', 'closed'].includes(p.connectionState)) cleanup('ended')
    }
    pc.current = p
    return p
  }
  const cleanup = (next: CallState = 'idle') => {
    pc.current?.close(); pc.current = null
    setLocal((s) => { s?.getTracks().forEach((t) => t.stop()); return null })
    setRemote(null); setState(next)
    if (next === 'ended') setTimeout(() => setState('idle'), 1500)
  }

  const call = useCallback(async (to: string, info: Record<string, unknown>) => {
    setError(null)
    try {
      const stream = await getMedia(); setLocal(stream)
      peerRef.current = to; setPeer({ topic: to }); setState('calling')
      const p = makePC(to, stream)
      const offer = await p.createOffer(); await p.setLocalDescription(offer)
      send(to, 'rtc_offer', { from: myTopic, sdp: offer, ...info })
    } catch (e: any) { setError(e.message); cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTopic, send])

  const accept = useCallback(async () => {
    const o = pendingOffer.current; if (!o) return
    setError(null)
    try {
      const stream = await getMedia(); setLocal(stream)
      const p = makePC(o.from, stream)
      await p.setRemoteDescription(o.sdp)
      const ans = await p.createAnswer(); await p.setLocalDescription(ans)
      send(o.from, 'rtc_answer', { from: myTopic, sdp: ans })
      setState('connected')
    } catch (e: any) { setError(e.message); send(o.from, 'rtc_end', {}); cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTopic, send])

  const hangup = useCallback(() => { if (peerRef.current) send(peerRef.current, 'rtc_end', {}); cleanup('ended') }, [send])
  const decline = hangup

  /** Feed every WS message here. */
  const onSignal = useCallback(async (event: string, data: any) => {
    if (event === 'rtc_offer') {
      if (pc.current) { send(data.from, 'rtc_end', { busy: true }); return }
      pendingOffer.current = data; peerRef.current = data.from
      setPeer({ topic: data.from, name: data.name }); setState('ringing')
    } else if (event === 'rtc_answer' && pc.current) {
      await pc.current.setRemoteDescription(data.sdp)
    } else if (event === 'rtc_ice' && pc.current) {
      try { await pc.current.addIceCandidate(data.candidate) } catch { /* ignore */ }
    } else if (event === 'rtc_end') {
      cleanup(state === 'idle' ? 'idle' : 'ended')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, state])

  return { state, peer, error, local, remote, call, accept, decline, hangup, onSignal }
}
