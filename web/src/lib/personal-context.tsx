import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Visit = { key: string; at: number }
type Focus = { duration: number; remaining: number; endsAt: number | null; active: boolean }
type Personal = {
  recent: Visit[]; remember: (key: string) => void; clearRecent: () => void
  focus: Focus; remaining: number; start: (minutes: number) => void; pause: () => void; resume: () => void; reset: () => void
}
const PersonalContext = createContext<Personal>(null as unknown as Personal)
export const usePersonal = () => useContext(PersonalContext)
const idle: Focus = { duration: 25 * 60, remaining: 25 * 60, endsAt: null, active: false }
function read(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Usable in memory when browser storage is unavailable. */ } }
function readFocus(key: string): Focus {
  const f = read(key) as Focus | null
  return f && typeof f.active === 'boolean' && Number.isFinite(f.duration) && f.duration > 0 && Number.isFinite(f.remaining) && (f.endsAt === null || Number.isFinite(f.endsAt)) ? f : idle
}
function readRecent(key: string): Visit[] {
  const r = read(key)
  return Array.isArray(r) ? r.filter(v => v && typeof v.key === 'string' && Number.isFinite(v.at)).slice(0, 8) : []
}
export function PersonalProvider({ userId, children }: { userId: number; children: ReactNode }) {
  const recentKey = `pocket-hub:${userId}:recent`
  const focusKey = `pocket-hub:${userId}:focus`
  const [recent, setRecent] = useState(() => readRecent(recentKey))
  const [focus, setFocus] = useState<Focus>(() => readFocus(focusKey))
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!focus.active || !focus.endsAt) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [focus.active, focus.endsAt])
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === recentKey || e.key === null) setRecent(readRecent(recentKey))
      if (e.key === focusKey || e.key === null) { setFocus(readFocus(focusKey)); setNow(Date.now()) }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [recentKey, focusKey])
  const remaining = focus.endsAt ? Math.max(0, Math.ceil((focus.endsAt - now) / 1000)) : focus.remaining
  const update = (f: Focus) => { save(focusKey, f); setFocus(f); setNow(Date.now()) }
  const remember = (key: string) => {
    const next = [{ key, at: Date.now() }, ...readRecent(recentKey).filter(v => v.key !== key)].slice(0, 8)
    save(recentKey, next); setRecent(next)
  }
  useEffect(() => {
    const onLaunch = (e: Event) => remember((e as CustomEvent<string>).detail)
    window.addEventListener('hub:launch', onLaunch)
    return () => window.removeEventListener('hub:launch', onLaunch)
  }, [recentKey])
  return <PersonalContext.Provider value={{
    recent, remember, clearRecent: () => { save(recentKey, []); setRecent([]) }, focus, remaining,
    start: minutes => update({ duration: minutes * 60, remaining: minutes * 60, endsAt: Date.now() + minutes * 60000, active: true }),
    pause: () => update({ ...focus, remaining: focus.endsAt ? Math.max(0, Math.ceil((focus.endsAt - Date.now()) / 1000)) : remaining, endsAt: null }),
    resume: () => update({ ...focus, endsAt: Date.now() + remaining * 1000 }),
    reset: () => update(idle),
  }}>{children}</PersonalContext.Provider>
}
export function timerLabel(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}` }
