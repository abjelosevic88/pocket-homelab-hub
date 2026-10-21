import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { WALLPAPERS } from '../lib/wallpapers'
import { AppIcon } from '../components/AppIcon'
import { Glass, Toggle } from '../components/ui'
import { Check } from '../components/icons'

type SysInfo = { version: string; uptime_s: number; base_url: string; core: { configured: boolean; url: string; public_url: string; registered: boolean; error: string } }

export default function SettingsPage() {
  const { user, status, prefs, setPrefs, allTiles, logout, refresh } = useApp()
  const [sys, setSys] = useState<SysInfo | null>(null)
  const [me, setMe] = useState<{ core_linked: boolean } | null>(null)
  const [name, setName] = useState(user?.name || '')
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState('')
  useEffect(() => { api.get<SysInfo>(`${V1}/system`).then(setSys).catch(() => {}); api.get<{ core_linked: boolean }>(`${V1}/auth/me`).then(setMe).catch(() => {}) }, [])
  const hidden = allTiles.filter(t => (prefs.hidden || []).includes(t.key))

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    try { await api.put(`${V1}/auth/me`, { name, ...(pw.new_password ? pw : {}) }); setPw({ current_password: '', new_password: '' }); await refresh(); setMsg('Saved.') } catch (err) { setMsg((err as Error).message) }
  }

  return (
    <div className="page narrow">
      <header className="page-head"><div><h1>Settings</h1><p className="muted">Your home screen, your account, this box.</p></div></header>

      <h2 className="sec-title">Wallpaper</h2>
      <Glass className="panel">
        <div className="swatches">
          {WALLPAPERS.map(w => (
            <button key={w.id} className={`swatch ${(prefs.wallpaper || 'dusk') === w.id && !prefs.wallpaper_url ? 'on' : ''}`} style={{ background: w.css }} onClick={() => setPrefs({ wallpaper: w.id, wallpaper_url: '' })} title={w.name}>
              {(prefs.wallpaper || 'dusk') === w.id && !prefs.wallpaper_url && <Check />}<span className="swatch-name">{w.name}</span>
            </button>
          ))}
        </div>
        <label className="field"><span>Or an image of your own (URL)</span><input value={prefs.wallpaper_url || ''} onChange={e => setPrefs({ wallpaper_url: e.target.value.trim() })} placeholder="https://…/wallpaper.jpg" /></label>
      </Glass>

      <h2 className="sec-title">Home screen</h2>
      <Glass className="panel">
        <Toggle label="Group apps by category" value={!!prefs.group} onChange={v => setPrefs({ group: v })} />
        <Toggle label="Show names under icons" value={prefs.labels !== false} onChange={v => setPrefs({ labels: v })} />
        <Toggle label="Compact icons" help="Smaller tiles, more per row" value={prefs.density === 'compact'} onChange={v => setPrefs({ density: v ? 'compact' : 'cozy' })} />
        <Toggle label="24-hour clock" value={!!prefs.clock24} onChange={v => setPrefs({ clock24: v })} />
        <div className="row-between">
          <span className="toggle-label">Layout</span>
          <button className="btn small" onClick={() => setPrefs({ order: [], dock: undefined, hidden: [] })}>Reset order, dock and hidden apps</button>
        </div>
        {hidden.length > 0 && (
          <div className="hidden-list">
            <div className="toggle-help">Hidden from the home screen (still in the library and search)</div>
            {hidden.map(t => <div key={t.key} className="hidden-row"><AppIcon t={t} size={24} /><span>{t.name}</span><button className="btn small" onClick={() => setPrefs({ hidden: (prefs.hidden || []).filter(k => k !== t.key) })}>Show</button></div>)}
          </div>
        )}
      </Glass>

      <h2 className="sec-title">Account</h2>
      <Glass className="panel">
        <form onSubmit={saveAccount} className="form">
          <div className="row-between"><span className="toggle-label">{user?.email}</span><span className="chip">{user?.role}</span></div>
          <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
          {status?.password_login && <>
            <label className="field"><span>Current password</span><input type="password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} autoComplete="current-password" /></label>
            <label className="field"><span>New password</span><input type="password" value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" minLength={8} /></label>
          </>}
          <div className="row-between">
            <span className="toggle-help">{me?.core_linked ? 'Connected to Pocket Core as you.' : status?.oidc ? 'Not connected to Pocket Core as you yet.' : ''}{!me?.core_linked && status?.oidc && <> <a href={`${V1}/auth/oidc/start?next=/settings`}>Sign in with {status.oidc_name}</a></>}</span>
            <span className="row"><span className="toggle-help">{msg}</span><button className="btn primary small">Save</button></span>
          </div>
        </form>
        <div className="row-between mt"><span className="toggle-help">Signed in on this browser</span><button className="btn small" onClick={logout}>Sign out</button></div>
      </Glass>

      <h2 className="sec-title">About</h2>
      <Glass className="panel">
        <dl className="facts">
          <dt>Pocket Hub</dt><dd className="mono">v{(sys?.version || status?.version || '').replace(/^v/, '')}</dd>
          <dt>Pocket Core</dt><dd>{sys?.core.configured ? <>{sys.core.registered ? 'registered' : 'registration pending'}{sys.core.error && <span className="muted"> · {sys.core.error}</span>} · <a href={sys.core.public_url} target="_blank" rel="noreferrer">open Core</a></> : 'not configured'}</dd>
          <dt>Source</dt><dd><a href="https://github.com/abjelosevic88/pocket-homelab-hub" target="_blank" rel="noreferrer">github.com/abjelosevic88/pocket-homelab-hub</a></dd>
        </dl>
      </Glass>
    </div>
  )
}
