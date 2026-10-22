import { useEffect, useRef, useState } from 'react'
import { usePersonal, timerLabel } from '../../lib/personal-context'
import { useApp } from '../../lib/app-context'
import { AppIcon } from '../AppIcon'
import { SPACES, spaceTiles } from '../../lib/experience'
import { Modal, OverlayPresence } from '../ui'

export function FocusSession() {
  const { focus, remaining, start, pause, resume, reset } = usePersonal()
  const { tiles, open } = useApp()
  const [expanded, setExpanded] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const done = focus.active && remaining === 0
  const apps = spaceTiles(SPACES[0], tiles).slice(0, 4)
  useEffect(() => {
    const show = () => setExpanded(true)
    window.addEventListener('hub:focus', show)
    return () => window.removeEventListener('hub:focus', show)
  }, [])
  useEffect(() => {
    if (!focus.active) return
    const prev = document.title
    document.title = `${done ? 'Session complete' : timerLabel(remaining) + ' · Focus'} — Pocket Box`
    return () => { document.title = prev }
  }, [focus.active, remaining, done])
  const close = () => { setExpanded(false); trigger.current?.focus() }
  return <>
    {focus.active && <button ref={trigger} className={`focus-mini ${done ? 'complete' : ''}`} onClick={() => setExpanded(true)} aria-label="Open focus session"><span className="focus-mini-dot" />{done ? 'Focus session done' : `${timerLabel(remaining)} · ${focus.endsAt ? 'Focusing' : 'Paused'}`}</button>}
    <OverlayPresence>{expanded && <Modal title="Focus timer" onClose={close}>
      <div className="focus-room">
        <p className="muted">Pick one thing to work on. We’ll keep time.</p>
        <div className={`focus-orb ${focus.endsAt && !done ? 'running' : ''}`} style={{ ['--progress' as string]: focus.active ? (1 - remaining / focus.duration) * 100 : 0 }}>
          <span className="eyebrow">{done ? 'Done' : focus.active ? focus.endsAt ? 'Focusing' : 'Paused' : 'Ready'}</span>
          <strong>{focus.active ? timerLabel(remaining) : '25:00'}</strong>
          <span>{done ? 'Time for a break.' : focus.active ? 'Remaining' : 'Choose a length below'}</span>
        </div>
        <div role="status" className="sr-only">{done ? 'Your focus session is complete.' : ''}</div>
        {!focus.active || done ? <div className="focus-actions">{[15, 25, 50].map(m => <button className={`btn ${m === 25 ? 'primary' : ''}`} key={m} onClick={() => start(m)}>{m} min</button>)}</div> : <div className="focus-actions"><button className="btn primary" onClick={focus.endsAt ? pause : resume}>{focus.endsAt ? 'Pause' : 'Continue'}</button><button className="btn" onClick={reset}>End session</button></div>}
        {done && <button className="text-button" onClick={() => { reset(); close() }}>Finish for now</button>}
        {apps.length > 0 && <div className="focus-apps">{apps.map(t => <button key={t.key} onClick={() => open(t)}><AppIcon t={t} size={34} /><span>{t.name.replace(/^Pocket /, '')}</span></button>)}</div>}
        <p className="fine-print">The timer keeps running if you leave this page. It’s saved on this device only.</p>
      </div>
    </Modal>}</OverlayPresence>
  </>
}
