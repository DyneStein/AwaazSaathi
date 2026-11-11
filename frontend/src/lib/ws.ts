import { useEffect, useRef, useState } from 'react'

export type WSMsg = { topic: string; event: string; data: any }

/** Subscribes to server topics over one WebSocket, auto-reconnects. */
export function useWS(topics: string[], onMsg: (m: WSMsg) => void) {
  const handler = useRef(onMsg)
  handler.current = onMsg
  const [connected, setConnected] = useState(false)
  const key = topics.join(',')
  useEffect(() => {
    if (!key) return
    let ws: WebSocket | null = null
    let stop = false
    let timer: number | undefined
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?topics=${encodeURIComponent(key)}`)
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)) } catch { /* ignore */ } }
      ws.onclose = () => { setConnected(false); if (!stop) timer = window.setTimeout(open, 1000) }
      ws.onerror = () => ws?.close()
    }
    open()
    return () => { stop = true; clearTimeout(timer); ws?.close() }
  }, [key])
  return connected
}
