import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import type { Activity, Tile } from '../lib/types'
import { AppIcon } from '../components/AppIcon'
import { Modal, OverlayPresence, Spinner } from '../components/ui'
import { Check, Journal, Note, Phone, Plus, Refresh, Search, Task, Timer, X } from '../components/icons'
import { HomeDailyOverview } from './Today'
import { WidgetBoard } from '../components/widgets/WidgetBoard'
import { SpaceEditor } from '../components/experience/SpaceEditor'
import { spacesFor, spaceTiles, type Space } from '../lib/experience'
import { capture } from '../lib/daily-context'
import { usePersonal } from '../lib/personal-context'
import { greeting } from '../lib/format'
import { friendlyName, isDown } from '../lib/catalog'

export default function HomePage() {
  const { launcher, tiles, prefs, setPrefs, open, setSheet, editing, setEditing, reload, loading, launcherError, status, user, setPalette } = useApp()
  const { recent } = usePersonal()
  const [activityError, setActivityError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [editor, setEditor] = useState<Space | 'new' | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => api.get<Activity>(`${V1}/activity`).then(a => { if (alive) { setActivity(a); setActivityError(false) } }).catch(() => { if (alive) setActivityError(true) })
    load()
    const t = window.setInterval(load, 60000)
    return () => { alive = false; window.clearInterval(t) }
  }, [launcher?.box?.apps_up])

  if (!launcher) return <div className="center">{launcherError ? <div className="daily-error"><h2>Your box is taking a moment.</h2><p>We couldn’t load your apps. Check that the box is switched on, then try again.</p><button className="btn primary" onClick={reload}>Try again</button></div> : <Spinner />}</div>
  if (launcher.core === 'reconnect') return <Connect kind="reconnect" name={status?.oidc_name || 'Pocket Core'} />
  if (launcher.core === 'unconfigured') return <Connect kind="unconfigured" name="" />
  if (launcher.core === 'unreachable') return <Connect kind="unreachable" name="" error={launcher.error} onRetry={reload} />

  const spaces = spacesFor(prefs)
  const activeSpace = spaces.find(s => s.id === prefs.active_space)
  const selected = activeSpace ? spaceTiles(activeSpace, tiles) : tiles
  const LIMIT = 16
  const visible = showAll || editing || activeSpace ? selected : selected.slice(0, LIMIT)
  const groups = prefs.group && !activeSpace ? groupTiles(visible) : [['', visible] as [string, Tile[]]]
  const first = (user?.name || '').split(/\s/)[0]
  const visits = recent.map(v => tiles.find(t => t.key === v.key)).filter((t): t is Tile => !!t).slice(0, 5)

  return (
    <div className="home">
      {!prefs.welcome_done && <Welcome visited={recent.length > 0} />}

      <header className="hello">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <BoxStatus />
      </header>

      <button className="home-search" onClick={() => setPalette(true)}><Search size={22} /><span>What would you like to do? Try “photos” or “plan dinner”</span><kbd>⌘K</kbd></button>

      <section className="quick-actions" aria-label="Quick actions">
        <button className="quick-action qa-task" onClick={() => capture('task')}><span><Task /></span><span><strong>Add a task</strong><small>Something to do</small></span></button>
        <button className="quick-action qa-note" onClick={() => capture('note')}><span><Note /></span><span><strong>Write a note</strong><small>An idea or list</small></span></button>
        <button className="quick-action qa-moment" onClick={() => capture('moment')}><span><Journal /></span><span><strong>Save a memory</strong><small>For your journal</small></span></button>
        <button className="quick-action qa-focus" onClick={() => window.dispatchEvent(new Event('hub:focus'))}><span><Timer /></span><span><strong>Focus timer</strong><small>25 quiet minutes</small></span></button>
      </section>

      <section id="space-apps" className="home-apps" aria-label="Your apps">
        <div className="section-head">
          <div><h2>{activeSpace?.name || 'Your apps'}</h2><p>{activeSpace ? activeSpace.description : 'Tap an app to open it. Press and hold for options.'}</p></div>
          <div className="grid-tools">
            <button className="iconbtn" onClick={reload} aria-label="Refresh" title="Check apps again" disabled={loading}>{loading ? <Spinner /> : <Refresh />}</button>
            {editing ? <button className="btn small primary" onClick={() => setEditing(false)}><Check /> Done</button> : <button className="btn small" onClick={() => setEditing(true)}>Arrange</button>}
            <Link className="btn small ghost" to="/apps">All apps</Link>
          </div>
        </div>
        <div className="chips scroll" role="group" aria-label="Collections">
          <button className={`chip btnchip ${!activeSpace ? 'on' : ''}`} aria-pressed={!activeSpace} onClick={() => setPrefs({ active_space: 'all' })}>All</button>
          {spaces.map(s => <span key={s.id} className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
            <button className={`chip btnchip collection-chip ${prefs.active_space === s.id ? 'on' : ''}`} style={{ ['--c' as string]: s.color }} aria-pressed={prefs.active_space === s.id} onClick={() => setPrefs({ active_space: prefs.active_space === s.id ? 'all' : s.id })}><i />{s.name}</button>
            {s.apps && prefs.active_space === s.id && <button className="text-button" onClick={() => setEditor(s)} aria-label={`Edit ${s.name}`}>Edit</button>}
          </span>)}
          <button className="chip btnchip" onClick={() => setEditor('new')} aria-label="Create a collection"><Plus size={14} /> New collection</button>
        </div>
        {groups.map(([g, list]) => (
          <div key={g || 'all'} className="appsec">
            {g && <h3 className="sec-title">{g}<span className="sec-count">{list.length}</span></h3>}
            {list.length > 0 && <AppGrid list={list} all={tiles} editing={editing} open={open} setSheet={setSheet} onReorder={order => setPrefs({ order })} labels={prefs.labels !== false} />}
          </div>
        ))}
        {activeSpace && selected.length === 0 && <div className="home-daily-empty">No apps in this collection yet.{activeSpace.apps && <button className="btn small" onClick={() => setEditor(activeSpace)}>Choose apps</button>}</div>}
        {!activeSpace && selected.length > LIMIT && !editing && <button className="btn show-more" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${selected.length} apps`}</button>}
        {editing && <p className="fine-print">Drag apps to put them in your order. Tap an app to star it or hide it.</p>}
        {visits.length > 0 && !editing && <div className="recent-row" aria-label="Recently opened apps"><span className="eyebrow">Recently opened</span>{visits.map(t => <button key={t.key} className="recent-app" onClick={() => open(t)}><AppIcon t={t} size={24} />{friendlyName(t)}</button>)}</div>}
      </section>

      <HomeDailyOverview />
      <WidgetBoard activity={activity} activityError={activityError} />

      {tiles.length === 0 && <div className="home-daily-empty">There are no apps on your account yet. Ask the person who set up your Pocket Box to give you access.</div>}
      <footer className="home-footer"><span>Need a hand? <Link to="/help">Read the quick guide</Link>.</span><Link to="/settings">Change how Pocket Box looks</Link></footer>
      <OverlayPresence>{editor && <SpaceEditor space={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}</OverlayPresence>
    </div>
  )
}

// One sentence a non-technical person can act on.
function BoxStatus() {
  const { tiles, setSheet } = useApp()
  const navigate = useNavigate()
  const down = tiles.filter(isDown)
  const checked = tiles.filter(t => t.status).length
  if (down.length) return <button className="status-pill warn" onClick={() => down.length === 1 ? setSheet(down[0]) : navigate('/apps?problems=1')}><span className="dot" />{down.length === 1 ? `${friendlyName(down[0])} isn’t responding` : `${down.length} apps aren’t responding`}</button>
  if (!checked) return <span className="status-pill quiet"><span className="dot" />Your box is connected</span>
  return <span className="status-pill" role="status"><span className="dot" />Everything is running smoothly</span>
}

function Welcome({ visited }: { visited: boolean }) {
  const { prefs, setPrefs, launcher } = useApp()
  const [phone, setPhone] = useState(false)
  const steps = [
    { done: visited, title: 'Open your first app', help: 'Tap any app below.', to: '#space-apps' },
    { done: !!prefs.theme, title: 'Choose light or dark', help: 'And a colour you like.', to: '/settings' },
    { done: !!prefs.dock, title: 'Star your favorites', help: 'They stay in the sidebar.', to: '/apps' },
    { done: false, title: 'Add it to your phone', help: 'Works like a normal app.', phone: true },
  ]
  return <section className="welcome-card" aria-label="Getting started">
    <img src="/pocket-box.png" alt="" />
    <div>
      <h2>Welcome to {launcher?.box?.name || 'your Pocket Box'}</h2>
      <p>Everything you need lives here: your photos, notes, plans and more — private, at home, and yours.</p>
      <div className="welcome-steps">{steps.map(s => {
        const body = <><span className="step-mark"><Check /></span><span><strong>{s.title}</strong><small>{s.help}</small></span></>
        if (s.phone) return <button key={s.title} onClick={() => setPhone(true)}>{body}</button>
        if (s.to!.startsWith('#')) return <a key={s.title} href={s.to} className={s.done ? 'done' : ''}>{body}</a>
        return <Link key={s.title} to={s.to!} className={s.done ? 'done' : ''}>{body}</Link>
      })}</div>
    </div>
    <button className="iconbtn welcome-dismiss" onClick={() => setPrefs({ welcome_done: true })} aria-label="Hide the getting started guide" title="Hide"><X /></button>
    <OverlayPresence>{phone && <Modal title="Put Pocket Box on your phone" onClose={() => setPhone(false)}><PhoneSteps /></Modal>}</OverlayPresence>
  </section>
}

export function PhoneSteps() {
  return <div className="help-grid" style={{ gridTemplateColumns: '1fr' }}>
    <div className="help-card"><span><Phone /></span><div><h3>iPhone or iPad (Safari)</h3><ol><li>Open this page in Safari.</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol></div></div>
    <div className="help-card"><span><Phone /></span><div><h3>Android (Chrome)</h3><ol><li>Open this page in Chrome.</li><li>Tap the ⋮ menu.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol></div></div>
  </div>
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
          {labels && <span className="tile-name">{friendlyName(t)}</span>}
        </button>
      ))}
    </div>
  )
}

function Connect({ kind, name, error, onRetry }: { kind: 'reconnect' | 'unconfigured' | 'unreachable'; name: string; error?: string; onRetry?: () => void }) {
  void name; void error
  return (
    <div className="center">
      <div className="login">
        <img className="login-logo" src="/pocket-box.png" alt="" width={88} height={88} />
        {kind === 'reconnect' && <>
          <h1>Welcome back</h1>
          <p>Sign in once more to see your apps.</p>
          <a className="btn primary lg block" href={`${V1}/auth/oidc/start?next=/`}>Sign in</a>
        </>}
        {kind === 'unconfigured' && <>
          <h1>Almost ready</h1>
          <p>Your Pocket Box is still being set up. The person who set it up needs to finish connecting your apps.</p>
          <p className="core-hint">Your apps come from Pocket Core. Pocket Core connects your Pocket apps to each other and to your services: one sign-in for everyone, each person's own accounts, nothing to copy or paste. Set CORE_URL to connect this app. <a href="https://github.com/abjelosevic88/pocket-homelab-core" target="_blank" rel="noreferrer">Learn more</a></p>
        </>}
        {kind === 'unreachable' && <>
          <h1>Can’t reach your apps</h1>
          <p>Your box didn’t answer just now. This usually fixes itself within a minute.</p>
          <button className="btn primary lg block" onClick={onRetry}>Try again</button>
        </>}
      </div>
    </div>
  )
}
