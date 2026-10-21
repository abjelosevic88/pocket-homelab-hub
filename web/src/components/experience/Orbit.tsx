import { useState, type CSSProperties } from 'react'
import { useApp } from '../../lib/app-context'
import { AppIcon } from '../AppIcon'

export function Orbit() {
  const { tiles, setSheet, launcher } = useApp()
  const [hover, setHover] = useState<string | null>(null)
  // This is a view of registered apps, not an invented network topology.
  const apps = tiles.filter(t => t.pocket && t.type !== 'core').slice(0, 12)
  const selected = apps.find(t => t.key === hover)
  const box = launcher?.box
  return <div className="orbit" aria-label="Your Pocket apps, arranged around your box">
    <div className="orbit-grid" aria-hidden="true" />
    <div className="orbit-ring outer" /><div className="orbit-ring inner" />
    <div className="orbit-axis horizontal" /><div className="orbit-axis vertical" />
    <div className="orbit-center"><div className="orbit-core">p<span>.</span></div><span>YOUR POCKET BOX</span><small>{box ? `${box.apps_up} / ${box.apps_checked} checked online` : 'Connected'}</small></div>
    {apps.map((t, i) => {
      const angle = (i / apps.length) * Math.PI * 2 - Math.PI / 2
      const radius = i % 2 ? 42 : 29
      return <button key={t.key} className={`orbit-app ${t.status === 'down' ? 'is-down' : ''}`} style={{ left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%`, '--delay': `${i * -0.7}s` } as CSSProperties} onMouseEnter={() => setHover(t.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(t.key)} onBlur={() => setHover(null)} onClick={() => setSheet(t)} aria-label={`${t.name}: ${t.status === 'ok' ? 'online' : t.status === 'down' ? 'down' : 'not checked'}. Show details.`}>
        <AppIcon t={t} size={42} /><span className={`orbit-status ${t.status || 'unknown'}`} />
      </button>
    })}
    <div className="orbit-caption" aria-live="polite">{selected ? <><span className={`dot ${selected.status === 'ok' ? 'ok' : selected.status === 'down' ? 'down' : ''}`} />{selected.name}<span>↗</span></> : <><span className="tiny-cross">✦</span>{apps.length ? 'A small universe. Entirely yours.' : 'Your world starts with your first app.'}</>}</div>
    <span className="orbit-coordinate">01 / YOUR ORBIT</span>
  </div>
}
