import { useMemo, useState } from 'react'
import { useApp } from '../lib/app-context'
import { AppIcon } from '../components/AppIcon'
import { Glass, Pill } from '../components/ui'
import { Search } from '../components/icons'

export default function LibraryPage() {
  const { allTiles, prefs, setSheet, open } = useApp()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const hidden = new Set(prefs.hidden || [])
  const groups = useMemo(() => [...new Set(allTiles.map(t => t.group || 'Other'))], [allTiles])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return allTiles.filter(t => (!group || (t.group || 'Other') === group) && (!s || `${t.name} ${t.type} ${t.description || ''}`.toLowerCase().includes(s)))
  }, [allTiles, q, group])
  const online = allTiles.filter(t => t.status === 'ok').length
  const checked = allTiles.filter(t => t.status).length

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>App library</h1><p className="muted">{allTiles.length} apps in your profile · {online}/{checked} checked apps online</p></div>
        <label className="searchbox"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter" /></label>
      </header>
      <div className="chips scroll">
        <button className={`chip btnchip ${!group ? 'on' : ''}`} onClick={() => setGroup('')}>All</button>
        {groups.map(g => <button key={g} className={`chip btnchip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      <div className="cards">
        {list.map(t => (
          <Glass key={t.key} className={`card ${hidden.has(t.key) ? 'dim' : ''}`} onClick={() => setSheet(t)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSheet(t) }}>
            <AppIcon t={t} size={56} />
            <div className="card-body">
              <div className="card-title">{t.name}{hidden.has(t.key) && <span className="chip tiny">hidden</span>}</div>
              <div className="card-sub">{t.description || t.url.replace(/^https?:\/\//, '')}</div>
              <div className="card-meta"><span className="chip">{t.group}</span>{t.version && <span className="chip mono">v{t.version.replace(/^v/, '').split('-')[0]}</span>}<Pill status={t.status} /></div>
            </div>
            <button className="btn small" onClick={e => { e.stopPropagation(); open(t) }}>Open</button>
          </Glass>
        ))}
        {list.length === 0 && <Glass className="empty">Nothing matches.</Glass>}
      </div>
    </div>
  )
}
