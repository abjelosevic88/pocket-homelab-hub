import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from './app-context'
import { api, V1 } from './api'

export type DailyItem = { id: number; title: string; detail?: string; done?: boolean }
export type Destination = { app_key: string; kind: string; name: string }
export type DailySource = Destination & { state: 'ready' | 'unavailable'; message?: string; items: DailyItem[]; metrics: { label: string; value: number }[] }
export type Daily = { date: string; refreshed_at: string; sources: DailySource[]; destinations: Destination[] }
export const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DailyContext = createContext<{ data: Daily | null; loading: boolean; error: boolean; refresh: () => Promise<void> }>({ data: null, loading: false, error: false, refresh: async () => {} })
export const useDaily = () => useContext(DailyContext)
export const capture = (kind?: 'task' | 'note' | 'moment') => window.dispatchEvent(new CustomEvent('hub:capture', { detail: { kind } }))
export function DailyProvider({ children }: { children: ReactNode }) {
  const { launcher } = useApp()
  const [data, setData] = useState<Daily | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(false)
  const busy = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true; setLoading(true)
    try {
      const value = await api.get<Daily>(`${V1}/daily?date=${localDay()}`)
      if (!Array.isArray(value.sources) || !Array.isArray(value.destinations)) throw Error('Unsupported daily response')
      if (alive.current) { setData(value); setError(false) }
    } catch { if (alive.current) { setError(true); setData(null) } }
    finally { busy.current = false; if (alive.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (launcher?.core !== 'ok') { setData(null); return }
    void refresh()
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [launcher?.core, refresh])
  return <DailyContext.Provider value={{ data, loading, error, refresh }}>{children}</DailyContext.Provider>
}
