import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from './app-context'
import { api, V1 } from './api'
import { homeWidgets } from './widgets'

// kind is the app's type in Core ("tasks"); what an app shows and keeps comes
// from its manifest, so nothing here names an app.
export type DailyApp = { app_key: string; kind: string; name: string; icon?: string }
export type DailyItem = { id: number; ref?: string; title: string; detail?: string; done?: boolean; url?: string }
export type Figure = { label: string; value: string }
// One thing a quick line can become in one app: capture_kind is the app's word for it.
export type Destination = DailyApp & { capture_kind: string; label: string; what?: string; fields: string[] }
export type DailySource = DailyApp & { title?: string; what?: string; state: 'ready' | 'unavailable'; message?: string; line?: string; url?: string; items: DailyItem[]; metrics: { label: string; value: number }[]; figures?: Figure[] }
// An app with a widget that was not asked this time (the server asks a bounded number per refresh).
export type DailyOffer = DailyApp & { title?: string; what?: string }
export type Daily = { date: string; refreshed_at: string; sources: DailySource[]; more?: DailyOffer[]; destinations: Destination[] }
// The numbers as the app worded them ("4 of 6"); metrics holds only the whole numbers.
export const figuresOf = (s: DailySource): Figure[] => s.figures ?? s.metrics.map(m => ({ label: m.label, value: String(m.value) }))
export const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DailyContext = createContext<{ data: Daily | null; loading: boolean; error: boolean; refresh: () => Promise<void> }>({ data: null, loading: false, error: false, refresh: async () => {} })
export const useDaily = () => useContext(DailyContext)
export const capture = (kind?: string) => window.dispatchEvent(new CustomEvent('hub:capture', { detail: { kind } }))
export function DailyProvider({ children }: { children: ReactNode }) {
  const { launcher, prefs } = useApp()
  // The apps whose widget is on Home are asked first, however many apps have one.
  const want = useMemo(() => [...new Set(homeWidgets(prefs.home_widgets).flatMap(w => w.kind === 'app' && w.config.appKey ? [w.config.appKey] : []))].sort().join(','), [prefs.home_widgets])
  const [data, setData] = useState<Daily | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(false)
  const busy = useRef(false), alive = useRef(true), again = useRef(false), latest = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const refresh = useCallback(async () => {
    if (busy.current) { again.current = true; return }
    busy.current = true; setLoading(true)
    try {
      const value = await api.get<Daily>(`${V1}/daily?date=${localDay()}${want ? `&want=${encodeURIComponent(want)}` : ''}`)
      if (!Array.isArray(value.sources) || !Array.isArray(value.destinations)) throw Error('Unsupported daily response')
      if (alive.current) { setData(value); setError(false) }
    } catch { if (alive.current) { setError(true); setData(null) } }
    finally {
      busy.current = false; if (alive.current) setLoading(false)
      // Something changed while this was on its way (a widget was added): ask once more.
      if (again.current) { again.current = false; if (alive.current) void latest.current() }
    }
  }, [want])
  latest.current = refresh
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
