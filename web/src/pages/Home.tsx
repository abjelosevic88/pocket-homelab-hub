import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import type { Activity, Tile } from '../lib/types'
import { AppIcon } from '../components/AppIcon'
import { Glass, Spinner } from '../components/ui'
import { Check, Refresh } from '../components/icons'
import { HomeExperience } from '../components/experience/HomeExperience'
import { WidgetBoard } from '../components/widgets/WidgetBoard'
import { spacesFor, spaceTiles } from '../lib/experience'

export default function HomePage() {
  const { launcher, tiles, prefs, setPrefs, open, setSheet, editing, setEditing, reload, loading, launcherError, status } = useApp()
  const [activityError, setActivityError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [activity, setActivity] = useState<Activity | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.get<Activity>(`${V1}/activity`).then(a => { if (alive) { setActivity(a); setActivityError(false) } }).catch(() => { if (alive) setActivityError(true) })
    load()
    const t = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(t) }
  }, [launcher?.box?.apps_up])

  if (!launcher) return <div className="center">{launcherError ? <Glass className="connect"><h2>Your box is taking a moment.</h2><p>We couldn’t load your apps. Try connecting again.</p><button className="btn" onClick={reload}>Try again</button></Glass> : <Spinner />}</div>
  if (launcher.core === 'reconnect') return <Connect kind="reconnect" name={status?.oidc_name || 'Pocket Core'} />
  if (launcher.core === 'unconfigured') return <Connect kind="unconfigured" name="" />
  if (launcher.core === 'unreachable') return <Connect kind="unreachable" name="" error={launcher.error} onRetry={reload} />

  const activeSpace = spacesFor(prefs).find(s => s.id === prefs.active_space)
  const selected = activeSpace ? spaceTiles(activeSpace, tiles) : tiles
  const visible = showAll || editing || activeSpace ? selected : selected.slice(0, 12)
  const groups = prefs.group ? groupTiles(visible) : [['', visible] as [string, Tile[]]]

  return (
    <div className="home">
      <HomeExperience><WidgetBoard activity={activity} activityError={activityError} /></HomeExperience>
      {prefs.home_show_apps !== false && <section id="space-apps" className="home-apps">
      <div className="section-heading"><div><div className="eyebrow">YOUR EVERYDAY, ONE TAP AWAY</div><h2>{activeSpace?.name || 'All your possibilities.'}<span className="heading-count">{selected.length}</span></h2></div><div className="row">{activeSpace && <button className="text-button" onClick={() => setPrefs({ active_space: 'all' })}>All apps</button>}<Link className="text-button" to="/apps">App library ↗</Link></div></div>
      <div className="grid-tools">
        {editing ? <button className="btn small on" onClick={() => setEditing(false)}><Check /> Done</button> : <button className="btn small ghost" onClick={() => setEditing(true)}>Edit layout</button>}
        <button className="btn small ghost sq" onClick={reload} title="Refresh"><Refresh /></button>
        {loading && <Spinner />}
      </div>

      {groups.map(([g, list]) => (
        <section key={g || 'all'} className="appsec">
          {g && <h2 className="sec-title">{g}<span className="sec-count">{list.length}</span></h2>}
          <AppGrid list={list} all={tiles} editing={editing} open={open} setSheet={setSheet} onReorder={order => setPrefs({ order })} labels={prefs.labels !== false} />
        </section>
      ))}
      {activeSpace && selected.length === 0 && <div className="empty">No apps in this space yet. Try another space or create your own.</div>}
      {!activeSpace && selected.length > 12 && !editing && <button className="show-more" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show a little less ↑' : `Explore all ${selected.length} apps ↓`}</button>}
      </section>}
      <footer className="home-footer"><span className="brand-mark">p.</span><span>A little box. A world of possibilities.</span><Link to="/settings">Make it yours ↗</Link></footer>
      {tiles.length === 0 && <Glass className="empty">No apps in your profile yet. Ask the box owner to add you to some services in Pocket Core.</Glass>}
    </div>
  )
}

function groupTiles(tiles: Tile[]): [string, Tile[]][] {
  const m = new Map<string, Tile[]>()
  for (const t of tiles) m.set(t.group || 'Other', [...(m.get(t.group || 'Other') || []), t])
  return [...m.entries()]
}

function AppGrid({ list, all, editing, open, setSheet, onReorder, labels }: { list: Tile[]; all: Tile[]; editing: boolean; open: (t: Tile) => void; setSheet: (t: Tile) => void; onReorder: (keys: string[]) => void; labels: boolean }) {
  const dragKey = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  useEffect(() => () => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }, [])
  const keys = useMemo(() => all.map(t => t.key), [all])

  const drop = (target: string) => {
    const from = dragKey.current
    dragKey.current = null; setOver(null)
    if (!from || from === target) return
    const next = keys.filter(k => k !== from)
    next.splice(next.indexOf(target), 0, from)
    onReorder(next)
  }
  return (
    <div className="appgrid">
      {list.map(t => (
        <button
          key={t.key}
          className={`tile ${over === t.key ? 'over' : ''}`}
          draggable={editing}
          onDragStart={e => { dragKey.current = t.key; e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={e => { if (editing) { e.preventDefault(); setOver(t.key) } }}
          onDragLeave={() => setOver(o => (o === t.key ? null : o))}
          onDrop={e => { e.preventDefault(); drop(t.key) }}
          onClick={() => { if (!longPressed.current) { if (editing) setSheet(t); else open(t) } longPressed.current = false }}
          onContextMenu={e => { e.preventDefault(); setSheet(t) }}
          onPointerDown={() => { longPressed.current = false; pressTimer.current = window.setTimeout(() => { longPressed.current = true; setSheet(t) }, 550) }}
          onPointerCancel={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }}
          onPointerUp={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }}
          onPointerLeave={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }}
          title={t.name}
          aria-label={t.name}
        >
          <span className="tile-ico">
            <AppIcon t={t} />
            {t.status && <span className={`status ${t.status === 'ok' ? 'ok' : 'down'}`} />}
          </span>
          {labels && <span className="tile-name">{t.name.replace(/^Pocket /, '')}</span>}
        </button>
      ))}
    </div>
  )
}

function Connect({ kind, name, error, onRetry }: { kind: 'reconnect' | 'unconfigured' | 'unreachable'; name: string; error?: string; onRetry?: () => void }) {
  return (
    <div className="center">
      <Glass className="connect">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        {kind === 'reconnect' && <>
          <h2>Welcome to your Pocket Box</h2>
          <p>Sign in to bring your apps and personal spaces together.</p>
          <a className="btn primary lg" href={`${V1}/auth/oidc/start?next=/`}>Continue to your account</a>
        </>}
        {kind === 'unconfigured' && <>
          <h2>Your box is still being prepared</h2>
          <p>The person who set up your Pocket Box needs to finish connecting your apps.</p>
        </>}
        {kind === 'unreachable' && <>
          <h2>Your box is having trouble connecting</h2>
          <p>Your apps couldn’t be loaded right now. Please try again in a moment.</p>
          <button className="btn primary" onClick={onRetry}>Try again</button>
        </>}
      </Glass>
    </div>
  )
}
