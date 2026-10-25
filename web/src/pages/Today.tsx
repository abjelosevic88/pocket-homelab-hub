import { Link } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { useDaily, capture, type DailySource } from '../lib/daily-context'
import { AppIcon } from '../components/AppIcon'
import { Journal, Note, Refresh, Task } from '../components/icons'

export const dailyNames: Record<string, string> = { tasks: 'To do', habits: 'Habits', kitchen: 'Meals', notes: 'Recent notes' }
export const dailyEmpty: Record<string, string> = { tasks: 'Nothing due today. Nice!', habits: 'No habits scheduled for today.', kitchen: 'No meals planned for today yet.', notes: 'Your recent notes will show up here.' }
function readableDetail(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return value
  const date = new Date(value.includes('T') ? value : value + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (value.includes('T') ? ` · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '')
}
export function DailyCard({ source, compact = false }: { source: DailySource; compact?: boolean }) {
  const { allTiles, open } = useApp()
  const tile = allTiles.find(t => t.key === source.app_key)
  if (!tile) return null
  return <article className={`daily-card daily-${source.kind} ${compact ? 'daily-compact' : ''}`} aria-label={`${source.name} summary`}>
    <div className="daily-card-heading"><div><AppIcon t={tile} size={30} /><span>{dailyNames[source.kind] || source.name}</span></div><button className="text-button" onClick={() => open(tile)}>Open</button></div>
    {source.state !== 'ready' ? <p className="daily-source-error">{source.message || 'This app couldn’t be refreshed just now.'}</p> : <>
      {source.metrics.length > 0 && <div className="daily-metrics">{source.metrics.map(m => <div key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      <div className="daily-items">{(compact ? source.items.slice(0, 3) : source.items).map(item => <button key={item.id} onClick={() => open(tile)}><span className={`daily-item-mark ${item.done ? 'done' : ''}`}>{item.done ? '✓' : ''}</span><span><strong>{item.title}</strong>{item.detail && <small>{readableDetail(item.detail)}</small>}</span><span>›</span></button>)}</div>
      {!source.items.length && <p className="daily-empty">{dailyEmpty[source.kind]}</p>}
      {!compact && source.message && <p className="daily-footnote">{source.message}</p>}
    </>}
  </article>
}
export default function TodayPage() {
  const { data, loading, error, refresh } = useDaily()
  const { allTiles } = useApp()
  const sources = (data?.sources || []).filter(s => allTiles.some(t => t.key === s.app_key))
  return <div className="today-page">
    <header className="today-heading"><div><h1>Today</h1><p>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · your tasks, habits, meals and notes in one place.</p></div><button className="btn" onClick={refresh} disabled={loading}><Refresh /> {loading ? 'Refreshing…' : 'Refresh'}</button></header>
    <section className="quick-actions" aria-label="Quick actions">
      <button className="quick-action qa-task" onClick={() => capture('task')}><span><Task /></span><strong>Add a task</strong></button>
      <button className="quick-action qa-note" onClick={() => capture('note')}><span><Note /></span><strong>Write a note</strong></button>
      <button className="quick-action qa-moment" onClick={() => capture('moment')}><span><Journal /></span><strong>Save a memory</strong></button>
    </section>
    {error ? <div className="daily-error" role="alert"><h2>Today couldn’t be loaded.</h2><p>Your apps still have everything — open them directly, or try again in a moment.</p><button className="btn" onClick={refresh}>Try again</button></div> : loading && !data ? <p role="status" className="muted">Gathering your day…</p> : <div className="daily-grid">{sources.map(s => <DailyCard key={s.app_key} source={s} />)}</div>}
    {!error && data && !sources.length && <div className="daily-error"><h2>Nothing to show yet</h2><p>When you use Tasks, Habits, Kitchen or Notes, today’s items appear here automatically.</p><Link className="btn" to="/apps">Browse apps</Link></div>}
    {data && <p className="daily-refresh-note">Updated {new Date(data.refreshed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · Only you can see this</p>}
  </div>
}

export function HomeDailyOverview() {
  const { data, loading, error, refresh } = useDaily()
  const { allTiles, reload } = useApp()
  const sources = (data?.sources || []).filter(s => allTiles.some(t => t.key === s.app_key))
  if (!error && data && !sources.length) return null
  return <section className="home-daily" aria-label="Your day at a glance">
    <div className="section-head"><div><h2>Today</h2><p>What’s on for today, from your apps.</p></div><div className="row"><button className="iconbtn" aria-label="Refresh today" title="Refresh" disabled={loading} onClick={() => { void refresh(); void reload() }}><Refresh /></button><Link className="btn small ghost" to="/today">See all</Link></div></div>
    {error ? <div className="home-daily-empty" role="alert"><p>Today couldn’t be loaded. Your apps still work as normal.</p><button className="btn small" onClick={refresh}>Try again</button></div> : loading && !data ? <p role="status" className="muted">Gathering your day…</p> : <div className="home-daily-grid">{sources.map(source => <DailyCard key={source.app_key} source={source} compact />)}</div>}
  </section>
}
