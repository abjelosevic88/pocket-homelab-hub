import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import { usePersonal, timerLabel } from '../../lib/personal-context'
import { spacesFor, spaceTiles, intentHints, searchApps } from '../../lib/experience'
import { eventTitle, humanTopic, tileForTopic, timeAgo, uptime } from '../../lib/format'
import { daysUntil, validImageURL, widgetName, type HomeWidget, type WidgetConfig } from '../../lib/widgets'
import type { Activity, Tile } from '../../lib/types'
import { AppIcon } from '../AppIcon'

export type WidgetData = { now: Date; activity: Activity | null; activityError: boolean }
type Props = { widget: HomeWidget; data: WidgetData; configure: () => void; update: (config: Partial<WidgetConfig>) => void }

export function WidgetContent({ widget: w, data, configure, update }: Props) {
  const { tiles, allTiles, dockTiles, open, launcher, prefs, setSheet } = useApp()
  const { recent, clearRecent, focus, remaining, start, pause, resume } = usePersonal()
  const { now, activity, activityError } = data
  const small = w.size === 'small', large = w.size === 'large'
  const name = widgetName(w)
  const appButtons = (apps: Tile[], limit = small ? 4 : large ? 12 : 6) => apps.length ? <div className="w-apps">{apps.slice(0, limit).map(t => <button key={t.key} onClick={() => open(t)} title={t.name}><AppIcon t={t} size={38} /><span>{t.name.replace(/^Pocket /, '')}</span></button>)}</div> : <WidgetEmpty text="Your apps will appear here." />
  const title = <div className="w-title">{name}</div>
  switch (w.kind) {
    case 'clock': {
      let timezone = w.config.timezone || undefined
      try { new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(now) } catch { timezone = undefined }
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
      const h = Number(parts.find(p => p.type === 'hour')?.value || 0), m = Number(parts.find(p => p.type === 'minute')?.value || 0)
      const display = now.toLocaleTimeString(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: !prefs.clock24 })
      return <>{title}<div className={`w-clock ${w.config.clockStyle === 'analog' ? 'analog' : ''}`}>
        {w.config.clockStyle === 'analog' ? <div className="w-clock-face" role="img" aria-label={display}>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 30}deg)` }} />)}<span className="hand hour" style={{ transform: `rotate(${h * 30 + m / 2}deg)` }} /><span className="hand minute" style={{ transform: `rotate(${m * 6}deg)` }} /><b /></div> : <strong className="w-digital">{display}</strong>}
        <div><strong>{w.config.timezone?.split('/').pop()?.replaceAll('_', ' ') || 'Local time'}</strong><span>{now.toLocaleDateString(undefined, { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
      </div></>
    }
    case 'calendar': return <Calendar widget={w} now={now} />
    case 'focus': return <>{title}<div className="w-focus-copy"><span>{focus.active ? remaining === 0 ? 'A little progress, made.' : focus.endsAt ? 'One thing at a time.' : 'Take your time.' : 'Make a little room.'}</span><strong className="w-focus-time">{timerLabel(focus.active ? remaining : 1500)}</strong>{!small && <p>{focus.active ? 'Your focus session stays with you in this browser.' : 'A clear mind. A little momentum.'}</p>}</div><div className="w-actions"><button className="w-button" onClick={() => !focus.active || remaining === 0 ? start(25) : focus.endsAt ? pause() : resume()}>{!focus.active || remaining === 0 ? 'Start focus' : focus.endsAt ? 'Pause' : 'Continue'}</button><button className="w-text-button" onClick={() => window.dispatchEvent(new Event('hub:focus'))} aria-label="Enter your focus room">↗</button></div></>
    case 'favorites': return <>{title}{appButtons(dockTiles)}<span className="w-footnote">Pinned to your dock</span></>
    case 'recent': {
      const apps = recent.map(v => tiles.find(t => t.key === v.key)).filter((t): t is Tile => !!t)
      return <><div className="w-heading">{title}{apps.length > 0 && <button onClick={clearRecent} aria-label="Clear recently opened apps">×</button>}</div>{apps.length ? appButtons(apps) : <WidgetEmpty symbol="↺" text="Open an app and find it here next time." />}<span className="w-footnote">In this browser · just for you</span></>
    }
    case 'activity': {
      const events = (activity?.events || []).filter(e => !!tileForTopic(tiles, e.topic) && !e.topic.startsWith('core.')).slice(0, large ? 6 : 2)
      return <><div className="w-heading">{title}<Link to="/activity" aria-label="View all activity">↗</Link></div>{activityError || activity?.error ? <WidgetEmpty text="Activity couldn’t be refreshed. We’ll try again shortly." /> : events.length ? <div className="w-events">{events.map(e => { const t = tileForTopic(tiles, e.topic)!; return <button key={e.id} onClick={() => open(t)}><AppIcon t={t} size={28} /><span><strong>{eventTitle(e) || humanTopic(e.topic)}</strong><small>{t.name.replace(/^Pocket /, '')} · {timeAgo(e.created_at)}</small></span><span>↗</span></button> })}</div> : <WidgetEmpty symbol="✧" text={!activity ? 'Looking for recent moments…' : activity.scope === 'none' ? 'Activity hasn’t been connected for your account yet.' : 'A little quiet. New moments will appear here.'} />}<span className="w-footnote">{activity?.scope === 'box' ? 'Box activity · owner view' : 'From your connected apps'}</span></>
    }
    case 'space': {
      const space = spacesFor(prefs).find(s => s.id === (w.config.spaceId || 'focus'))
      return <><div className="w-heading">{title}<button onClick={configure} aria-label="Choose space">↗</button></div>{space ? <><strong className="w-space-name">{space.name}</strong>{appButtons(spaceTiles(space, tiles))}</> : <WidgetEmpty text="This space is no longer available." action="Choose a space" onClick={configure} />}</>
    }
    case 'shortcut': {
      const t = allTiles.find(t => t.key === w.config.appKey)
      return <>{title}{t ? <button className="w-shortcut" onClick={() => open(t)}><AppIcon t={t} size={small ? 52 : 64} /><span><strong>{t.name.replace(/^Pocket /, '')}</strong>{!small && <small>{t.description || 'Your app, one tap away.'}</small>}</span><span>↗</span></button> : <WidgetEmpty symbol="↗" text={w.config.appKey ? 'This app is no longer in your profile.' : 'Give a favorite app its own spot.'} action="Choose an app" onClick={configure} />}</>
    }
    case 'note': return <><div className="w-heading">{title}<button onClick={configure} aria-label={`Edit ${name}`}>✎</button></div>{w.config.note ? <button className="w-note-text" onClick={configure}>{w.config.note}</button> : <WidgetEmpty symbol="✎" text="A thought worth keeping close." action="Write a note" onClick={configure} />}<span className="w-footnote">Personal note · saved to your account</span></>
    case 'checklist': return <Checklist widget={w} update={update} configure={configure} />
    case 'countdown': {
      const days = daysUntil(w.config.targetDate || '', now)
      return <><div className="w-heading">{title}<button onClick={configure} aria-label={`Edit ${name}`}>↗</button></div>{days === null ? <WidgetEmpty symbol="◴" text="Something to look forward to." action="Set a date" onClick={configure} /> : <div className="w-countdown"><strong>{days === 0 ? 'Today' : Math.abs(days)}</strong><span>{days === 0 ? 'The day is here.' : days < 0 ? 'days since' : days === 1 ? 'day to go' : 'days to go'}</span><small>{new Date(w.config.targetDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</small></div>}</>
    }
    case 'photo': return <Photo widget={w} configure={configure} />
    case 'health': {
      const checked = allTiles.filter(t => t.status), up = checked.filter(t => t.status === 'ok'), down = checked.filter(t => t.status !== 'ok')
      return <>{title}<button className="w-health-summary" onClick={() => down[0] ? setSheet(down[0]) : setSheet(up[0] || allTiles[0] || null)} disabled={!allTiles.length}><strong>{checked.length ? `${up.length}/${checked.length}` : '—'}</strong><span>{checked.length ? 'checked apps online' : 'No health checks yet'}</span></button>{large && down.length > 0 && <div className="w-health-list">{down.slice(0, 5).map(t => <button key={t.key} onClick={() => setSheet(t)}><span className="dot down" />{t.name}</button>)}</div>}<span className="w-footnote">{allTiles.length - checked.length} apps not health-checked</span></>
    }
    case 'box': return <>{title}<strong className="w-box-name">{launcher?.box?.name || 'Pocket Box'}</strong><div className="w-box-details"><span><b>{allTiles.length}</b> apps in your profile</span><span>Core up {uptime(launcher?.box?.core_uptime_s) || '—'}</span>{!small && launcher?.box?.core_version && <span>Core {launcher.box.core_version}</span>}</div><span className="w-footnote">From your connected Box</span></>
    case 'discover': return <>{title}<strong className="w-discover-title">What sounds good?</strong><div className="w-intents">{intentHints(tiles).slice(0, large ? 5 : 3).map(hint => { const app = searchApps(tiles, hint)[0]; return <button key={hint} onClick={() => app && open(app)}>{hint}<span>↗</span></button> })}</div>{!tiles.length && <WidgetEmpty text="Your available apps will suggest things to do here." />}</>
  }
}

function WidgetEmpty({ symbol, text, action, onClick }: { symbol?: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="w-empty">{symbol && <span>{symbol}</span>}<p>{text}</p>{action && <button className="w-text-button" onClick={onClick}>{action} ↗</button>}</div>
}
function Calendar({ widget, now }: { widget: HomeWidget; now: Date }) {
  const [offset, setOffset] = useState(0)
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = date.getFullYear(), month = date.getMonth(), days = new Date(year, month + 1, 0).getDate(), leading = (date.getDay() + 6) % 7
  return <><div className="w-heading"><div className="w-title">{widget.config.title ? `${widget.config.title} · ` : ''}{date.toLocaleDateString(undefined, { month: 'long', year: widget.size === 'small' ? undefined : 'numeric' })}</div><div className="w-calendar-nav"><button onClick={() => setOffset(v => v - 1)} aria-label="Previous month">‹</button><button onClick={() => setOffset(0)} aria-label="Current month">•</button><button onClick={() => setOffset(v => v + 1)} aria-label="Next month">›</button></div></div><div className="w-calendar" aria-label={date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <small key={i}>{d}</small>)}{Array.from({ length: leading }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => <span key={i} className={year === now.getFullYear() && month === now.getMonth() && i + 1 === now.getDate() ? 'today' : ''} aria-current={year === now.getFullYear() && month === now.getMonth() && i + 1 === now.getDate() ? 'date' : undefined}>{i + 1}</span>)}</div>{widget.size === 'large' && <div className="w-footnote">A view of the dates · no appointments connected</div>}</>
}
function Checklist({ widget: w, update, configure }: Pick<Props, 'widget' | 'update' | 'configure'>) {
  const [text, setText] = useState('')
  const items = w.config.items || [], limit = w.size === 'small' ? 2 : w.size === 'large' ? 8 : 3
  const add = () => { if (!text.trim() || items.length >= 12) return; update({ items: [...items, { id: crypto.randomUUID(), text: text.trim(), done: false }] }); setText('') }
  return <><div className="w-heading"><div className="w-title">{widgetName(w)}</div><button onClick={configure} aria-label={`Edit ${widgetName(w)}`}>✎</button></div><div className="w-check-items">{items.slice(0, limit).map(item => <label key={item.id} className={item.done ? 'complete' : ''}><input type="checkbox" checked={item.done} onChange={() => update({ items: items.map(i => i.id === item.id ? { ...i, done: !i.done } : i) })} /><span>{item.text}</span></label>)}{items.length === 0 && <span className="w-check-placeholder">One small thing at a time.</span>}</div>{items.length < 12 && <form className="w-check-add" onSubmit={e => { e.preventDefault(); add() }}><input aria-label={`Add item to ${widgetName(w)}`} value={text} onChange={e => setText(e.target.value)} maxLength={100} placeholder="Add a little task…" /><button disabled={!text.trim()} aria-label="Add checklist item">＋</button></form>}<button className="w-footnote" onClick={configure}>{items.filter(i => i.done).length} of {items.length} complete{items.length > limit ? ` · ${items.length - limit} more` : ''}</button></>
}
function Photo({ widget: w, configure }: Pick<Props, 'widget' | 'configure'>) {
  const [failed, setFailed] = useState('')
  const src = w.config.photoUrl || ''
  const ready = validImageURL(src) && failed !== src
  return <>{ready ? <img className="w-photo-image" src={src} alt={w.config.title || 'Your photo'} referrerPolicy="no-referrer" onError={() => setFailed(src)} /> : <div className="w-photo-landscape" aria-hidden="true"><span /><i /></div>}<div className="w-photo-caption"><span className="w-title">{widgetName(w)}</span><button className="w-text-button" onClick={configure}>{ready ? 'Change photo' : src ? 'Image unavailable · change photo' : 'Add your own photo'} ↗</button></div></>
}
