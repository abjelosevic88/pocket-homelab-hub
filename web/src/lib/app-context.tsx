import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, V1 } from './api'
import { useNavigate } from 'react-router-dom'
import type { AuthStatus, Launcher, Prefs, Tile, User } from './types'

type Ctx = {
  status: AuthStatus | null
  user: User | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
  launcher: Launcher | null
  reload: () => Promise<void>
  loading: boolean
  launcherError: boolean
  prefs: Prefs
  prefsError: boolean
  prefsSaving: boolean
  retryPrefs: () => void
  setPrefs: (p: Partial<Prefs> | ((p: Prefs) => Prefs)) => void
  tiles: Tile[]          // ordered, hidden removed
  allTiles: Tile[]       // ordered, hidden included
  dockTiles: Tile[]
  openApps: string[]
  setOpenApps: (keys: string[]) => void
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
  const navigate = useNavigate()
  const [openApps, setOpenApps] = useState<string[]>([])
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [launcher, setLauncher] = useState<Launcher | null>(null)
  const [launcherError, setLauncherError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prefs, setPrefsState] = useState<Prefs>({})
  const [sheet, setSheet] = useState<Tile | null>(null)
  const [palette, setPalette] = useState(false)
  const [editing, setEditing] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const prefsRef = useRef<Prefs>({})
  const pendingPrefs = useRef<Prefs | null>(null)
  const savingPrefs = useRef<Promise<void> | null>(null)
  const prefsRevision = useRef(0)
  const [prefsError, setPrefsError] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const flushPrefs = useCallback((): Promise<void> => {
    if (savingPrefs.current) return savingPrefs.current
    if (!pendingPrefs.current) return Promise.resolve()
    const save = async () => {
      while (pendingPrefs.current) {
        const next = pendingPrefs.current
        pendingPrefs.current = null
        try { await api.put(`${V1}/prefs`, next); setPrefsError(false) }
        catch { pendingPrefs.current = pendingPrefs.current || next; setPrefsError(true); break }
      }
    }
    savingPrefs.current = save().finally(() => { savingPrefs.current = null; setPrefsSaving(false) })
    return savingPrefs.current
  }, [])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flushPrefs() }
    const onLeave = (event: BeforeUnloadEvent) => {
      if (pendingPrefs.current || savingPrefs.current) { event.preventDefault(); event.returnValue = ''; void flushPrefs() }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onLeave)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onLeave) }
  }, [flushPrefs])

  const refresh = useCallback(async () => {
    try { setStatus(await api.get<AuthStatus>(`${V1}/auth/status`)) } catch { setStatus(s => s) }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const revision = prefsRevision.current
    try {
      const l = await api.get<Launcher>(`${V1}/launcher`)
      setLauncher(l)
      setLauncherError(false)
      if (revision === prefsRevision.current && !pendingPrefs.current && !savingPrefs.current) {
        prefsRef.current = l.prefs || {}
        setPrefsState(l.prefs || {})
      }
    } catch { setLauncherError(true) } finally { setLoading(false) }
  }, [])

  const logout = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    await flushPrefs()
    if (pendingPrefs.current) return // Keep unsaved personal notes available for retry.
    await api.post(`${V1}/auth/logout`)
    pendingPrefs.current = null
    prefsRef.current = {}
    setPrefsState({})
    setPrefsError(false)
    setLauncher(null)
    setOpenApps([])
    await refresh()
  }, [refresh, flushPrefs])

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
    pendingPrefs.current = next
    setPrefsSaving(true)
    prefsRevision.current++
    setPrefsState(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void flushPrefs() }, 400)
  }, [flushPrefs])

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

  const open = useCallback((t: Tile) => {
    window.dispatchEvent(new CustomEvent('hub:launch', { detail: t.key }))
    setOpenApps(keys => keys.includes(t.key) ? keys : [...keys, t.key])
    setSheet(null); setPalette(false)
    navigate(`/app/${encodeURIComponent(t.key)}`)
  }, [navigate])

  // ⌘K / Ctrl-K opens the palette; Escape closes whatever is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(v => !v) }
      if (e.key === 'Escape') { setPalette(false); setSheet(null); setEditing(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value: Ctx = { status, user: status?.user || null, refresh, logout, launcher, reload, loading, launcherError, prefs, prefsError, prefsSaving, retryPrefs: flushPrefs, setPrefs, tiles, allTiles, dockTiles, openApps, setOpenApps, open, sheet, setSheet, palette, setPalette, editing, setEditing }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
