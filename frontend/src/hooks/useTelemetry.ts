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
}

const MAX_BACKOFF_MS = 5000

/** Subscribes to `/ws/telemetry`, exposing the latest frame and link state.
 *  Reconnects automatically with capped exponential backoff. */
export function useTelemetry(): Telemetry {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null)
  const [link, setLink] = useState<LinkState>('connecting')
  const attempt = useRef(0)

  useEffect(() => {
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/telemetry`)

      ws.onopen = () => {
        attempt.current = 0
        setLink('linked')
      }
      ws.onmessage = (ev) => {
        try {
          setFrame(JSON.parse(ev.data) as TelemetryFrame)
        } catch {
          /* ignore malformed frame */
        }
      }
      ws.onclose = () => {
        if (closed) return
        setLink('reconnecting')
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt.current)
        attempt.current += 1
        timer = setTimeout(connect, delay)
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [])

  return { frame, link }
}
