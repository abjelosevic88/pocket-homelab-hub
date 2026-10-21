import { useState } from 'react'
import { useApp } from '../../lib/app-context'
import type { Space } from '../../lib/experience'
import { AppIcon } from '../AppIcon'
import { Modal } from '../ui'

const COLORS = ['#c1caff', '#f6c99d', '#b7e6c6', '#f1baca', '#9fdbe8']
export function SpaceEditor({ space, onClose }: { space?: Space; onClose: () => void }) {
  const { tiles, prefs, setPrefs } = useApp()
  const [name, setName] = useState(space?.name || '')
  const [color, setColor] = useState(space?.color || COLORS[0])
  const [keys, setKeys] = useState(space?.apps || [])
  const save = () => {
    const entry = { id: space?.id || `space-${crypto.randomUUID()}`, name: name.trim(), color, apps: keys }
    setPrefs(p => ({ ...p, spaces: [...(p.spaces || []).filter(s => s.id !== entry.id), entry], active_space: entry.id, home_show_apps: true }))
    onClose()
  }
  return <Modal title={space ? 'Make this space yours' : 'A space for your kind of day'} onClose={onClose}>
    <form className="space-form" onSubmit={e => { e.preventDefault(); save() }}>
      <p className="muted">Movie night, a side project, the weekend. Bring the apps you need together.</p>
      <label className="field"><span>Space name</span><input autoFocus required maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Sunday mornings" /></label>
      <div className="space-colors" role="group" aria-label="Space color">{COLORS.map((c, i) => <button type="button" key={c} style={{ background: c }} aria-label={`Color ${i + 1}`} aria-pressed={color === c} onClick={() => setColor(c)}>{color === c ? '✓' : ''}</button>)}</div>
      <div className="eyebrow">CHOOSE YOUR APPS · {keys.length} SELECTED</div>
      <div className="space-picker">{tiles.map(t => <label key={t.key} className={keys.includes(t.key) ? 'selected' : ''}><input type="checkbox" checked={keys.includes(t.key)} onChange={e => setKeys(k => e.target.checked ? [...k, t.key] : k.filter(v => v !== t.key))} /><AppIcon t={t} size={28} /><span>{t.name.replace(/^Pocket /, '')}</span></label>)}</div>
      <div className="row-between">{space ? <button type="button" className="text-button" onClick={() => { setPrefs({ spaces: (prefs.spaces || []).filter(s => s.id !== space.id), active_space: 'all' }); onClose() }}>Remove space</button> : <span className="fine-print">Just for you. Saved to your account.</span>}<button className="btn primary" disabled={!name.trim() || !keys.length}>Save space</button></div>
    </form>
  </Modal>
}
