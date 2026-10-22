import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { dayLabel, eventTitle, eventURL, humanTopic, timeAgo, tileForTopic } from '../lib/format'
import type { Activity } from '../lib/types'
import { AppIcon } from '../components/AppIcon'
import { Spinner } from '../components/ui'
import { External, Refresh } from '../components/icons'
import { friendlyName } from '../lib/catalog'

export default function ActivityPage() {
  const { tiles } = useApp()
  const [a, setA] = useState<Activity | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { setBusy(true); try { setA(await api.get<Activity>(`${V1}/activity`)) } catch { /* shown as empty */ } finally { setBusy(false) } }
  useEffect(() => { load(); const t = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000); return () => window.clearInterval(t) }, [])

  const days: [string, Activity['events']][] = []
  for (const e of a?.events || []) {
    const d = dayLabel(e.created_at)
    const last = days[days.length - 1]
    if (last && last[0] === d) last[1].push(e); else days.push([d, [e]])
  }
  return (
    <div className="page narrow">
      <header className="page-head">
        <div><h1>Activity</h1><p>{a?.scope === 'box' ? 'What has happened across your Pocket Box lately.' : 'What you have done in your apps lately.'}</p></div>
        <button className="btn small" onClick={load} title="Refresh">{busy ? <Spinner /> : <Refresh />} Refresh</button>
      </header>
      {a?.error && <div className="callout">Some activity couldn’t be loaded right now.</div>}
      {!a && <div className="center"><Spinner /></div>}
      {a && a.events.length === 0 && <div className="empty card-surface"><h3>No activity yet</h3><p className="muted" style={{ marginTop: 6 }}>As you add tasks, notes, recipes and more, they’ll show up here.</p></div>}
      {days.map(([d, list]) => (
        <section key={d} className="day">
          <h2 className="sec-title">{d}</h2>
          <div className="feed card-surface">
            {list.map(e => {
              const t = tileForTopic(tiles, e.topic)
              const url = eventURL(e)
              return (
                <div key={e.id} className="ev">
                  {t ? <AppIcon t={t} size={36} /> : <span className="ico letter" style={{ width: 36, height: 36, fontSize: 15, background: 'var(--surface-3)', color: 'var(--text-2)' }}>{e.topic.charAt(0).toUpperCase()}</span>}
                  <div className="ev-body">
                    <div className="ev-line"><span className="ev-app">{t ? friendlyName(t) : e.topic.split('.')[0]}</span><span>{humanTopic(e.topic)}</span></div>
                    {eventTitle(e) && <div className="ev-title">{eventTitle(e)}</div>}
                  </div>
                  <div className="ev-side"><span className="ev-time">{timeAgo(e.created_at)}</span>{url && <a className="iconbtn" href={url} target="_blank" rel="noreferrer" title="Open" aria-label="Open"><External /></a>}</div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
