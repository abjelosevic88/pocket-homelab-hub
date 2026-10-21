import { OverlayPresence } from './ui'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { wallpaper } from '../lib/wallpapers'
import { clock } from '../lib/format'
import { AppIcon } from './AppIcon'
import { Brand } from './Brand'
import { Gear, Grid, Home, Pulse, Search } from './icons'
import { AppSheet } from './AppSheet'
import { Palette } from './Palette'
import { PersonalProvider } from '../lib/personal-context'
import { AppWorkspace } from './experience/AppWorkspace'
import { DailyProvider, capture } from '../lib/daily-context'
import { QuickCapture } from './experience/QuickCapture'
import { FocusSession } from './experience/FocusSession'

export default function Layout() {
  const { user } = useApp()
  return <PersonalProvider key={user?.id} userId={user?.id || 0}><DailyProvider><Desktop /></DailyProvider></PersonalProvider>
}

function Desktop() {
  const { user, prefs, dockTiles, open, sheet, setSheet, palette, setPalette, launcher, editing, setEditing, prefsError, retryPrefs } = useApp()
  const wp = wallpaper(prefs.wallpaper)
  const [now, setNow] = useState(new Date())
  const loc = useLocation(), navigate = useNavigate()
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(t) }, [])
  useEffect(() => { setEditing(false) }, [loc.pathname, setEditing])
  const style = prefs.wallpaper_url ? { backgroundImage: `url("${prefs.wallpaper_url}")` } : { background: wp.css }
  const inApp = loc.pathname.startsWith('/app/')
  const box = launcher?.box?.name || 'Pocket Box'
  const section = inApp ? 'Your workspace' : loc.pathname === '/today' ? 'Today' : loc.pathname === '/apps' ? 'App library' : loc.pathname === '/activity' ? 'Activity' : loc.pathname === '/settings' ? 'Settings' : 'Your home'
  return <div className={`desk pocket-shell ${inApp ? 'workspace-mode' : ''} ${prefs.density === 'compact' ? 'compact' : ''} ${editing ? 'editing' : ''}`}>
    <div className={`wallpaper ${prefs.wallpaper_url ? 'image' : ''}`} style={style} aria-hidden="true" />
    <aside className="pocket-sidebar" aria-label="Pocket Box sidebar">
      <Brand name={box} />
      <nav className="pocket-navigation" aria-label="Main navigation">
        <NavLink to="/" end><Home /><span>Home</span></NavLink>
        <NavLink to="/today"><Pulse /><span>Today</span></NavLink>
        <NavLink to="/apps"><Grid /><span>Library</span></NavLink>
        <NavLink to="/activity"><Pulse /><span>Activity</span></NavLink>
      </nav>
      <div className="sidebar-favorites"><div className="sidebar-label">FAVORITES <NavLink to="/apps" aria-label="Manage favorite apps">＋</NavLink></div>
        {dockTiles.length ? dockTiles.map(t => <button key={t.key} onClick={() => open(t)} onContextMenu={e => { e.preventDefault(); setSheet(t) }} aria-label={`Open ${t.name}`} title={t.name}><AppIcon t={t} size={23} /><span>{t.name.replace(/^Pocket /, '')}</span>{t.status === 'down' && <span className="dot down" aria-label="Unavailable" />}</button>) : <p>Pin an app from its details to keep it here.</p>}
      </div>
      <div className="sidebar-bottom"><span className="sidebar-signature">A home for your everyday.</span><NavLink to="/settings"><Gear /><span>Settings</span></NavLink><div className="sidebar-account"><span className="avatar" aria-hidden="true">{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</span><span><strong>{user?.name || 'Your account'}</strong><small>Your personal space</small></span></div></div>
    </aside>
    <div className="pocket-content">
      <header className="topbar">
        <div className="topbar-left"><span className="desktop-section">{section}</span><span className="mobile-brand"><Brand name={box} compact /></span></div>
        <button className="searchpill" onClick={() => setPalette(true)} aria-label="Search apps or intentions"><Search /><span>Find an app or something to do</span><kbd>⌘K</kbd></button>
        <div className="topbar-right"><div className="clock"><span className="time">{clock(now, !!prefs.clock24)}</span><span className="date">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div><button className="quick-capture-button" onClick={() => capture()} aria-label="Quick capture" title="Quick capture · Ctrl/⌘ Shift K">＋<span> Capture</span></button><button className="avatar account-button" onClick={() => navigate('/settings')} title={user?.email} aria-label="Account">{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</button></div>
      </header>
      <main className="desk-main" hidden={inApp}><Outlet /></main>
      <AppWorkspace />
    </div>
    <FocusSession /><QuickCapture />
    {prefsError && <div className="save-notice" role="alert">Your changes haven’t saved yet.<button onClick={retryPrefs}>Try again</button></div>}
    <nav className="mobile-navigation" aria-label="Mobile navigation"><NavLink to="/" end><Home /><span>Home</span></NavLink><NavLink to="/today"><Pulse /><span>Today</span></NavLink><NavLink to="/apps"><Grid /><span>Library</span></NavLink><NavLink to="/activity"><Pulse /><span>Activity</span></NavLink><NavLink to="/settings"><Gear /><span>Settings</span></NavLink></nav>
    <OverlayPresence>{sheet && <AppSheet t={sheet} onClose={() => setSheet(null)} />}</OverlayPresence>
    <OverlayPresence>{palette && <Palette onClose={() => setPalette(false)} />}</OverlayPresence>
  </div>
}
