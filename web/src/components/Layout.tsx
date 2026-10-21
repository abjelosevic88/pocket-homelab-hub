import { OverlayPresence } from './ui'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { wallpaper } from '../lib/wallpapers'
import { clock } from '../lib/format'
import { AppIcon } from './AppIcon'
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
  const loc = useLocation()
  const navigate = useNavigate()
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(t) }, [])
  useEffect(() => { setEditing(false) }, [loc.pathname, setEditing])

  const style = prefs.wallpaper_url ? { backgroundImage: `url("${prefs.wallpaper_url}")` } : { background: wp.css }
  const inApp = loc.pathname.startsWith('/app/')
  const box = launcher?.box?.name || 'Pocket Box'

  return (
    <div className={`desk ${inApp ? 'workspace-mode' : ''} ${prefs.density === 'compact' ? 'compact' : ''} ${editing ? 'editing' : ''}`} style={{ ['--accent' as string]: wp.accent }}>
      <div className={`wallpaper ${prefs.wallpaper_url ? 'image' : ''}`} style={style} aria-hidden="true" />
      <div className="wallpaper-noise" aria-hidden="true" />

      <header className="topbar">
        <div className="topbar-left">
          <div className="box-name"><span className="brand-mark">p.</span>{box}<span className="brand-edition">YOUR PERSONAL WORLD</span></div>
          <nav className="main-nav" aria-label="Main navigation"><NavLink to="/" end>Home</NavLink><NavLink to="/today">Today</NavLink><NavLink to="/apps">Apps</NavLink><NavLink to="/activity">Activity</NavLink></nav>
        </div>
        <button className="searchpill" onClick={() => setPalette(true)} aria-label="Search apps or intentions">
          <Search /><span>What would you like to do?</span><kbd>⌘K</kbd>
        </button>
        <div className="topbar-right"><button className="quick-capture-button" onClick={() => capture()} aria-label="Quick capture" title="Quick capture · Ctrl/⌘ Shift K">＋<span> Capture</span></button>
          <div className="clock" title={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <span className="time">{clock(now, !!prefs.clock24)}</span>
            <span className="date">{now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
          <button className="avatar" onClick={() => navigate('/settings')} title={user?.email} aria-label="Account">{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</button>
        </div>
      </header>

      <main className="desk-main" hidden={inApp}><Outlet /></main>
      <AppWorkspace />
      <FocusSession /><QuickCapture />
      {prefsError && <div className="save-notice" role="alert">Your changes haven’t saved yet.<button onClick={retryPrefs}>Try again</button></div>}

      <nav className="dock" aria-label="Dock" hidden={inApp}>
        <div className="dock-inner">
          {dockTiles.map(t => (
            <button key={t.key} className="dock-item" onClick={() => open(t)} onContextMenu={e => { e.preventDefault(); setSheet(t) }} title={t.name}>
              <AppIcon t={t} size={44} />
              {t.status === 'down' && <span className="dock-dot down" />}
            </button>
          ))}
          {dockTiles.length > 0 && <span className="dock-sep" />}
          <NavLink to="/" end className={({ isActive }) => `dock-item sys ${isActive ? 'active' : ''}`} title="Home"><span className="sysico"><Home /></span></NavLink>
          <NavLink to="/apps" className={({ isActive }) => `dock-item sys ${isActive ? 'active' : ''}`} title="App library"><span className="sysico"><Grid /></span></NavLink>
          <NavLink to="/activity" className={({ isActive }) => `dock-item sys ${isActive ? 'active' : ''}`} title="Activity"><span className="sysico"><Pulse /></span></NavLink>
          <NavLink to="/settings" className={({ isActive }) => `dock-item sys ${isActive ? 'active' : ''}`} title="Settings"><span className="sysico"><Gear /></span></NavLink>
        </div>
      </nav>

      <OverlayPresence>{sheet && <AppSheet t={sheet} onClose={() => setSheet(null)} />}</OverlayPresence>
      <OverlayPresence>{palette && <Palette onClose={() => setPalette(false)} />}</OverlayPresence>
    </div>
  )
}
