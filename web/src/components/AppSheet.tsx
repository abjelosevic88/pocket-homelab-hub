import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { eventTitle, humanTopic, timeAgo, topicApp } from '../lib/format'
import type { Activity, CoreEvent, Tile } from '../lib/types'
import { AppIcon } from './AppIcon'
import { ChevL, ChevR, External, Eye, EyeOff, Pin } from './icons'
import { Modal, Pill } from './ui'

export function AppSheet({ t, onClose }: { t: Tile; onClose: () => void }) {
  const { prefs, setPrefs, allTiles, tiles, open } = useApp()
  const [events, setEvents] = useState<CoreEvent[] | null>(null)
  const pinned = (prefs.dock || []).includes(t.key) || (!prefs.dock && tiles.filter(x => x.pocket && x.type !== 'core' && x.type !== 'firefly').slice(0, 6).some(x => x.key === t.key))
  const hidden = (prefs.hidden || []).includes(t.key)
  const slug = t.slug || t.type

  useEffect(() => {
    let alive = true
    api.get<Activity>(`${V1}/activity`).then(a => { if (alive) setEvents(a.events.filter(e => topicApp(e.topic) === slug).slice(0, 6)) }).catch(() => { if (alive) setEvents([]) })
    return () => { alive = false }
  }, [slug])

  const currentDock = () => prefs.dock || tiles.filter(x => x.pocket && x.type !== 'core' && x.type !== 'firefly').slice(0, 6).map(x => x.key)
  const togglePin = () => {
    const d = currentDock()
    setPrefs({ dock: pinned ? d.filter(k => k !== t.key) : [...d, t.key].slice(-10) })
  }
  const toggleHide = () => {
    const h = prefs.hidden || []
    setPrefs({ hidden: hidden ? h.filter(k => k !== t.key) : [...h, t.key] })
  }
  const move = (dir: -1 | 1) => {
    const keys = allTiles.map(x => x.key)
    const i = keys.indexOf(t.key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= keys.length) return
    keys.splice(i, 1); keys.splice(j, 0, t.key)
    setPrefs({ order: keys })
  }

  return (
    <Modal onClose={onClose}>
      <div className="sheet-head">
        <AppIcon t={t} size={88} />
        <div className="sheet-head-text">
          <h2>{t.name}</h2>
          <div className="sheet-meta">
            <span className="chip">{t.group}</span>
            {t.version && <span className="chip mono">v{t.version.replace(/^v/, '').split('-')[0]}</span>}
            <Pill status={t.status} />
          </div>
        </div>
      </div>
      {t.description && <p className="sheet-desc">{t.description}</p>}
      {t.last_error && <p className="callout">{t.last_error}</p>}
      <div className="sheet-actions">
        <button className="btn primary" onClick={() => open(t)}>Open{t.open_url && t.open_url !== t.url ? ' · signed in' : ''}</button>
        <a className="btn" href={t.open_url || t.url} target="_blank" rel="noreferrer" title="Open in a new tab"><External /></a>
        <button className={`btn ${pinned ? 'on' : ''}`} onClick={togglePin} title={pinned ? 'Remove from favorites' : 'Add to favorites'}><Pin /> {pinned ? 'Pinned' : 'Pin'}</button>
        <button className={`btn ${hidden ? 'on' : ''}`} onClick={toggleHide} title={hidden ? 'Show on the home screen' : 'Hide from the home screen'}>{hidden ? <Eye /> : <EyeOff />} {hidden ? 'Hidden' : 'Hide'}</button>
        <span className="grow" />
        <button className="btn sq" onClick={() => move(-1)} title="Move earlier"><ChevL /></button>
        <button className="btn sq" onClick={() => move(1)} title="Move later"><ChevR /></button>
      </div>
      <dl className="sheet-facts">
        <dt>Address</dt><dd><a href={t.url} target="_blank" rel="noreferrer" className="mono">{t.url.replace(/^https?:\/\//, '')}</a></dd>
        {t.last_seen_at && <><dt>Last seen</dt><dd>{timeAgo(t.last_seen_at)}</dd></>}
        {t.publishes && t.publishes.length > 0 && <><dt>Publishes</dt><dd className="chips">{t.publishes.map(p => <span key={p} className="chip mono">{p}</span>)}</dd></>}
      </dl>
      {events && events.length > 0 && (
        <div className="sheet-events">
          <h3>Recent activity</h3>
          {events.map(e => <div key={e.id} className="ev small"><span className="ev-topic">{humanTopic(e.topic)}</span><span className="ev-title">{eventTitle(e)}</span><span className="ev-time">{timeAgo(e.created_at)}</span></div>)}
        </div>
      )}
    </Modal>
  )
}
