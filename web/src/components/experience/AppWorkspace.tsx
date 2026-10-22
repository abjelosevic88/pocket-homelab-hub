import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import type { Tile } from '../../lib/types'
import { AppIcon } from '../AppIcon'
import { Refresh, X, External } from '../icons'

export function AppWorkspace() {
  const { allTiles, launcher, openApps, setOpenApps, open, setPalette } = useApp()
  const loc = useLocation()
  const navigate = useNavigate()
  let key = ''
  if (loc.pathname.startsWith('/app/')) { try { key = decodeURIComponent(loc.pathname.slice(5)) } catch { key = loc.pathname.slice(5) } }
  const [revisions, setRevisions] = useState<Record<string, number>>({})
  const [help, setHelp] = useState(false)
  const apps = openApps.map(k => allTiles.find(t => t.key === k)).filter(t => !!t)
  const active = allTiles.find(t => t.key === key)
  useEffect(() => {
    if (active && !openApps.includes(active.key)) setOpenApps([...openApps, active.key])
  // Add a deep-linked app when the route resolves. Do not reopen a tab while
  // its close action is navigating to the next app.
  }, [active?.key, setOpenApps])
  useEffect(() => { setHelp(false) }, [key])
  const close = (k: string) => {
    const next = openApps.filter(v => v !== k)
    setOpenApps(next)
    if (key === k) navigate(next.length ? `/app/${encodeURIComponent(next[next.length - 1])}` : '/')
  }
  if (!key && !apps.length) return null
  return <section className="app-workspace" hidden={!key} aria-label="App workspace">
    <div className="workspace-bar">
      <div className="workspace-tabs" aria-label="Open apps">{apps.map(t => <div key={t.key} className={`workspace-tab ${t.key === key ? 'active' : ''}`}><button onClick={() => open(t)} aria-current={t.key === key ? 'page' : undefined}><AppIcon t={t} size={22} /><span>{t.name.replace(/^Pocket /, '')}</span></button><button onClick={() => close(t.key)} aria-label={`Close ${t.name}`}><X /></button></div>)}<button className="workspace-add" onClick={() => setPalette(true)} aria-label="Open another app">＋</button></div>
      <div className="workspace-tools">{active && <button className="iconbtn" onClick={() => setRevisions(r => ({ ...r, [key]: (r[key] || 0) + 1 }))} title="Reload app" aria-label="Reload app"><Refresh /></button>}<button className="text-button" onClick={() => setHelp(v => !v)} aria-expanded={help}>Help</button></div>
    </div>
    {help && <div className="workspace-help"><span>Your app stays open while you go Home or switch apps. If it asks you to sign in and nothing happens, open it in a new tab, sign in there, then press reload here.</span>{active && <a className="btn small" href={active.open_url || active.url} target="_blank" rel="noopener noreferrer">Open in new tab <External /></a>}</div>}
    {apps.map(t => <AppFrame key={`${t.key}-${revisions[t.key] || 0}`} tile={t} active={key === t.key} onHelp={() => setHelp(true)} />)}
    {key && !active && <div className="workspace-empty"><h2>{launcher ? 'This app isn’t available on your account.' : 'Getting your apps ready…'}</h2><p>See which apps you can use.</p><button className="btn" onClick={() => navigate('/apps')}>Browse apps</button></div>}
  </section>
}

function AppFrame({ tile, active, onHelp }: { tile: Tile; active: boolean; onHelp: () => void }) {
  const [state, setState] = useState<'loading' | 'responded' | 'slow'>('loading')
  useEffect(() => {
    const id = window.setTimeout(() => setState(s => s === 'loading' ? 'slow' : s), 12000)
    return () => window.clearTimeout(id)
  }, [])
  const src = tile.open_url || tile.url
  const supported = /^https?:\/\//i.test(src) && !(window.location.protocol === 'https:' && src.startsWith('http:'))
  return <div className="frame-container" hidden={!active}>
    {supported ? <iframe title={tile.name} src={src} className="app-frame" onLoad={() => setState('responded')} onError={() => setState('slow')} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation allow-pointer-lock" allow="fullscreen; picture-in-picture; clipboard-write" referrerPolicy="strict-origin-when-cross-origin" /> : <div className="workspace-empty"><h2>This app can’t open here yet.</h2><p>It needs a secure (https) address. The person who looks after your box can set one up.</p></div>}
    {supported && state !== 'responded' && <div className="frame-loading" role="status"><AppIcon t={tile} size={36} /><span>{state === 'loading' ? `Opening ${tile.name.replace(/^Pocket /, '')}…` : 'This is taking longer than usual…'}</span>{state === 'slow' && <button className="text-button" onClick={onHelp}>Get help</button>}</div>}
  </div>
}
