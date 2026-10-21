import { useState } from 'react'
import { WIDGETS, MAX_WIDGETS, type HomeWidget, type WidgetKind, type WidgetSize } from '../../lib/widgets'
import { Modal } from '../ui'
import { WidgetContent, type WidgetData } from './WidgetContent'

export function WidgetGallery({ data, count, onAdd, onClose }: { data: WidgetData; count: number; onAdd: (widget: HomeWidget) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<WidgetKind>('clock')
  const [size, setSize] = useState<WidgetSize>('small')
  const definition = WIDGETS.find(w => w.kind === selected)!
  const choices = WIDGETS.filter(w => (category === 'All' || w.category === category) && `${w.name} ${w.description}`.toLowerCase().includes(search.toLowerCase()))
  const preview: HomeWidget = { id: 'preview', kind: selected, size, config: selected === 'clock' ? { clockStyle: 'analog' } : {} }
  return <Modal title="Little things. A home that’s yours." onClose={onClose} wide>
    <div className="widget-gallery">
      <p className="widget-gallery-intro">Useful at a glance. Personal by design. Add a widget, choose its size, make it your own.</p>
      <div className="widget-gallery-layout"><div className="widget-gallery-catalog">
        <input className="widget-search" autoFocus type="search" aria-label="Search widgets" placeholder="Find your next widget…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="widget-categories" aria-label="Widget categories">{['All', 'Everyday', 'Your apps', 'Personal', 'Your box'].map(c => <button key={c} aria-pressed={c === category} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="widget-choices">{choices.map(w => <button key={w.kind} className={selected === w.kind ? 'selected' : ''} aria-pressed={selected === w.kind} onClick={() => { setSelected(w.kind); setSize(w.initial) }}><span className={`widget-symbol tone-${w.tone}`}>{w.symbol}</span><span><strong>{w.name}</strong><small>{w.category}</small></span><span>↗</span></button>)}</div>
        {choices.length === 0 && <p>No widgets match. Try another word or category.</p>}
      </div><div className="widget-gallery-detail">
        <div className="widget-preview-stage"><div className={`home-widget widget-${size} kind-${selected} tone-${definition.tone} widget-preview`} inert><WidgetContent key={`${selected}-${size}`} widget={preview} data={data} configure={() => {}} update={() => {}} /></div></div>
        <h3>{definition.name}</h3><p>{definition.description}</p>
        <div className="widget-size-options" aria-label="Widget size">{definition.sizes.map(s => <button key={s} aria-pressed={size === s} onClick={() => setSize(s)}><span className={`size-shape ${s}`} />{s}</button>)}</div>
        <button className="btn primary widget-add" disabled={count >= MAX_WIDGETS} onClick={() => onAdd({ ...preview, id: crypto.randomUUID() })}>Add {definition.name}</button><small>{count >= MAX_WIDGETS ? 'Your home has 24 widgets. Remove one to make room.' : `${count} of ${MAX_WIDGETS} spots filled · previews use your available data`}</small>
      </div></div>
    </div>
  </Modal>
}
