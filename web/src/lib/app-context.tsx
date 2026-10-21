import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, V1 } from './api'
import type { AuthStatus, Launcher, Prefs, Tile, User } from './types'

type Ctx = {
  status: AuthStatus | null
  user: User | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
  launcher: Launcher | null
  reload: () => Promise<void>
  loading: boolean
  prefs: Prefs
  setPrefs: (p: Partial<Prefs> | ((p: Prefs) => Prefs)) => void
  tiles: Tile[]          // ordered, hidden removed
  allTiles: Tile[]       // ordered, hidden included
  dockTiles: Tile[]
  open: (t: Tile) => void
  sheet: Tile | null
  setSheet: (t: Tile | null) => void
  palette: boolean
  setPalette: (v: boolean) => void
  editing: boolean
  setEditing: (v: boolean) => void
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export function useApp() { return useContext(AppCtx) }

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [launcher, setLauncher] = useState<Launcher | null>(null)
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefsState] = useState<Prefs>({})
  const [sheet, setSheet] = useState<Tile | null>(null)
  const [palette, setPalette] = useState(false)
  const [editing, setEditing] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const prefsRef = useRef<Prefs>({})

  const refresh = useCallback(async () => {
    try { setStatus(await api.get<AuthStatus>(`${V1}/auth/status`)) } catch { setStatus(s => s) }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const l = await api.get<Launcher>(`${V1}/launcher`)
      setLauncher(l)
      prefsRef.current = l.prefs || {}
      setPrefsState(l.prefs || {})
    } catch { /* 401 is handled globally */ } finally { setLoading(false) }
  }, [])

  const logout = useCallback(async () => {
    await api.post(`${V1}/auth/logout`)
    setLauncher(null)
    await refresh()
  }, [refresh])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const onUnauth = () => refresh()
    window.addEventListener('hub:unauthorized', onUnauth)
    return () => window.removeEventListener('hub:unauthorized', onUnauth)
  }, [refresh])

  // load the launcher once signed in, and keep it fresh while the tab is visible
  const signedIn = !!status?.user
  useEffect(() => {
    if (!signedIn) return
    reload()
    let timer: number | undefined
    const tick = () => { if (document.visibilityState === 'visible') reload() }
    const start = () => { stop(); timer = window.setInterval(tick, (launcher?.refresh_seconds || 45) * 1000) }
    const stop = () => { if (timer) window.clearInterval(timer) }
    start()
    const onVis = () => { if (document.visibilityState === 'visible') { reload(); start() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  const setPrefs = useCallback((p: Partial<Prefs> | ((p: Prefs) => Prefs)) => {
    const next = typeof p === 'function' ? p(prefsRef.current) : { ...prefsRef.current, ...p }
    prefsRef.current = next
    setPrefsState(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { api.put(`${V1}/prefs`, next).catch(() => {}) }, 400)
  }, [])

  const allTiles = useMemo(() => {
    const apps = launcher?.apps || []
    const order = prefs.order || []
    const idx = new Map(order.map((k, i) => [k, i]))
    return [...apps].sort((a, b) => {
      const ia = idx.has(a.key) ? idx.get(a.key)! : Infinity
      const ib = idx.has(b.key) ? idx.get(b.key)! : Infinity
      if (ia !== ib) return ia - ib
      return 0 // keep server order (group, then name)
    })
  }, [launcher, prefs.order])

  const hidden = useMemo(() => new Set(prefs.hidden || []), [prefs.hidden])
  const tiles = useMemo(() => allTiles.filter(t => !hidden.has(t.key)), [allTiles, hidden])

  const dockTiles = useMemo(() => {
    const byKey = new Map(allTiles.map(t => [t.key, t]))
    if (prefs.dock) return prefs.dock.map(k => byKey.get(k)).filter((t): t is Tile => !!t)
    // a sensible default: the first Pocket apps a person has
    return tiles.filter(t => t.pocket && t.type !== 'core' && t.type !== 'firefly').slice(0, 6)
  }, [allTiles, tiles, prefs.dock])

  const open = useCallback((t: Tile) => { window.location.assign(t.open_url || t.url) }, [])

  // ⌘K / Ctrl-K opens the palette; Escape closes whatever is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(v => !v) }
      if (e.key === 'Escape') { setPalette(false); setSheet(null); setEditing(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value: Ctx = { status, user: status?.user || null, refresh, logout, launcher, reload, loading, prefs, setPrefs, tiles, allTiles, dockTiles, open, sheet, setSheet, palette, setPalette, editing, setEditing }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
