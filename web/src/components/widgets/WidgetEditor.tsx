import { useState } from 'react'
import { useApp } from '../../lib/app-context'
import { spacesFor } from '../../lib/experience'
import { validImageURL, widgetDefinition, type HomeWidget, type WidgetConfig } from '../../lib/widgets'
import { Modal } from '../ui'

export function WidgetEditor({ widget, onSave, onClose }: { widget: HomeWidget; onSave: (config: WidgetConfig) => void; onClose: () => void }) {
  const { allTiles, prefs } = useApp()
  const [config, setConfig] = useState<WidgetConfig>({ ...widget.config })
  const [error, setError] = useState('')
  const patch = (next: Partial<WidgetConfig>) => { setConfig(c => ({ ...c, ...next })); setError('') }
  const definition = widgetDefinition(widget.kind)
  const save = () => {
    if (config.photoUrl && !validImageURL(config.photoUrl)) return setError('Use a full HTTPS image address, without a username or password.')
    if (config.timezone) { try { new Intl.DateTimeFormat(undefined, { timeZone: config.timezone }).format() } catch { return setError('Enter a time zone such as Europe/Sarajevo or America/New_York.') } }
    onSave(config); onClose()
  }
  return <Modal title={`Customize ${definition.name}`} onClose={onClose}>
    <form className="widget-form" onSubmit={e => { e.preventDefault(); save() }}>
      <label>Widget title<input autoFocus value={config.title || ''} maxLength={40} placeholder={definition.name} onChange={e => patch({ title: e.target.value })} /></label>
      {widget.kind === 'clock' && <><label>Clock face<select value={config.clockStyle || 'digital'} onChange={e => patch({ clockStyle: e.target.value as 'analog' | 'digital' })}><option value="digital">Digital</option><option value="analog">Analog</option></select></label><label>Time zone<input value={config.timezone || ''} maxLength={80} placeholder="Local time" list="widget-timezones" onChange={e => patch({ timezone: e.target.value.trim() })} /><datalist id="widget-timezones">{['Europe/Sarajevo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'].map(z => <option key={z}>{z}</option>)}</datalist><small>Leave empty for this device’s time zone.</small></label></>}
      {widget.kind === 'note' && <label>Your note<textarea rows={6} maxLength={500} value={config.note || ''} placeholder="Write anything…" onChange={e => patch({ note: e.target.value })} /><small>{config.note?.length || 0} / 500 characters</small></label>}
      {widget.kind === 'countdown' && <label>Look forward to<input type="date" value={config.targetDate || ''} onChange={e => patch({ targetDate: e.target.value })} /><small>Counts calendar days in this device’s time zone.</small></label>}
      {widget.kind === 'photo' && <label>Image address<input type="url" maxLength={1024} value={config.photoUrl || ''} placeholder="https://…/your-photo.jpg" onChange={e => patch({ photoUrl: e.target.value.trim() })} /><small>Your browser loads the image from this address. Use a direct image link you trust.</small></label>}
      {widget.kind === 'shortcut' && <label>App<select value={config.appKey || ''} onChange={e => patch({ appKey: e.target.value })}><option value="">Choose an app</option>{allTiles.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>}
      {widget.kind === 'space' && <label>Space<select value={config.spaceId || 'focus'} onChange={e => patch({ spaceId: e.target.value })}>{spacesFor(prefs).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {widget.kind === 'checklist' && <div className="widget-list-editor"><p>Up to 12 items. Tick them off here or on Home.</p>{(config.items || []).map(item => <div key={item.id}><input aria-label={`Complete ${item.text || 'item'}`} type="checkbox" checked={item.done} onChange={() => patch({ items: config.items!.map(i => i.id === item.id ? { ...i, done: !i.done } : i) })} /><input aria-label="Checklist item" value={item.text} maxLength={100} onChange={e => patch({ items: config.items!.map(i => i.id === item.id ? { ...i, text: e.target.value } : i) })} /><button className="text-button" type="button" aria-label={`Remove ${item.text || 'item'}`} onClick={() => patch({ items: config.items!.filter(i => i.id !== item.id) })}>×</button></div>)}<button type="button" className="btn small" disabled={(config.items?.length || 0) >= 12} onClick={() => patch({ items: [...(config.items || []), { id: crypto.randomUUID(), text: '', done: false }] })}>Add item</button></div>}
      {!['clock', 'note', 'countdown', 'photo', 'shortcut', 'space', 'checklist'].includes(widget.kind) && <p className="widget-form-help">{definition.description}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="widget-form-actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" type="submit">Save widget</button></div>
    </form>
  </Modal>
}
