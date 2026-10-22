import { OverlayPresence } from './ui'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { AppIcon } from './AppIcon'
import { Brand } from './Brand'
import { Bell, Calendar, Gear, Grid, Help, Home, Logout, Moon, Plus, Search, Sun } from './icons'
import { AppSheet } from './AppSheet'
import { Palette } from './Palette'
import { PersonalProvider } from '../lib/personal-context'
import { AppWorkspace } from './experience/AppWorkspace'
import { DailyProvider, capture } from '../lib/daily-context'
import { QuickCapture } from './experience/QuickCapture'
import { FocusSession } from './experience/FocusSession'
import { appearanceFrom, resolvedTheme } from '../lib/theme'
import { friendlyName } from '../lib/catalog'

export default function Layout() {
  const { user } = useApp()
  return <PersonalProvider key={user?.id} userId={user?.id || 0}><DailyProvider><Desktop /></DailyProvider></PersonalProvider>
}

const TITLES: Record<string, string> = { '/': 'Home', '/today': 'Today', '/apps': 'Apps', '/activity': 'Activity', '/settings': 'Settings', '/help': 'Help' }

function Desktop() {
  const { user, prefs, setPrefs, dockTiles, open, sheet, setSheet, palette, setPalette, launcher, editing, setEditing, prefsError, retryPrefs, logout } = useApp()
  const loc = useLocation()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { setEditing(false) }, [loc.pathname, setEditing])
  useEffect(() => { const on = () => setScrolled(window.scrollY > 4); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on) }, [])
  const inApp = loc.pathname.startsWith('/app/')
  const box = launcher?.box?.name || 'Pocket Box'
  const mode = resolvedTheme(appearanceFrom(prefs).theme)
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()
  return <div className={`shell ${inApp ? 'workspace-mode' : ''} ${prefs.density === 'compact' ? 'compact' : ''} ${editing ? 'editing' : ''}`}>
    <aside className="sidebar" aria-label="Sidebar">
      <Brand name={box} />
      <nav className="side-nav" aria-label="Main navigation">
        <NavLink to="/" end><Home /><span>Home</span></NavLink>
        <NavLink to="/apps"><Grid /><span>Apps</span></NavLink>
        <NavLink to="/today"><Calendar /><span>Today</span></NavLink>
        <NavLink to="/activity"><Bell /><span>Activity</span></NavLink>
      </nav>
      <div className="side-label">Favorites</div>
      <div className="side-favorites sidebar-favorites">
        {dockTiles.length ? dockTiles.map(t => <button key={t.key} onClick={() => open(t)} onContextMenu={e => { e.preventDefault(); setSheet(t) }} aria-label={`Open ${t.name}`} title={t.name}><AppIcon t={t} size={26} /><span>{friendlyName(t)}</span>{t.status && t.status !== 'ok' && <span className="dot down" aria-label="Not responding" />}</button>) : <p>Star an app in its details to keep it here.</p>}
      </div>
      <div className="side-spacer" />
      <nav className="side-nav" aria-label="Help and settings">
        <NavLink to="/help"><Help /><span>Help</span></NavLink>
        <NavLink to="/settings"><Gear /><span>Settings</span></NavLink>
      </nav>
      <div className="side-account">
        <span className="avatar" aria-hidden="true">{initial}</span>
        <span><strong>{user?.name || 'Your account'}</strong><small>{user?.email}</small></span>
        <button className="iconbtn" onClick={() => { void logout() }} title="Sign out" aria-label="Sign out"><Logout /></button>
      </div>
    </aside>
    <div className="main-col">
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <span className="topbar-title">{inApp ? 'Apps' : TITLES[loc.pathname] || ''}</span>
        <span className="mobile-brand"><Brand name={box} compact /></span>
        <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Search apps or intentions"><Search /><span>Search apps…</span><kbd>⌘K</kbd></button>
        <button className="iconbtn" onClick={() => setPrefs({ theme: mode === 'dark' ? 'light' : 'dark' })} aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>{mode === 'dark' ? <Sun /> : <Moon />}</button>
        <button className="new-button" onClick={() => capture()} aria-label="Quick capture" title="Add a task, note or memory · Ctrl/⌘ Shift K"><Plus /><span>New</span></button>
      </header>
      <main className="desk-main" hidden={inApp}><Outlet /></main>
      <AppWorkspace />
    </div>
    <FocusSession /><QuickCapture />
    {prefsError && <div className="save-notice" role="alert">Your changes haven’t saved yet.<button onClick={retryPrefs}>Try again</button></div>}
    <nav className="mobile-tabs" aria-label="Mobile navigation">
      <NavLink to="/" end><Home size={22} /><span>Home</span></NavLink>
      <NavLink to="/apps"><Grid size={22} /><span>Apps</span></NavLink>
      <NavLink to="/today"><Calendar size={22} /><span>Today</span></NavLink>
      <NavLink to="/activity"><Bell size={22} /><span>Activity</span></NavLink>
      <NavLink to="/settings"><Gear size={22} /><span>Settings</span></NavLink>
    </nav>
    <OverlayPresence>{sheet && <AppSheet t={sheet} onClose={() => setSheet(null)} />}</OverlayPresence>
    <OverlayPresence>{palette && <Palette onClose={() => setPalette(false)} />}</OverlayPresence>
  </div>
}
