import { useEffect, useRef, useState } from 'react'

export interface TelemetryFrame {
  q: number[]
  p: number[]
  ts: number
}

export type LinkState = 'connecting' | 'linked' | 'reconnecting'

interface Telemetry {
  frame: TelemetryFrame | null
  link: LinkState
  /** true once telemetry has gone quiet (socket up but no fresh frames). */
  stale: boolean
}

const MAX_BACKOFF_MS = 5000
const STALE_AFTER_MS = 1500

/** Subscribes to `/ws/telemetry`, exposing the latest frame and link state.
 *  Reconnects with capped exponential backoff, and flips to `reconnecting`
 *  when the socket is open but frames have stopped arriving. */
export function useTelemetry(): Telemetry {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null)
  const [link, setLink] = useState<LinkState>('connecting')
  const attempt = useRef(0)
  const lastFrameAt = useRef(0)

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${proto}://${location.host}/ws/telemetry`)
      ws = socket

      socket.onopen = () => {
        attempt.current = 0
        lastFrameAt.current = Date.now()
        setLink('linked')
      }
      socket.onmessage = (ev) => {
        try {
          setFrame(JSON.parse(ev.data) as TelemetryFrame)
          lastFrameAt.current = Date.now()
          setLink('linked')
        } catch {
          /* ignore malformed frame */
        }
      }
      socket.onclose = () => {
        if (closed || ws !== socket) return
        setLink('reconnecting')
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt.current)
        attempt.current += 1
        reconnectTimer = setTimeout(connect, delay)
      }
      socket.onerror = () => socket.close()
    }

    connect()

    // Staleness watchdog: socket looks fine but frames dried up (incl. a
    // half-open TCP connection that never sends a FIN). Force a close so the
    // onclose backoff path actually reconnects.
    const watchdog = setInterval(() => {
      if (
        ws?.readyState === WebSocket.OPEN &&
        lastFrameAt.current > 0 &&
        Date.now() - lastFrameAt.current > STALE_AFTER_MS
      ) {
        setLink('reconnecting')
        ws.close()
      }
    }, 500)

    return () => {
      closed = true
      clearInterval(watchdog)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  return { frame, link, stale: link !== 'linked' }
}
