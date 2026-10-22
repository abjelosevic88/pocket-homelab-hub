import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { AppIcon } from '../components/AppIcon'
import { Toggle } from '../components/ui'
import { Check, Logout, Monitor, Moon, Sun } from '../components/icons'
import { ACCENTS, appearanceFrom, type ThemeChoice } from '../lib/theme'
import { friendlyName } from '../lib/catalog'

type SysInfo = { version: string; uptime_s: number; base_url: string; core: { configured: boolean; url: string; public_url: string; registered: boolean; error: string } }

const THEMES: { id: ThemeChoice; name: string; icon: React.ReactNode }[] = [
  { id: 'light', name: 'Light', icon: <Sun size={16} /> },
  { id: 'dark', name: 'Dark', icon: <Moon size={16} /> },
  { id: 'system', name: 'Automatic', icon: <Monitor size={16} /> },
]

export default function SettingsPage() {
  const { user, status, prefs, setPrefs, allTiles, logout, refresh, launcher } = useApp()
  const [sys, setSys] = useState<SysInfo | null>(null)
  const [me, setMe] = useState<{ core_linked: boolean } | null>(null)
  const [name, setName] = useState(user?.name || '')
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState('')
  useEffect(() => { api.get<SysInfo>(`${V1}/system`).then(setSys).catch(() => {}); api.get<{ core_linked: boolean }>(`${V1}/auth/me`).then(setMe).catch(() => {}) }, [])
  const hidden = allTiles.filter(t => (prefs.hidden || []).includes(t.key))
  const look = appearanceFrom(prefs)

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    try { await api.put(`${V1}/auth/me`, { name, ...(pw.new_password ? pw : {}) }); setPw({ current_password: '', new_password: '' }); await refresh(); setMsg('Saved.') } catch (err) { setMsg((err as Error).message) }
  }

  return (
    <div className="page narrow">
      <header className="page-head"><div><h1>Settings</h1><p>Make Pocket Box look and feel the way you like. These settings are just for you.</p></div></header>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="card-surface panel">
          <div className="theme-options" role="radiogroup" aria-label="Theme">
            {THEMES.map(t => <button key={t.id} role="radio" aria-checked={look.theme === t.id} className="theme-option" onClick={() => setPrefs({ theme: t.id })}>
              <span className={`theme-preview ${t.id}`} aria-hidden="true"><i /><b><u /><u /><u /></b></span>
              <span>{t.icon}{t.name}{look.theme === t.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}><Check /></span>}</span>
            </button>)}
          </div>
          <span className="setting-label">Colour</span>
          <span className="setting-help">Used for buttons and highlights.</span>
          <div className="accent-options" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map(a => <button key={a.id} role="radio" aria-checked={look.accent === a.id} aria-label={a.name} title={a.name} style={{ background: a.swatch }} onClick={() => setPrefs({ accent: a.id })}>{look.accent === a.id && <Check />}</button>)}
          </div>
          <div className="row-between" style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
            <span><span className="toggle-label">Text size</span><span className="toggle-help">Larger text is easier to read.</span></span>
            <span className="segmented" role="radiogroup" aria-label="Text size">
              <button role="radio" aria-checked={look.text === 'normal'} onClick={() => setPrefs({ text_size: 'normal' })}>Normal</button>
              <button role="radio" aria-checked={look.text === 'large'} onClick={() => setPrefs({ text_size: 'large' })}>Large</button>
            </span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Home screen</h2>
        <div className="card-surface panel">
          <Toggle label="Show app names" help="Names under each app icon." value={prefs.labels !== false} onChange={v => setPrefs({ labels: v })} />
          <Toggle label="Smaller icons" help="Fit more apps on the screen." value={prefs.density === 'compact'} onChange={v => setPrefs({ density: v ? 'compact' : 'cozy' })} />
          <Toggle label="Group apps by type" value={!!prefs.group} onChange={v => setPrefs({ group: v })} />
          <Toggle label="24-hour clock" value={!!prefs.clock24} onChange={v => setPrefs({ clock24: v })} />
          <Toggle label="Getting started guide" help="Show the welcome checklist on Home." value={!prefs.welcome_done} onChange={v => setPrefs({ welcome_done: !v })} />
          <div className="row-between" style={{ padding: '14px 0' }}>
            <span><span className="toggle-label">Start over</span><span className="toggle-help">Put apps back in their original order and show hidden apps.</span></span>
            <button className="btn small" onClick={() => setPrefs({ order: [], dock: undefined, hidden: [] })}>Reset layout</button>
          </div>
          {hidden.length > 0 && (
            <div className="hidden-list">
              <span className="toggle-help">Hidden from Home (still in Apps and search)</span>
              {hidden.map(t => <div key={t.key} className="hidden-row"><AppIcon t={t} size={28} /><span>{friendlyName(t)}</span><button className="btn small" onClick={() => setPrefs({ hidden: (prefs.hidden || []).filter(k => k !== t.key) })}>Show</button></div>)}
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Your account</h2>
        <div className="card-surface panel pad">
          <form onSubmit={saveAccount} className="form">
            <div className="row-between"><span><span className="toggle-label">{user?.email}</span><span className="toggle-help">{user?.role === 'admin' ? 'You look after this box' : 'Member of this box'}</span></span></div>
            <label className="field"><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            {status?.password_login && <>
              <label className="field"><span>Current password</span><input type="password" value={pw.current_password} onChange={e => setPw(p => ({ ...p, current_password: e.target.value }))} autoComplete="current-password" /></label>
              <label className="field"><span>New password</span><input type="password" value={pw.new_password} onChange={e => setPw(p => ({ ...p, new_password: e.target.value }))} autoComplete="new-password" minLength={8} /></label>
            </>}
            {!me?.core_linked && status?.oidc && <p className="callout">Your apps aren’t linked to this account yet. <a href={`${V1}/auth/oidc/start?next=/settings`}>Sign in again to link them</a>.</p>}
            <div className="row-between"><span className="toggle-help">{msg}</span><button className="btn primary">Save</button></div>
          </form>
          <div className="row-between mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}><span className="toggle-help">Signed in on this device</span><button className="btn small" onClick={logout}><Logout /> Sign out</button></div>
        </div>
      </section>

      <section className="settings-section">
        <h2>About this box</h2>
        <div className="card-surface panel">
          <dl className="facts">
            <dt>Name</dt><dd>{launcher?.box?.name || 'Pocket Box'}</dd>
            <dt>Version</dt><dd className="mono">{(sys?.version || status?.version || '').replace(/^v/, '')}</dd>
            {user?.role === 'admin' && sys?.core.configured && <><dt>Box management</dt><dd>{sys.core.registered ? <a href={sys.core.public_url} target="_blank" rel="noreferrer">Open Pocket Core</a> : 'Still connecting'}{sys.core.error && <span className="muted"> · {sys.core.error}</span>}</dd></>}
          </dl>
        </div>
      </section>
    </div>
  )
}
