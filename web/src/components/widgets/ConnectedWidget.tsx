import { Link } from 'react-router-dom'
import { figuresOf, useDaily, useDailyApps } from '../../lib/daily-context'
import { appWidget, CONNECTED, widgetName, type HomeWidget } from '../../lib/widgets'
// Words for the four apps Hub has always shown; any other app speaks through its own line.
const empty: Record<string, string> = { tasks: 'No tasks to show here.', habits: 'No scheduled habits today.', kitchen: 'Nothing planned for today yet.', notes: 'Your notes will appear here.' }
// A widget fed by one of the person's apps: the four first-party kinds, and
// "app" for any app that has a summary to show (read through Pocket Core).
export function ConnectedWidget({ widget, configure }: { widget: HomeWidget; configure?: () => void }) {
  const { data, loading, error } = useDaily(), { tileOf, openApp } = useDailyApps()
  const any = widget.kind === 'app'
  // The app the person picked: asked this time, waiting its turn, or switched off in Pocket Core.
  const chosen = any ? appWidget(data, widget.config.appKey) : undefined
  const source = data?.sources.find(s => (any ? s.app_key === chosen?.app_key : s.kind === CONNECTED[widget.kind]) && tileOf(s))
  const tile = tileOf(source)
  const unavailable = error || source?.state === 'unavailable'
  const figures = source ? figuresOf(source) : []
  const rows = widget.size === 'large' ? 6 : widget.size === 'small' || (figures.length && source?.line) ? 1 : figures.length || source?.line ? 2 : 3
  const off = chosen && 'off' in chosen && tileOf(chosen) ? chosen.off : undefined
  const missing = loading && !data ? 'Gathering your day…' : unavailable ? source?.message || 'This app couldn’t be refreshed.'
    : !any ? 'Connect this app to your account to see your own data here.'
    : !widget.config.appKey ? 'Pick one of your apps to see what it has for you.'
    : off ? off
    : chosen && tileOf(chosen) ? 'Gathering what this app has for you…' : 'This app is no longer on your account, or it has nothing to show here any more.'
  return <><div className="w-heading"><div className="w-title">{widgetName(widget, data)}</div>{any ? tile && <button onClick={() => openApp(source, source?.url)} aria-label={`Open ${tile.name}`} title={`Open ${tile.name}`}>↗</button> : <Link to="/today" aria-label="Open your day">↗</Link>}</div>
    {!source || unavailable ? <div className="w-empty"><span>✧</span><p>{missing}</p>{any && !source && !unavailable && !off && configure && <button className="w-text-button" onClick={configure}>Choose an app ↗</button>}</div> : <>
      {source.line && <p className="w-live-line">{source.line}</p>}
      {figures.length > 0 && <div className="w-live-metrics">{figures.slice(0, widget.size === 'small' ? 1 : 2).map(m => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      <div className="w-live-items">{source.items.slice(0, rows).map((item, i) => <button key={`${item.id}-${i}`} onClick={() => openApp(source, item.url)}><span>{item.done ? '✓' : '·'}</span><span>{item.title}</span></button>)}</div>
      {!source.items.length && !source.line && <p className="w-live-empty">{empty[source.kind] || 'Nothing to show right now.'}</p>}
    </>}
    <span className="w-footnote">{source ? `${source.name} · ${source.kind === 'tasks' ? 'app time zone' : 'your account'}` : 'From your connected apps'}</span>
  </>
}
