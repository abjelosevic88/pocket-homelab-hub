import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { eventTitle, humanTopic, timeAgo, topicApp } from '../lib/format'
import type { Activity, CoreEvent, Tile } from '../lib/types'
import { AppIcon } from './AppIcon'
import { ChevL, ChevR, External, Eye, EyeOff, Pin } from './icons'
import { Modal, Pill } from './ui'
import { aboutApp, friendlyName, isDown } from '../lib/catalog'

export function AppSheet({ t, onClose }: { t: Tile; onClose: () => void }) {
  const { prefs, setPrefs, allTiles, tiles, open } = useApp()
  const [events, setEvents] = useState<CoreEvent[] | null>(null)
  const pinned = (prefs.dock || []).includes(t.key) || (!prefs.dock && tiles.filter(x => x.pocket && x.type !== 'core' && x.type !== 'firefly').slice(0, 6).some(x => x.key === t.key))
  const hidden = (prefs.hidden || []).includes(t.key)
  const slug = t.slug || t.type

  useEffect(() => {
    let alive = true
    api.get<Activity>(`${V1}/activity`).then(a => { if (alive) setEvents(a.events.filter(e => topicApp(e.topic) === slug).slice(0, 5)) }).catch(() => { if (alive) setEvents([]) })
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
  const about = aboutApp(t)

  return (
    <Modal onClose={onClose}>
      <div className="sheet-head">
        <AppIcon t={t} size={76} />
        <div className="sheet-head-text">
          <h2>{friendlyName(t)}</h2>
          <div className="row"><Pill status={t.status} />{t.group && <span className="chip">{t.group}</span>}</div>
        </div>
      </div>
      {about && <p className="sheet-desc">{about}</p>}
      {isDown(t) && <div className="sheet-status" role="status"><span className="dot down" style={{ marginTop: 7 }} /><span><b>This app isn’t responding right now.</b> It often comes back by itself within a few minutes. If it keeps happening, let the person who looks after your box know.</span></div>}
      <div className="sheet-actions">
        <button className="btn primary lg" onClick={() => open(t)}>Open {friendlyName(t)}</button>
        <a className="btn lg" href={t.open_url || t.url} target="_blank" rel="noreferrer" title="Open in a new browser tab"><External /> New tab</a>
      </div>
      <div className="sheet-more">
        <button className={`btn small ${pinned ? 'on' : ''}`} onClick={togglePin} title={pinned ? 'Remove from favorites' : 'Add to favorites'}><Pin /> {pinned ? 'Favorite' : 'Add to favorites'}</button>
        <button className={`btn small ${hidden ? 'on' : ''}`} onClick={toggleHide} title={hidden ? 'Show on the home screen' : 'Hide from the home screen'}>{hidden ? <Eye /> : <EyeOff />} {hidden ? 'Show on Home' : 'Hide from Home'}</button>
        <span className="grow" />
        <button className="btn small sq" onClick={() => move(-1)} title="Move earlier" aria-label="Move earlier"><ChevL /></button>
        <button className="btn small sq" onClick={() => move(1)} title="Move later" aria-label="Move later"><ChevR /></button>
      </div>
      {events && events.length > 0 && (
        <div className="sheet-events">
          <h3>Recently</h3>
          {events.map(e => <div key={e.id} className="ev small"><span className="ev-title">{eventTitle(e) || humanTopic(e.topic)}</span><span className="ev-time">{timeAgo(e.created_at)}</span></div>)}
        </div>
      )}
      <details className="sheet-tech">
        <summary>Technical details</summary>
        <dl className="sheet-facts">
          <dt>Address</dt><dd><a href={t.url} target="_blank" rel="noreferrer" className="mono">{t.url.replace(/^https?:\/\//, '')}</a></dd>
          {t.version && <><dt>Version</dt><dd className="mono">{t.version.replace(/^v/, '').split('-')[0]}</dd></>}
          {t.last_seen_at && <><dt>Last checked</dt><dd>{timeAgo(t.last_seen_at)}</dd></>}
          {t.last_error && <><dt>Last problem</dt><dd>{t.last_error}</dd></>}
          {t.publishes && t.publishes.length > 0 && <><dt>Shares</dt><dd className="chips">{t.publishes.map(p => <span key={p} className="chip mono">{p}</span>)}</dd></>}
        </dl>
      </details>
    </Modal>
  )
}
