import { useState } from 'react'
import { useDaily, useDailyApps } from '../../lib/daily-context'
import { appWidgets, CONNECTED, WIDGETS, MAX_WIDGETS, widgetDefinition, type HomeWidget, type WidgetDefinition, type WidgetSize } from '../../lib/widgets'
import type { Tile } from '../../lib/types'
import { AppIcon } from '../AppIcon'
import { Modal } from '../ui'
import { WidgetContent, type WidgetData } from './WidgetContent'

// One entry of the gallery: a built-in kind, or the summary of one app that has one.
type Choice = WidgetDefinition & { id: string; tile?: Tile; off?: string }

export function WidgetGallery({ data, count, onAdd, onClose }: { data: WidgetData; count: number; onAdd: (widget: HomeWidget) => void; onClose: () => void }) {
  const { data: daily } = useDaily(), { tileOf } = useDailyApps()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState('clock')
  const [size, setSize] = useState<WidgetSize>('small')
  // Apps that say they have a summary get their own entry, under their own title and icon.
  // Tasks, Habits, Kitchen and Notes already have theirs above.
  const apps: Choice[] = appWidgets(daily).filter(a => !Object.values(CONNECTED).includes(a.kind)).flatMap(a => {
    const tile = tileOf(a)
    return tile ? [{ ...widgetDefinition('app'), id: `app:${a.app_key}`, name: a.title || tile.name.replace(/^Pocket /, ''), description: a.what || `What ${tile.name} has for you right now.`, tile, off: 'off' in a ? a.off : undefined }] : []
  })
  const all: Choice[] = [...WIDGETS.filter(w => w.kind !== 'app').map(w => ({ ...w, id: w.kind })), ...apps]
  const definition = all.find(w => w.id === selected) || all.find(w => w.id === 'clock')!
  const choices = all.filter(w => (category === 'All' || w.category === category) && `${w.name} ${w.description} ${w.tile?.name || ''}`.toLowerCase().includes(search.toLowerCase()))
  const preview: HomeWidget = { id: 'preview', kind: definition.kind, size, config: definition.kind === 'clock' ? { clockStyle: 'analog' } : definition.tile ? { appKey: definition.tile.key } : {} }
  return <Modal title="Add a widget" onClose={onClose} wide>
    <div className="widget-gallery">
      <p className="widget-gallery-intro">Pick a widget, choose a size, and add it to Home. You can move or remove it later.</p>
      <div className="widget-gallery-layout"><div className="widget-gallery-catalog">
        <input className="widget-search" autoFocus type="search" aria-label="Search widgets" placeholder="Search widgets…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="widget-categories" aria-label="Widget categories">{['All', 'Everyday', 'Your apps', 'Personal', 'Your box'].map(c => <button key={c} aria-pressed={c === category} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="widget-choices">{choices.map(w => <button key={w.id} className={definition.id === w.id ? 'selected' : ''} aria-pressed={definition.id === w.id} onClick={() => { setSelected(w.id); setSize(w.initial) }}>{w.tile ? <AppIcon t={w.tile} size={39} /> : <span className={`widget-symbol tone-${w.tone}`}>{w.symbol}</span>}<span><strong>{w.name}</strong><small>{w.tile ? w.tile.name : w.category}</small></span><span>↗</span></button>)}</div>
        {choices.length === 0 && <p>No widgets match. Try another word or category.</p>}
      </div><div className="widget-gallery-detail">
        <div className="widget-preview-stage"><div className={`home-widget widget-${size} kind-${definition.kind} tone-${definition.tone} widget-preview`} inert><WidgetContent key={`${definition.id}-${size}`} widget={preview} data={data} configure={() => {}} update={() => {}} /></div></div>
        <h3>{definition.name}</h3><p>{definition.description}</p>{definition.off && <p className="widget-gallery-off">{definition.off}</p>}
        <div className="widget-size-options" aria-label="Widget size">{definition.sizes.map(s => <button key={s} aria-pressed={size === s} onClick={() => setSize(s)}><span className={`size-shape ${s}`} />{s}</button>)}</div>
        <button className="btn primary widget-add" disabled={count >= MAX_WIDGETS} onClick={() => onAdd({ ...preview, id: crypto.randomUUID() })}>Add {definition.name}</button><small>{count >= MAX_WIDGETS ? 'Your home has 24 widgets. Remove one to make room.' : `${count} of ${MAX_WIDGETS} spots filled · previews use your available data`}</small>
      </div></div>
    </div>
  </Modal>
}
