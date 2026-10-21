import { useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { dayLabel, eventTitle, eventURL, humanTopic, timeAgo, tileForTopic } from '../lib/format'
import type { Activity } from '../lib/types'
import { AppIcon } from '../components/AppIcon'
import { Glass, Spinner } from '../components/ui'
import { External, Refresh } from '../components/icons'

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
        <div><h1>Activity</h1><p className="muted">{a?.scope === 'box' ? 'Everything on the bus that concerns you or the household.' : a?.scope === 'mine' ? 'Your own doings in the Pocket apps that share them with the hub.' : 'Nothing to show yet.'}</p></div>
        <button className="btn small ghost sq" onClick={load} title="Refresh">{busy ? <Spinner /> : <Refresh />}</button>
      </header>
      {a?.error && <Glass className="callout">{a.error}</Glass>}
      {!a && <div className="center"><Spinner /></div>}
      {a && a.events.length === 0 && <Glass className="empty">Quiet. When apps publish something about you, it lands here.</Glass>}
      {days.map(([d, list]) => (
        <section key={d} className="day">
          <h2 className="sec-title">{d}</h2>
          <Glass className="feed">
            {list.map(e => {
              const t = tileForTopic(tiles, e.topic)
              const url = eventURL(e)
              return (
                <div key={e.id} className="ev">
                  {t ? <AppIcon t={t} size={34} /> : <span className="ico letter" style={{ width: 34, height: 34, fontSize: 14 }}>{e.topic.charAt(0).toUpperCase()}</span>}
                  <div className="ev-body">
                    <div className="ev-line"><span className="ev-app">{t ? t.name.replace(/^Pocket /, '') : e.topic.split('.')[0]}</span><span className="ev-topic">{humanTopic(e.topic)}</span></div>
                    {eventTitle(e) && <div className="ev-title">{eventTitle(e)}</div>}
                  </div>
                  <div className="ev-side"><span className="ev-time">{timeAgo(e.created_at)}</span>{url && <a className="iconbtn" href={url} target="_blank" rel="noreferrer" title="Open"><External /></a>}</div>
                </div>
              )
            })}
          </Glass>
        </section>
      ))}
    </div>
  )
}
