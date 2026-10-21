import { Link } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { useDaily, capture, type DailySource } from '../lib/daily-context'
import { AppIcon } from '../components/AppIcon'

export const dailyNames: Record<string, string> = { tasks: 'Make room for what matters.', habits: 'Small things, adding up.', kitchen: 'Something good on the table.', notes: 'Pick up a thought.' }
export const dailyEmpty: Record<string, string> = { tasks: 'No tasks to show here. Open Tasks for your complete lists.', habits: 'No habits scheduled for this day.', kitchen: 'No meals planned for this day yet.', notes: 'Your recent notes will appear here.' }
function readableDetail(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return value
  const date = new Date(value.includes('T') ? value : value + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (value.includes('T') ? ` · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '')
}
export function DailyCard({ source }: { source: DailySource }) {
  const { allTiles, open } = useApp()
  const tile = allTiles.find(t => t.key === source.app_key)
  if (!tile) return null
  return <article className={`daily-card daily-${source.kind}`} aria-label={`${source.name} summary`}>
    <div className="daily-card-heading"><div><AppIcon t={tile} size={32} /><span>{source.name}</span></div><button className="text-button" onClick={() => open(tile)}>Open app ↗</button></div>
    <h2>{dailyNames[source.kind]}</h2>
    {source.state !== 'ready' ? <p className="daily-source-error">{source.message || 'This app couldn’t be refreshed.'}</p> : <>
      {source.metrics.length > 0 && <div className="daily-metrics">{source.metrics.map(m => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      <div className="daily-items">{source.items.map(item => <button key={item.id} onClick={() => open(tile)}><span className={`daily-item-mark ${item.done ? 'done' : ''}`}>{item.done ? '✓' : source.kind === 'notes' ? '✎' : '○'}</span><span><strong>{item.title}</strong>{item.detail && <small>{readableDetail(item.detail)}</small>}</span><span>↗</span></button>)}</div>
      {!source.items.length && <p className="daily-empty">{dailyEmpty[source.kind]}</p>}
      {source.message && <p className="daily-footnote">{source.message}</p>}
    </>}
  </article>
}
export default function TodayPage() {
  const { data, loading, error, refresh } = useDaily()
  const { allTiles } = useApp()
  const sources = (data?.sources || []).filter(s => allTiles.some(t => t.key === s.app_key))
  return <div className="today-page"><header className="today-heading"><div><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>Your day.<br /><em>A little lighter.</em></h1><p>The things that matter, brought together from your apps.</p></div><button className="btn" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh today'}</button></header>
    <section className="daily-capture-strip" aria-label="Quick actions"><span>Get it off your mind.</span><button onClick={() => capture('task')}>＋ Add a task</button><button onClick={() => capture('note')}>✎ Capture a note</button><button onClick={() => capture('moment')}>✧ Keep a moment</button></section>
    {error ? <div className="daily-error" role="alert"><h2>Your day is taking a moment.</h2><p>We couldn’t refresh your apps. Their contents are still available inside each app.</p><button className="btn" onClick={refresh}>Try again</button></div> : loading && !data ? <p role="status">Gathering your day…</p> : <div className="daily-grid">{sources.map(s => <DailyCard key={s.app_key} source={s} />)}</div>}
    {!error && data && !sources.length && <div className="daily-error"><h2>A little room to grow.</h2><p>Tasks, Habits, Kitchen and Notes will bring your day here when they’re connected to your profile.</p><Link className="btn" to="/apps">Explore your apps</Link></div>}
    {data && <p className="daily-refresh-note">Refreshed {new Date(data.refreshed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · Personal to your account · Updates while this window is active</p>}
  </div>
}
