import { useCallback, useEffect, useRef, useState } from 'react'
import type { DispenseSession, SlotProgress, SSEEvent } from '../types'

const IDLE: DispenseSession = {
  recipeName: '',
  servingCount: 1,
  slots: [],
  activeSlotIndex: -1,
  isComplete: false,
  isError: false,
  totalWeight: 0,
  totalTarget: 0,
}

export function useDispenseStream() {
  const [session, setSession] = useState<DispenseSession>(IDLE)
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const activeRef = useRef(false)

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }

    const es = new EventSource('/api/status/stream')
    esRef.current = es
    activeRef.current = true

    es.onopen = () => setConnected(true)

    es.onmessage = (e) => {
      if (!activeRef.current) return
      let event: SSEEvent
      try {
        event = JSON.parse(e.data) as SSEEvent
      } catch {
        return
      }

      setSession((prev) => {
        switch (event.type) {
          case 'connected':
          case 'heartbeat':
            return prev

          case 'session_start': {
            const slots: SlotProgress[] = event.slots.map((s) => ({
              slot: s.slot,
              name: s.name,
              target: s.target,
              current: 0,
              status: 'pending',
            }))
            return {
              ...IDLE,
              recipeName: event.recipe_name,
              servingCount: prev.servingCount,
              slots,
              activeSlotIndex: -1,
              totalTarget: slots.reduce((sum, s) => sum + s.target, 0),
            }
          }

          case 'indexing': {
            const slots = prev.slots.map((s) =>
              s.slot === event.slot ? { ...s, status: 'indexing' as const } : s,
            )
            return { ...prev, slots, activeSlotIndex: event.slot_index }
          }

          case 'dispensing_start': {
            const slots = prev.slots.map((s) =>
              s.slot === event.slot
                ? { ...s, status: 'dispensing' as const, target: event.target_weight }
                : s,
            )
            return { ...prev, slots, activeSlotIndex: event.slot_index }
          }

          case 'weight_update': {
            const slots = prev.slots.map((s) =>
              s.slot === event.slot ? { ...s, current: event.current_weight } : s,
            )
            const totalWeight = slots.reduce((sum, s) => sum + s.current, 0)
            return { ...prev, slots, totalWeight }
          }

          case 'spice_complete': {
            const slots = prev.slots.map((s) =>
              s.slot === event.slot
                ? {
                    ...s,
                    current: event.actual,
                    actual: event.actual,
                    status: event.status === 'done' ? ('done' as const) : ('error' as const),
                  }
                : s,
            )
            const totalWeight = slots.reduce((sum, s) => sum + s.current, 0)
            return { ...prev, slots, totalWeight }
          }

          case 'session_complete':
            return { ...prev, isComplete: true, activeSlotIndex: -1 }

          case 'session_error':
            return {
              ...prev,
              isError: true,
              errorMessage: event.message,
              activeSlotIndex: -1,
            }

          default:
            return prev
        }
      })
    }

    es.onerror = () => {
      setConnected(false)
    }

    return es
  }, [])

  const disconnect = useCallback(() => {
    activeRef.current = false
    esRef.current?.close()
    esRef.current = null
    setConnected(false)
  }, [])

  const reset = useCallback(() => {
    disconnect()
    setSession(IDLE)
  }, [disconnect])

  useEffect(() => {
    return () => {
      activeRef.current = false
      esRef.current?.close()
    }
  }, [])

  return { session, connected, connect, disconnect, reset, setSession }
}