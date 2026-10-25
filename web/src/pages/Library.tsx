import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { AppIcon } from '../components/AppIcon'
import { Dots, Pin, Search } from '../components/icons'
import { aboutApp, friendlyName, isDown } from '../lib/catalog'
import { categorize, categoryOf } from '../lib/categories'
import type { Tile } from '../lib/types'

const host = (t: Tile) => { try { return new URL(t.open_url || t.url).host } catch { return '' } }

export default function LibraryPage() {
  const { allTiles, prefs, setSheet, open, dockTiles } = useApp()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(params.get('problems') ? '!down' : '')
  const hidden = new Set(prefs.hidden || [])
  const starred = new Set(dockTiles.map(t => t.key))
  const groups = useMemo(() => categorize(allTiles).map(([c]) => c), [allTiles])
  const down = allTiles.filter(isDown)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return allTiles.filter(t => (group === '!down' ? isDown(t) : !group || categoryOf(t) === group) && (!s || `${t.name} ${t.type} ${categoryOf(t)} ${aboutApp(t)}`.toLowerCase().includes(s)))
  }, [allTiles, q, group])

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Apps</h1><p>{allTiles.length === 1 ? 'One app' : `${allTiles.length} apps`} on your Pocket Box{down.length ? ` · ${down.length} not responding` : ' · all running'}</p></div>
      </header>
      <div className="apps-toolbar">
        <label className="searchbox"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search apps" aria-label="Search apps" /></label>
        {(groups.length > 1 || down.length > 0) && <div className="chips scroll">
          <button className={`chip btnchip ${!group ? 'on' : ''}`} onClick={() => setGroup('')}>All</button>
          {groups.length > 1 && groups.map(g => <button key={g} className={`chip btnchip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}
          {down.length > 0 && <button className={`chip btnchip ${group === '!down' ? 'on' : ''}`} onClick={() => setGroup('!down')}>Needs attention</button>}
        </div>}
      </div>
      {list.length === 0 && <div className="empty card-surface">{q ? `No apps match “${q}”.` : 'Nothing here right now.'}</div>}
      {(group ? [[group === '!down' ? 'Needs attention' : group, list] as [string, Tile[]]] : categorize(list)).map(([name, apps]) => <section key={name} className="app-section" aria-label={name}>
        <h2 className="sec-title">{name}<span className="sec-count">{apps.length}</span></h2>
        <div className="app-cards">
          {apps.map(t => (
            <div key={t.key} className={`app-card ${hidden.has(t.key) ? 'dim' : ''}`}>
              <button className="app-card-main" onClick={() => open(t)} aria-label={`Open ${t.name}`}>
                <AppIcon t={t} size={44} />
                <span className="app-card-text">
                  <strong><span>{friendlyName(t)}</span>{starred.has(t.key) && <span className="app-card-star" title="Favorite"><Pin size={13} /></span>}{hidden.has(t.key) && <span className="chip tiny">Hidden from Home</span>}</strong>
                  {isDown(t) ? <small className="problem"><span className="dot down" />Not responding right now</small> : <small>{aboutApp(t) || host(t)}</small>}
                </span>
              </button>
              <button className="iconbtn" onClick={() => setSheet(t)} aria-label={`More about ${t.name}`} title="Details and options"><Dots /></button>
            </div>
          ))}
        </div>
      </section>)}
    </div>
  )
}
