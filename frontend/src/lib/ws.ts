import { useCallback, useEffect, useRef, useState } from 'react'

export type WSMsg = { topic: string; event: string; data: any }

/** One WebSocket per screen: subscribe to topics, receive events, send rtc_* signalling. Auto-reconnects. */
export function useWS(topics: string[], onMsg: (m: WSMsg) => void) {
  const handler = useRef(onMsg)
  handler.current = onMsg
  const sock = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const key = topics.join(',')
  useEffect(() => {
    if (!key) return
    let stop = false
    let timer: number | undefined
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws?topics=${encodeURIComponent(key)}`)
      sock.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)) } catch { /* ignore */ } }
      ws.onclose = () => { setConnected(false); if (!stop) timer = window.setTimeout(open, 1000) }
      ws.onerror = () => ws.close()
    }
    open()
    return () => { stop = true; clearTimeout(timer); sock.current?.close() }
  }, [key])
  const send = useCallback((to: string, event: string, data: unknown) => {
    sock.current?.readyState === WebSocket.OPEN && sock.current.send(JSON.stringify({ to, event, data }))
  }, [])
  return { connected, send }
}

/** While live updates are down (a network or tunnel that blocks WebSockets), refresh every few seconds instead. */
export function usePollWhenOffline(connected: boolean, refresh: () => void, everyMs = 4000) {
  const fn = useRef(refresh)
  fn.current = refresh
  useEffect(() => {
    if (connected) return
    const t = window.setInterval(() => fn.current(), everyMs)
    return () => clearInterval(t)
  }, [connected, everyMs])
}
