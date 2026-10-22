import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useApp } from '../../lib/app-context'
import { DEFAULT_WIDGETS, homeWidgets, moveWidget, widgetDefinition, widgetName, type HomeWidget, type WidgetConfig } from '../../lib/widgets'
import type { Activity } from '../../lib/types'
import { Modal, OverlayPresence } from '../ui'
import { WidgetContent } from './WidgetContent'
import { WidgetEditor } from './WidgetEditor'
import { WidgetGallery } from './WidgetGallery'

export function WidgetBoard({ activity, activityError }: { activity: Activity | null; activityError: boolean }) {
  const { prefs, setPrefs, editing, setEditing, prefsSaving, prefsError } = useApp()
  const widgets = homeWidgets(prefs.home_widgets)
  const [gallery, setGallery] = useState(false)
  const [options, setOptions] = useState(false)
  const [editor, setEditor] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [undo, setUndo] = useState<HomeWidget[] | null>(null)
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState<{ id: string; over: string; x: number; y: number } | null>(null)
  const drag = useRef<{ id: string; startX: number; startY: number; over: string; moved: boolean } | null>(null)
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (!editing) { drag.current = null; setDragging(null) } }, [editing])
  const data = { now, activity, activityError }
  const update = (id: string, config: Partial<WidgetConfig>) => { setUndo(null); setPrefs(p => ({ ...p, home_widgets: homeWidgets(p.home_widgets).map(w => w.id === id ? { ...w, config: { ...w.config, ...config } } : w) })) }
  const reorder = (id: string, position: number) => {
    setUndo(null)
    setPrefs(p => ({ ...p, home_widgets: moveWidget(homeWidgets(p.home_widgets), id, position) }))
    setMessage(`Moved ${widgetName(widgets.find(w => w.id === id)!)} to position ${position + 1}.`)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current) return
    if (Math.hypot(e.clientX - current.startX, e.clientY - current.startY) > 6) current.moved = true
    if (!current.moved) return
    const target = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest<HTMLElement>('[data-widget-id]')).find(el => el && el.dataset.widgetId !== current.id)
    if (target?.dataset.widgetId) current.over = target.dataset.widgetId
    if (e.clientY < 100) window.scrollBy(0, -18)
    else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 18)
    setDragging({ id: current.id, over: current.over, x: e.clientX, y: e.clientY })
  }
  const drop = () => { const current = drag.current; if (current?.moved && current.over !== current.id) { const i = widgets.findIndex(w => w.id === current.over); if (i >= 0) reorder(current.id, i) } drag.current = null; setDragging(null) }
  const selected = widgets.find(w => w.id === editor)
  return <section className={`widget-board ${editing ? 'is-editing' : ''}`} aria-label="Your home widgets">
    <div className="widget-board-heading"><div><h2>Widgets</h2><span className="widget-save-status" aria-live="polite">{prefsSaving ? 'Saving…' : prefsError ? 'Changes haven’t saved yet' : 'Little helpers for your day. Only you see them.'}</span></div><div className="widget-toolbar"><button className="btn small" onClick={() => setGallery(true)}>＋ Add widgets</button><button className={`btn small ${editing ? 'primary' : ''}`} onClick={() => setEditing(!editing)}>{editing ? 'Done editing' : 'Edit home'}</button><button className="btn small ghost" onClick={() => setOptions(true)} aria-label="Home options">•••</button></div></div>
    {editing && <p className="widget-edit-hint">Drag a handle to arrange. Use its arrow keys, or the move buttons. Changes save to your account.</p>}
    <div className="widget-grid">{widgets.map((w, index) => {
      const definition = widgetDefinition(w.kind), name = widgetName(w)
      return <div key={w.id} data-widget-id={w.id} className={`widget-slot widget-${w.size} ${dragging?.id === w.id ? 'is-dragging' : ''} ${dragging?.over === w.id && dragging.id !== w.id ? 'drop-target' : ''}`}>
        {editing && <div className="widget-edit-bar"><button className="widget-handle" aria-label={`Move ${name}`} aria-describedby="widget-move-help" onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: w.id, startX: e.clientX, startY: e.clientY, over: w.id, moved: false } }} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => { drag.current = null; setDragging(null) }} onKeyDown={e => { const change: Record<string, number> = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: widgets.length - 1 }; if (e.key in change) { e.preventDefault(); reorder(w.id, Math.max(0, Math.min(widgets.length - 1, change[e.key]))) } }}>⠿ <span>{name}</span></button><button aria-label={`Remove ${name}`} onClick={() => { setUndo(widgets); setPrefs({ home_widgets: widgets.filter(item => item.id !== w.id) }); setMessage(`${name} removed.`) }}>−</button></div>}
        <article className={`home-widget kind-${w.kind} tone-${definition.tone}`} aria-label={`${name} widget`}><WidgetContent widget={w} data={data} configure={() => setEditor(w.id)} update={config => update(w.id, config)} /></article>
        {editing && <div className="widget-edit-controls"><button aria-label={`Customize ${name}`} onClick={() => setEditor(w.id)}>Customize</button><select aria-label={`Size of ${name}`} value={w.size} onChange={e => { setUndo(null); const size = e.target.value as HomeWidget['size']; setPrefs(p => ({ ...p, home_widgets: homeWidgets(p.home_widgets).map(item => item.id === w.id ? { ...item, size } : item) })) }}>{definition.sizes.map(s => <option key={s} value={s}>{s}</option>)}</select><button aria-label={`Move ${name} earlier`} disabled={index === 0} onClick={() => reorder(w.id, index - 1)}>←</button><button aria-label={`Move ${name} later`} disabled={index === widgets.length - 1} onClick={() => reorder(w.id, index + 1)}>→</button></div>}
      </div>
    })}</div>
    {!widgets.length && <div className="widget-empty-home"><span>✳</span><h3>No widgets yet</h3><p>Add a clock, a calendar, a sticky note or a countdown.</p><button className="btn" onClick={() => setGallery(true)}>Add a widget</button></div>}
    <span id="widget-move-help" className="sr-only">Use arrow keys to move one position, Home to move first, or End to move last.</span><div className="widget-announcement" role="status">{message}{undo && <button className="text-button" onClick={() => { setPrefs({ home_widgets: undo }); setUndo(null); setMessage('Widget layout restored.') }}>Undo layout change</button>}</div>
    {dragging && <div className="widget-drag-label" style={{ left: dragging.x + 12, top: dragging.y + 12 }}>⠿ {widgetName(widgets.find(w => w.id === dragging.id)!)}</div>}
    <OverlayPresence>{gallery && <WidgetGallery data={data} count={widgets.length} onClose={() => setGallery(false)} onAdd={widget => { setUndo(null); setPrefs(p => ({ ...p, home_widgets: [...homeWidgets(p.home_widgets), widget].slice(0, 24) })); setGallery(false); setMessage(`${widgetName(widget)} added.`); if (['note', 'shortcut', 'photo', 'countdown', 'checklist', 'space'].includes(widget.kind)) setEditor(widget.id) }} />}</OverlayPresence>
    <OverlayPresence>{selected && <WidgetEditor key={selected.id} widget={selected} onClose={() => setEditor(null)} onSave={config => update(selected.id, config)} />}</OverlayPresence>
    <OverlayPresence>{options && <Modal title="Home options" onClose={() => setOptions(false)}><div className="widget-home-options"><p>Your widgets and what you write in them are saved to your account. Recently opened apps and the focus timer stay on this device.</p><button className="btn" onClick={() => { setUndo(widgets); setPrefs({ home_widgets: DEFAULT_WIDGETS }); setMessage('Starter widgets restored.'); setOptions(false) }}>Restore starter widgets</button></div></Modal>}</OverlayPresence>
  </section>
}
