import { useEffect, useState } from 'react'
import { useApp } from '../../lib/app-context'
import { api, ApiError, V1 } from '../../lib/api'
import { localDay, useDaily } from '../../lib/daily-context'
import { Modal, OverlayPresence } from '../ui'

type Kind = 'task' | 'note' | 'moment'
const appKinds: Record<Kind, string> = { task: 'tasks', note: 'notes', moment: 'day' }
const names: Record<Kind, string> = { task: 'Task', note: 'Note', moment: 'Journal moment' }
type Draft = { request_id: string; app_key: string; kind: Kind; title: string; text: string; due: string; date: string }
const fresh = (kind: Kind = 'task'): Draft => ({ request_id: crypto.randomUUID(), app_key: '', kind, title: '', text: '', due: '', date: localDay() })

export function QuickCapture() {
  const { allTiles, open } = useApp()
  const { data, error: connectionError, loading, refresh } = useDaily()
  const [visible, setVisible] = useState(false), [draft, setDraft] = useState<Draft>(() => fresh())
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState<{ app_key: string; kind: Kind } | null>(null)
  const destinations = (data?.destinations || []).filter(d => allTiles.some(t => t.key === d.app_key))
  const choices = destinations.filter(d => d.kind === appKinds[draft.kind])
  const target = choices.find(d => d.app_key === draft.app_key) || choices[0]
  const change = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch, request_id: crypto.randomUUID() })); setProblem(''); setSaved(null); setUncertain(false) }
  useEffect(() => {
    const show = (event: Event) => {
      const kind = (event as CustomEvent).detail?.kind as Kind | undefined
      setVisible(true)
      if (saved) { setSaved(null); setProblem(''); setUncertain(false); setDraft(fresh(kind && kind in appKinds ? kind : draft.kind)); return }
      // A partly written draft stays intact; the customer chooses when to clear it.
      if (kind && kind in appKinds) setDraft(d => d.title || d.text ? d : { ...d, kind, app_key: '', request_id: crypto.randomUUID() })
    }
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); show(new CustomEvent('hub:capture')) } }
    window.addEventListener('hub:capture', show); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('hub:capture', show); window.removeEventListener('keydown', key) }
  }, [saved, draft.kind])
  useEffect(() => {
    if (saved || (!draft.title && !draft.text)) return
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [draft.title, draft.text, saved])
  const save = async () => {
    if (!target || busy) return
    const attempt = { ...draft, app_key: target.app_key }
    setDraft(attempt); setBusy(true); setProblem('')
    try {
      const result = await api.post<{ status: string; app_key: string; kind: Kind }>(`${V1}/capture`, attempt)
      if (result.status !== 'saved') throw Error('No save confirmation received')
      setSaved(result); setUncertain(false); void refresh()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Your capture could not be confirmed.')
      setUncertain(!(err instanceof ApiError) || err.data.status === 'unknown')
      if (err instanceof ApiError && err.data.status === 'failed') setDraft(d => ({ ...d, request_id: crypto.randomUUID() }))
    } finally { setBusy(false) }
  }
  const reset = () => { setDraft(fresh(draft.kind)); setSaved(null); setUncertain(false); setProblem('') }
  const openTarget = () => { const tile = allTiles.find(t => t.key === (saved?.app_key || target?.app_key)); if (tile) { setVisible(false); open(tile) } }
  return <OverlayPresence>{visible && <Modal className="capture-sheet" title={saved ? 'A little less on your mind.' : 'Catch it while it’s here.'} onClose={() => setVisible(false)}>
    {saved ? <div className="capture-success"><span>✓</span><h3>{names[saved.kind]} saved.</h3><p>It’s in {allTiles.find(t => t.key === saved.app_key)?.name || 'your app'}, under your account.</p><div className="row"><button className="btn primary" onClick={openTarget}>Open app</button><button className="btn" onClick={reset}>Capture another</button></div></div> : <form className="widget-form capture-form" onSubmit={e => { e.preventDefault(); void save() }}>
      <p className="capture-intro">An idea, a thing to do, a moment to remember. Choose where it belongs.</p>
      <fieldset disabled={busy || uncertain} className="capture-fields">
        <div className="capture-kinds" aria-label="Capture type">{(['task', 'note', 'moment'] as Kind[]).map(kind => <button type="button" key={kind} aria-pressed={draft.kind === kind} onClick={() => change({ kind, app_key: '' })}>{kind === 'task' ? '☑' : kind === 'note' ? '✎' : '✧'} {names[kind]}</button>)}</div>
        <div className={`capture-panel capture-panel-${draft.kind}`} key={draft.kind}>
        {draft.kind !== 'moment' && <label>{draft.kind === 'task' ? 'Task title' : 'Note title'}<input value={draft.title} maxLength={200} required={draft.kind === 'task'} placeholder={draft.kind === 'task' ? 'What needs doing?' : 'Give your idea a name…'} onChange={e => change({ title: e.target.value })} /></label>}
        <label className="capture-writing">{draft.kind === 'moment' ? 'Your moment' : draft.kind === 'task' ? 'Details (optional)' : 'Your note'}<textarea rows={5} maxLength={10000} required={draft.kind === 'moment'} value={draft.text} placeholder={draft.kind === 'moment' ? 'Something you want to remember…' : 'Keep the details here…'} onChange={e => change({ text: e.target.value })} /></label>
        <div className="capture-metadata">
        {draft.kind === 'task' && <label>Due date (optional)<input type="date" value={draft.due} onChange={e => change({ due: e.target.value })} /></label>}
        {draft.kind === 'moment' && <label>Day to remember<input type="date" value={draft.date} required onChange={e => change({ date: e.target.value })} /></label>}
        <label>Save to<select aria-label="Capture destination" value={target?.app_key || ''} onChange={e => change({ app_key: e.target.value })}>{!choices.length && <option value="">No connected destination</option>}{choices.map(d => <option key={d.app_key} value={d.app_key}>{d.name}</option>)}</select></label>
        </div>
        </div>
      </fieldset>
      <div className="capture-footer">
      {!target && <div className="capture-connection"><p>{loading ? 'Connecting your apps…' : connectionError ? 'Your apps could not be loaded. Your draft is still here.' : `Connect ${draft.kind === 'task' ? 'Pocket Tasks' : draft.kind === 'note' ? 'Pocket Notes' : 'Pocket Day'} to your profile to save here.`}</p><button type="button" className="text-button" onClick={refresh}>Refresh connections</button></div>}
      {problem && <p role="alert">{problem}</p>}
      <div className="widget-form-actions">{uncertain && <button type="button" className="btn" onClick={openTarget}>Check app</button>}<button className="btn primary" disabled={busy || !target || (!draft.title.trim() && !draft.text.trim())}>{busy ? 'Saving…' : uncertain ? 'Check saved status' : `Save ${names[draft.kind].toLowerCase()}`}</button></div>
      <div className="capture-draft-note"><span>Closing keeps this draft while you stay signed in here. Reloading or signing out clears it.</span>{(draft.title || draft.text) && !busy && <button type="button" className="text-button" onClick={reset}>{uncertain ? 'Start a new capture' : 'Clear draft'}</button>}</div>
      </div>
    </form>}
  </Modal>}</OverlayPresence>
}
