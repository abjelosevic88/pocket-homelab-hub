import { Link } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import { figuresOf, useDaily } from '../../lib/daily-context'
import { appWidget, CONNECTED, widgetName, type HomeWidget } from '../../lib/widgets'
// Words for the four apps Hub has always shown; any other app speaks through its own line.
const empty: Record<string, string> = { tasks: 'No tasks to show here.', habits: 'No scheduled habits today.', kitchen: 'Nothing planned for today yet.', notes: 'Your notes will appear here.' }
// A widget fed by one of the person's apps: the four first-party kinds, and
// "app" for any app that says in its manifest it has a summary to show.
export function ConnectedWidget({ widget, configure }: { widget: HomeWidget; configure?: () => void }) {
  const { data, loading, error } = useDaily(), { allTiles, open } = useApp()
  const any = widget.kind === 'app'
  const mine = (key?: string) => allTiles.some(t => t.key === key)
  const chosen = any ? appWidget(data, widget.config.appKey) : undefined
  const source = data?.sources.find(s => (any ? s.app_key === chosen?.app_key : s.kind === CONNECTED[widget.kind]) && mine(s.app_key))
  const tile = allTiles.find(t => t.key === source?.app_key)
  const unavailable = error || source?.state === 'unavailable'
  const figures = source ? figuresOf(source) : []
  const rows = widget.size === 'large' ? 6 : widget.size === 'small' || (figures.length && source?.line) ? 1 : figures.length || source?.line ? 2 : 3
  const missing = loading && !data ? 'Gathering your day…' : unavailable ? 'This app couldn’t be refreshed.'
    : !any ? 'Connect this app to your account to see your own data here.'
    : !widget.config.appKey ? 'Pick one of your apps to see what it has for you.'
    : chosen && mine(chosen.app_key) ? 'Gathering what this app has for you…' : 'This app is no longer on your account, or it has nothing to show here any more.'
  return <><div className="w-heading"><div className="w-title">{widgetName(widget, data)}</div>{any ? tile && <button onClick={() => open(tile, source?.url)} aria-label={`Open ${tile.name}`} title={`Open ${tile.name}`}>↗</button> : <Link to="/today" aria-label="Open your day">↗</Link>}</div>
    {!source || unavailable ? <div className="w-empty"><span>✧</span><p>{missing}</p>{any && !source && !unavailable && configure && <button className="w-text-button" onClick={configure}>Choose an app ↗</button>}</div> : <>
      {source.line && <p className="w-live-line">{source.line}</p>}
      {figures.length > 0 && <div className="w-live-metrics">{figures.slice(0, widget.size === 'small' ? 1 : 2).map(m => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      <div className="w-live-items">{source.items.slice(0, rows).map((item, i) => <button key={`${item.id}-${i}`} onClick={() => tile && open(tile, item.url)}><span>{item.done ? '✓' : '·'}</span><span>{item.title}</span></button>)}</div>
      {!source.items.length && !source.line && <p className="w-live-empty">{empty[source.kind] || 'Nothing to show right now.'}</p>}
    </>}
    <span className="w-footnote">{source ? `${source.name} · ${source.kind === 'tasks' && source.message ? 'app time zone' : 'your account'}` : 'From your connected apps'}</span>
  </>
}
