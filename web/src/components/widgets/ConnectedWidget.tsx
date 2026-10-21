import { Link } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import { useDaily } from '../../lib/daily-context'
import { widgetName, type HomeWidget } from '../../lib/widgets'
const kinds: Record<string, string> = { 'tasks-today': 'tasks', 'habit-progress': 'habits', 'meal-plan': 'kitchen', 'recent-notes': 'notes' }
const empty: Record<string, string> = { tasks: 'No tasks to show here.', habits: 'No scheduled habits today.', kitchen: 'Nothing planned for today yet.', notes: 'Your notes will appear here.' }
export function ConnectedWidget({ widget }: { widget: HomeWidget }) {
  const { data, loading, error } = useDaily(), { allTiles, open } = useApp()
  const source = data?.sources.find(s => s.kind === kinds[widget.kind] && allTiles.some(t => t.key === s.app_key))
  const tile = allTiles.find(t => t.key === source?.app_key)
  const unavailable = error || source?.state === 'unavailable'
  return <><div className="w-heading"><div className="w-title">{widgetName(widget)}</div><Link to="/today" aria-label="Open your day">↗</Link></div>
    {!source || unavailable ? <div className="w-empty"><span>✧</span><p>{loading && !data ? 'Gathering your day…' : unavailable ? 'This app couldn’t be refreshed.' : 'Connect this app to your profile to see your own data here.'}</p></div> : <>
      {source.metrics.length > 0 && <div className="w-live-metrics">{source.metrics.slice(0, widget.size === 'small' ? 1 : 2).map(m => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      <div className="w-live-items">{source.items.slice(0, widget.size === 'large' ? 6 : widget.size === 'small' ? 1 : source.metrics.length ? 2 : 3).map(item => <button key={item.id} onClick={() => tile && open(tile)}><span>{item.done ? '✓' : '·'}</span><span>{item.title}</span></button>)}</div>
      {!source.items.length && <p className="w-live-empty">{empty[source.kind]}</p>}
    </>}
    <span className="w-footnote">{source ? `${source.name} · ${source.kind === 'tasks' ? 'app time zone' : 'your account'}` : 'From your connected apps'}</span>
  </>
}
