import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from './app-context'
import { api, V1 } from './api'
import { homeWidgets } from './widgets'
import type { Tile } from './types'

// kind is the app's type in Core ("tasks"); what an app shows and keeps comes
// from its manifest, so nothing here names an app.
// app_url is set for an app Pocket Core lets Hub use for the person that is
// not on their launcher list: there is no tile to open, so it carries its address.
export type DailyApp = { app_key: string; kind: string; name: string; icon?: string; app_url?: string }
export type DailyItem = { id: number; ref?: string; title: string; detail?: string; done?: boolean; url?: string }
export type Figure = { label: string; value: string }
// One thing a quick line can become in one app: capture_kind is the app's word for it.
export type Destination = DailyApp & { capture_kind: string; label: string; what?: string; fields: string[] }
export type DailySource = DailyApp & { title?: string; what?: string; state: 'ready' | 'unavailable'; message?: string; line?: string; url?: string; items: DailyItem[]; metrics: { label: string; value: number }[]; figures?: Figure[] }
// An app with a widget that was not asked this time: it waits its turn (the server asks a bounded
// number per refresh), or Pocket Core does not let Hub read it for this person (off says why).
export type DailyOffer = DailyApp & { title?: string; what?: string; off?: string }
export type Daily = { date: string; refreshed_at: string; sources: DailySource[]; more?: DailyOffer[]; destinations: Destination[] }
// The numbers as the app worded them ("4 of 6"); metrics holds only the whole numbers.
export const figuresOf = (s: DailySource): Figure[] => s.figures ?? s.metrics.map(m => ({ label: m.label, value: String(m.value) }))
export const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DailyContext = createContext<{ data: Daily | null; loading: boolean; error: boolean; refresh: () => Promise<void> }>({ data: null, loading: false, error: false, refresh: async () => {} })
export const useDaily = () => useContext(DailyContext)
// The launcher tile behind an app of the day, and how to open the app. An app
// that is not on the launcher list gets a stand-in tile (for its icon and
// name) and opens in a new browser tab, at its own address.
export function useDailyApps() {
  const { allTiles, open } = useApp()
  return useMemo(() => {
    const listed = (app: DailyApp | undefined) => app && allTiles.find(t => t.key === app.app_key)
    const tileOf = (app: DailyApp | undefined): Tile | undefined => listed(app) || (app?.app_url ? { key: app.app_key, id: 0, type: app.kind, name: app.name, group: 'Pocket', url: app.app_url, open_url: app.app_url, icon: app.icon || '', pocket: true, status: '' } : undefined)
    const openApp = (app: DailyApp | undefined, at?: string) => {
      const tile = listed(app)
      if (tile) open(tile, at)
      else if (app?.app_url) window.open(at || app.app_url, '_blank', 'noopener')
    }
    return { tileOf, openApp }
  }, [allTiles, open])
}
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
