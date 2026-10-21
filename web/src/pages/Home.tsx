import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { eventTitle, humanTopic, timeAgo, tileForTopic, uptime } from '../lib/format'
import type { Activity, Tile } from '../lib/types'
import { AppIcon } from '../components/AppIcon'
import { Glass, Spinner } from '../components/ui'
import { Check, Refresh } from '../components/icons'

export default function HomePage() {
  const { launcher, tiles, prefs, setPrefs, open, setSheet, editing, setEditing, reload, loading, status } = useApp()
  const [activity, setActivity] = useState<Activity | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.get<Activity>(`${V1}/activity`).then(a => { if (alive) setActivity(a) }).catch(() => {})
    load()
    const t = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(t) }
  }, [launcher?.box?.apps_up])

  if (!launcher) return <div className="center"><Spinner /></div>
  if (launcher.core === 'reconnect') return <Connect kind="reconnect" name={status?.oidc_name || 'Pocket Core'} />
  if (launcher.core === 'unconfigured') return <Connect kind="unconfigured" name="" />
  if (launcher.core === 'unreachable') return <Connect kind="unreachable" name="" error={launcher.error} onRetry={reload} />

  const box = launcher.box
  const groups = prefs.group ? groupTiles(tiles) : [['', tiles] as [string, Tile[]]]
  const recent = (activity?.events || []).slice(0, 4)

  return (
    <div className="home">
      <section className="widgets">
        <Glass className="widget">
          <div className="widget-label">Apps</div>
          <div className="widget-big">{box?.apps_up ?? 0}<span className="widget-sub"> / {box?.apps_checked ?? 0} online</span></div>
          <div className="ring" style={{ ['--pct' as string]: box && box.apps_checked ? (box.apps_up / box.apps_checked) * 100 : 0 }}><span /></div>
          <div className="widget-foot">{tiles.length} on your home screen</div>
        </Glass>
        <Glass className="widget">
          <div className="widget-label">Box</div>
          <div className="widget-big trunc">{box?.name}</div>
          <div className="widget-foot">Core {box?.core_version ? 'v' + box.core_version.replace(/^v/, '').split('-')[0] : ''} · up {uptime(box?.core_uptime_s)}</div>
          {box?.counts && <div className="widget-foot faint">{box.counts.users} people · {box.counts.devices} devices · {box.counts.events} events</div>}
        </Glass>
        <Glass className="widget wide">
          <div className="widget-label"><Link to="/activity">Activity</Link></div>
          {recent.length === 0 && <div className="widget-foot">{activity?.scope === 'none' ? 'Nothing to show yet.' : 'Quiet so far.'}</div>}
          {recent.map(e => {
            const t = tileForTopic(tiles, e.topic)
            return <div key={e.id} className="ev tiny">{t ? <AppIcon t={t} size={18} /> : <span className="ico letter tiny" />}<span className="ev-topic">{t ? t.name.replace(/^Pocket /, '') : e.topic.split('.')[0]}</span><span className="ev-title">{humanTopic(e.topic)}{eventTitle(e) ? ` · ${eventTitle(e)}` : ''}</span><span className="ev-time">{timeAgo(e.created_at)}</span></div>
          })}
        </Glass>
      </section>

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
          onClick={() => (editing ? setSheet(t) : open(t))}
          onContextMenu={e => { e.preventDefault(); setSheet(t) }}
          onPointerDown={() => { pressTimer.current = window.setTimeout(() => setSheet(t), 550) }}
          onPointerUp={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }}
          onPointerLeave={() => { if (pressTimer.current) window.clearTimeout(pressTimer.current) }}
          title={t.name}
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
          <h2>Connect to {name}</h2>
          <p>The hub shows the apps in <em>your</em> profile, read from Pocket Core as you. Sign in with Pocket Core once and the home screen fills in.</p>
          <a className="btn primary lg" href={`${V1}/auth/oidc/start?next=/`}>Sign in with {name}</a>
        </>}
        {kind === 'unconfigured' && <>
          <h2>No Pocket Core yet</h2>
          <p>Point the hub at your Core with <code>CORE_URL</code> and <code>CORE_REGISTRATION_KEY</code>, then restart it. Every app registered there appears here.</p>
        </>}
        {kind === 'unreachable' && <>
          <h2>Pocket Core is not answering</h2>
          <p className="mono small">{error}</p>
          <button className="btn primary" onClick={onRetry}>Try again</button>
        </>}
      </Glass>
    </div>
  )
}
