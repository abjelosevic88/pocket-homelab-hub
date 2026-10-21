import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../lib/app-context'
import { usePersonal } from '../../lib/personal-context'
import { spacesFor, spaceTiles, type Space } from '../../lib/experience'
import { greeting, timeAgo, eventTitle, humanTopic, tileForTopic } from '../../lib/format'
import type { Activity } from '../../lib/types'
import { AppIcon } from '../AppIcon'
import { Search } from '../icons'
import { Orbit } from './Orbit'
import { SpaceEditor } from './SpaceEditor'
import { Modal, OverlayPresence } from '../ui'

export function HomeExperience({ children }: { children?: ReactNode }) {
  const { user, tiles, prefs, setPrefs, setPalette, open } = useApp()
  const { recent, clearRecent } = usePersonal()
  const [editor, setEditor] = useState<Space | 'new' | null>(null)
  const [guide, setGuide] = useState(false)
  const spaces = spacesFor(prefs)
  const visits = recent.map(v => ({ ...v, tile: tiles.find(t => t.key === v.key) })).filter(v => v.tile).slice(0, 5)
  const first = (user?.name || '').split(/\s/)[0]
  return <>
    <section className={`home-hero ${children ? 'widget-hero' : ''}`}>
      <div className="hero-copy">
        <div className="eyebrow hero-eyebrow"><span className="welcome-line" />{greeting()}{first ? `, ${first}` : ''}</div>
        <h1>Your world.<br /><em>A little closer.</em></h1>
        <p>A place for your ideas, your everyday,<br className="desktop-break" /> and everything you love coming home to.</p>
        <div className="hero-actions"><button className="btn hero-search" onClick={() => setPalette(true)}><Search />What would you like to do?<span>↗</span></button><button className="text-button" onClick={() => setGuide(true)}>Make yourself at home <span>↗</span></button></div>
        <div className="hero-bottom"><span className="dot ok" />YOUR POCKET BOX<span className="hero-divider" />{tiles.length} apps to make it yours</div>
      </div>
      {!children && <Orbit />}
    </section>
    {!children && visits.length > 0 && <section className="recent-strip" aria-label="Recently opened apps"><span className="eyebrow">PICK UP AGAIN</span><div className="recent-apps">{visits.map(v => <button key={v.key} onClick={() => open(v.tile!)} title={`Opened ${timeAgo(new Date(v.at).toISOString())}`}><AppIcon t={v.tile!} size={26} />{v.tile!.name.replace(/^Pocket /, '')}<span>↗</span></button>)}</div><button className="text-button recent-clear" onClick={clearRecent} title="Clear recently opened apps in this browser">Clear</button></section>}
    {children}
    {prefs.home_show_spaces !== false && <section className="spaces-section">
      <div className="section-heading"><div><div className="eyebrow">CHANGE YOUR PACE</div><h2>A space for every part of your day.</h2></div><button className="text-button" onClick={() => setEditor('new')}>＋ Create a space</button></div>
      <div className="spaces-grid">{spaces.map((s, i) => {
        const apps = spaceTiles(s, tiles)
        return <div key={s.id} className={`space-card ${prefs.active_space === s.id ? 'selected' : ''}`} style={{ ['--space-color' as string]: s.color }}>
          <button className="space-select" onClick={() => { setPrefs({ active_space: prefs.active_space === s.id ? 'all' : s.id, home_show_apps: true }); document.getElementById('space-apps')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }} aria-pressed={prefs.active_space === s.id} aria-controls="space-apps">
            <div className="space-top"><span className="space-symbol">{s.symbol}</span><span className="space-number">{String(i + 1).padStart(2, '0')} / SPACE</span><span className="space-arrow">↗</span></div>
            <h3>{s.name}</h3><p>{s.description}</p>
            <div className="space-bottom"><div className="space-icons">{apps.slice(0, 4).map(t => <AppIcon key={t.key} t={t} size={25} />)}</div><span>{apps.length ? `${apps.length} apps` : 'Ready for your apps'}</span></div>
          </button>
          {s.apps && <button className="space-edit" onClick={() => setEditor(s)} aria-label={`Edit ${s.name}`}>Edit</button>}
        </div>
      })}</div>
    </section>}
    <OverlayPresence>{editor && <SpaceEditor space={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}</OverlayPresence>
    <OverlayPresence>{guide && <Modal title="Make yourself at home." onClose={() => setGuide(false)}><div className="welcome-guide"><p>Your Pocket Box brings your apps together in one personal home. Start anywhere. Make it yours as you go.</p><Link to="/apps" onClick={() => setGuide(false)}><b>01</b><span><strong>Find your next favorite</strong><small>Explore all the apps available to you.</small></span><span>↗</span></Link><button onClick={() => { setGuide(false); setEditor('new') }}><b>02</b><span><strong>Give your day a space</strong><small>Bring a few apps together for something you love.</small></span><span>↗</span></button><Link to="/settings" onClick={() => setGuide(false)}><b>03</b><span><strong>Add your own touch</strong><small>Choose your wallpaper, favorites and layout.</small></span><span>↗</span></Link><p className="fine-print">Your spaces and layout belong to your account. Recently opened apps and focus sessions stay in this browser.</p></div></Modal>}</OverlayPresence>
  </>
}

export function Briefing({ activity, error }: { activity: Activity | null; error: boolean }) {
  const { tiles, setSheet } = useApp()
  const down = tiles.filter(t => t.status === 'down')
  const events = (activity?.events || []).filter(e => { const t = tileForTopic(tiles, e.topic); return t && t.group !== 'Server' && t.group !== 'Downloads' && t.type !== 'core' }).slice(0, 3)
  return <section className="briefing-grid">
    <div className="focus-invitation"><div className="eyebrow">A MOMENT, JUST FOR YOU</div><div className="focus-illustration" aria-hidden="true"><span /><span /><span /></div><h2>Less noise.<br />A little more headspace.</h2><p>Set one intention. Give it 25 minutes.</p><button className="btn" onClick={() => window.dispatchEvent(new Event('hub:focus'))}>Enter your focus room <span>↗</span></button></div>
    <div className="daily-brief"><div className="section-heading"><div className="eyebrow">AROUND YOUR WORLD</div><Link className="text-button" to="/activity">All activity ↗</Link></div>
      {down.length > 0 && <div className="attention-list"><strong>{down.length === 1 ? 'An app needs a little attention' : `${down.length} apps need a little attention`}</strong>{down.map(t => <button key={t.key} onClick={() => setSheet(t)}><span className="dot down" />{t.name}<span>View details ↗</span></button>)}</div>}
      {error || activity?.error ? <div className="brief-empty"><span>↻</span><h3>Activity is taking a moment.</h3><p>We’ll try again automatically. Your apps are still here.</p></div> : events.length ? <div className="brief-events">{events.map(e => {
        const t = tileForTopic(tiles, e.topic)
        return <div className="brief-event" key={e.id}>{t ? <AppIcon t={t} size={34} /> : <span className="event-placeholder">✳</span>}<div><strong>{eventTitle(e) || humanTopic(e.topic)}</strong><span>{t?.name.replace(/^Pocket /, '') || e.topic.split('.')[0]} · {humanTopic(e.topic)}</span></div><time>{timeAgo(e.created_at)}</time></div>
      })}</div> : <div className="brief-empty"><span>✧</span><h3>A little quiet looks good on you.</h3><p>{activity?.scope === 'none' ? 'Shared activity hasn’t been connected for your account yet. Your apps are ready to explore.' : activity ? 'Recent moments from your connected apps will appear here.' : 'Checking for recent moments…'}</p></div>}
      <div className="brief-foot">{activity?.scope === 'box' ? 'Box activity · owner view' : 'From your connected apps'}</div>
    </div>
  </section>
}
