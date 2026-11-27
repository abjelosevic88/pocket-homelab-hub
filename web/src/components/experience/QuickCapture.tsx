import { useEffect, useState } from 'react'
import { api, ApiError, V1 } from '../../lib/api'
import { localDay, useDaily, useDailyApps, type Destination } from '../../lib/daily-context'
import { Modal, OverlayPresence } from '../ui'
import { Journal, Note, Task } from '../icons'

// The three things Hub has always offered come first, with their own wording.
// Everything else comes from what each app says it can keep (its manifest).
const FIRST = [
  { id: 'task', app: 'tasks', name: 'Task', appName: 'Pocket Tasks', fields: ['title', 'due'], title: 'Task title', titleHint: 'What needs doing?', text: 'Details (optional)', textHint: 'Keep the details here…', date: '' },
  { id: 'note', app: 'notes', name: 'Note', appName: 'Pocket Notes', fields: ['title'], title: 'Note title', titleHint: 'Give your idea a name…', text: 'Your note', textHint: 'Keep the details here…', date: '' },
  { id: 'moment', app: 'day', name: 'Journal moment', appName: 'Pocket Day', fields: ['date'], title: '', titleHint: '', text: 'Your moment', textHint: 'Something you want to remember…', date: 'Day to remember' },
] as const
type First = typeof FIRST[number]
// One button (or one line of the "More" list): what it is called, what it takes, and where it can go.
type Choice = { id: string; label: string; what: string; fields: readonly string[]; targets: Destination[]; first?: First }
// date stays empty until the person picks a day: the app then decides (an event at 3pm typed in
// the evening is tomorrow's). Only a journal moment shows and sends today when none is picked.
type Draft = { request_id: string; app_key: string; choice: string; title: string; text: string; due: string; date: string }
const fresh = (choice = 'task'): Draft => ({ request_id: crypto.randomUUID(), app_key: '', choice, title: '', text: '', due: '', date: '' })

function choicesFrom(destinations: Destination[]): Choice[] {
  const taken = new Set<Destination>()
  const first = FIRST.map(f => {
    // The app's own word for it when it still says "task"; else the first thing that app keeps.
    const mine = destinations.filter(d => d.kind === f.app)
    const word = mine.some(d => d.capture_kind === f.id) ? f.id : mine[0]?.capture_kind
    const targets = mine.filter(d => d.capture_kind === word)
    targets.forEach(d => taken.add(d))
    const known = word === f.id || !targets.length
    return { id: f.id, label: known ? f.name : targets[0].label, what: targets[0]?.what || '', fields: targets[0]?.fields || f.fields, targets, first: known ? f : undefined }
  })
  const rest = destinations.filter(d => !taken.has(d)).map(d => ({ id: `${d.app_key}/${d.capture_kind}`, label: d.label, what: d.what || '', fields: d.fields, targets: [d] }))
  return [...first, ...rest]
}

export function QuickCapture() {
  const { tileOf, openApp } = useDailyApps()
  const { data, error: connectionError, loading, refresh } = useDaily()
  const [visible, setVisible] = useState(false), [draft, setDraft] = useState<Draft>(() => fresh())
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [uncertain, setUncertain] = useState(false)
  const [saved, setSaved] = useState<{ app_key: string; label: string; url?: string } | null>(null)
  const destinations = (data?.destinations || []).filter(d => tileOf(d))
  const choices = choicesFrom(destinations)
  const choice = choices.find(c => c.id === draft.choice) || choices[0]
  const more = choices.slice(FIRST.length)
  const target = choice.targets.find(d => d.app_key === draft.app_key) || choice.targets[0]
  const has = (field: string) => choice.fields.includes(field)
  const wording = choice.first
  const day = choice.id === 'moment' ? draft.date || localDay() : draft.date
  const written = (has('title') && draft.title.trim()) || draft.text.trim()
  const change = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch, request_id: crypto.randomUUID() })); setProblem(''); setSaved(null); setUncertain(false) }
  useEffect(() => {
    const show = (event: Event) => {
      const kind = (event as CustomEvent).detail?.kind as string | undefined
      const known = !!kind && FIRST.some(f => f.id === kind)
      setVisible(true)
      if (saved) { setSaved(null); setProblem(''); setUncertain(false); setDraft(fresh(known ? kind : draft.choice)); return }
      // A partly written draft stays intact; the customer chooses when to clear it.
      if (known) setDraft(d => d.title || d.text ? d : { ...d, choice: kind!, app_key: '', request_id: crypto.randomUUID() })
    }
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); show(new CustomEvent('hub:capture')) } }
    window.addEventListener('hub:capture', show); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('hub:capture', show); window.removeEventListener('keydown', key) }
  }, [saved, draft.choice])
  useEffect(() => {
    if (saved || (!draft.title && !draft.text)) return
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [draft.title, draft.text, saved])
  const save = async () => {
    if (!target || busy) return
    setDraft(d => ({ ...d, app_key: target.app_key })); setBusy(true); setProblem('')
    try {
      // Only what this kind takes is sent; words typed for another kind stay in the draft.
      const attempt = { request_id: draft.request_id, app_key: target.app_key, kind: target.capture_kind, title: has('title') ? draft.title : '', text: draft.text, due: has('due') ? draft.due : '', date: has('date') ? day : '' }
      const result = await api.post<{ status: string; app_key: string; url?: string }>(`${V1}/capture`, attempt)
      if (result.status !== 'saved') throw Error('No save confirmation received')
      setSaved({ app_key: result.app_key, label: choice.label, url: result.url }); setUncertain(false); void refresh()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Your capture could not be confirmed.')
      setUncertain(!(err instanceof ApiError) || err.data.status === 'unknown')
      if (err instanceof ApiError && err.data.status === 'failed') setDraft(d => ({ ...d, request_id: crypto.randomUUID() }))
    } finally { setBusy(false) }
  }
  const reset = () => { setDraft(fresh(draft.choice)); setSaved(null); setUncertain(false); setProblem('') }
  const openTarget = (at?: string) => { const app = destinations.find(d => d.app_key === (saved?.app_key || target?.app_key)); if (app) { setVisible(false); openApp(app, at) } }
  const lower = choice.label.toLowerCase()
  const cells = (has('due') ? 1 : 0) + (has('date') ? 1 : 0) + 1
  return <OverlayPresence>{visible && <Modal className="capture-sheet" title={saved ? 'Saved' : 'Add something new'} onClose={() => setVisible(false)}>
    {saved ? <div className="capture-success"><span>✓</span><h3>{saved.label} saved.</h3><p>You’ll find it in {destinations.find(d => d.app_key === saved.app_key)?.name || 'your app'}.</p><div className="row">{saved.url ? <button className="btn primary" onClick={() => openTarget(saved.url)}>Open it</button> : <button className="btn primary" onClick={() => openTarget()}>Open app</button>}<button className="btn" onClick={reset}>Add another</button></div></div> : <form className="widget-form capture-form" onSubmit={e => { e.preventDefault(); void save() }}>
      <p className="capture-intro">A task to do, a note to keep, or a memory for your journal.{more.length > 0 && ' Your other apps are under More.'}</p>
      <fieldset disabled={busy || uncertain} className="capture-fields">
        <div className="capture-kinds" aria-label="Capture type">{choices.slice(0, FIRST.length).map(c => <button type="button" key={c.id} aria-pressed={choice.id === c.id} onClick={() => change({ choice: c.id, app_key: '' })}>{c.id === 'task' ? <Task size={18} /> : c.id === 'note' ? <Note size={18} /> : <Journal size={18} />} {c.label}</button>)}
          {more.length > 0 && <select className={more.includes(choice) ? 'chosen' : ''} aria-label="More things to add" value={more.includes(choice) ? choice.id : ''} onChange={e => e.target.value && change({ choice: e.target.value, app_key: '' })}><option value="">More…</option>{appsOf(more).map(([app, list]) => <optgroup key={app} label={app}>{list.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}</select>}
        </div>
        <div className={`capture-panel ${has('title') ? '' : 'no-title'} ${cells === 1 ? 'one-cell' : ''}`} key={choice.id}>
        {has('title') && <label>{wording?.title || 'Title'}<input value={draft.title} maxLength={200} required={choice.id === 'task'} placeholder={wording?.titleHint || 'Give it a name…'} onChange={e => change({ title: e.target.value })} /></label>}
        <label className="capture-writing">{wording?.text || (has('title') ? 'Details' : `Your ${lower}`)}<textarea rows={5} maxLength={10000} required={!has('title')} value={draft.text} placeholder={wording?.textHint || 'Write it here…'} onChange={e => change({ text: e.target.value })} /></label>
        <div className="capture-metadata">
        {has('due') && <label>Due date (optional)<input type="date" value={draft.due} onChange={e => change({ due: e.target.value })} /></label>}
        {has('date') && <label>{wording?.date || 'Day (optional)'}<input type="date" value={day} required={choice.id === 'moment'} onChange={e => change({ date: e.target.value })} /></label>}
        <label>Save to<select aria-label="Capture destination" value={target?.app_key || ''} onChange={e => change({ app_key: e.target.value })}>{!choice.targets.length && <option value="">No connected destination</option>}{choice.targets.map(d => <option key={d.app_key} value={d.app_key}>{d.name}</option>)}</select></label>
        {choice.what && <p className="capture-where">{choice.what}</p>}
        </div>
        </div>
      </fieldset>
      <div className="capture-footer">
      {!target && <div className="capture-connection"><p>{loading ? 'Connecting your apps…' : connectionError ? 'Your apps could not be loaded. Your draft is still here.' : `You need access to ${FIRST.find(f => f.id === choice.id)?.appName || 'this app'} to save this. Ask the person who looks after your box.`}</p><button type="button" className="text-button" onClick={refresh}>Refresh connections</button></div>}
      {problem && <p role="alert">{problem}</p>}
      <div className="widget-form-actions">{uncertain && <button type="button" className="btn" onClick={() => openTarget()}>Check app</button>}<button className="btn primary" disabled={busy || !target || !written}>{busy ? 'Saving…' : uncertain ? 'Check saved status' : `Save ${lower}`}</button></div>
      <div className="capture-draft-note"><span>If you close this, your draft is kept until you reload the page.</span>{(draft.title || draft.text) && !busy && <button type="button" className="text-button" onClick={reset}>{uncertain ? 'Start a new capture' : 'Clear draft'}</button>}</div>
      </div>
    </form>}
  </Modal>}</OverlayPresence>
}

// The "More" list, one group per app, in the order the server gave.
function appsOf(choices: Choice[]): [string, Choice[]][] {
  const groups = new Map<string, Choice[]>()
  for (const c of choices) { const app = c.targets[0].name; groups.set(app, [...(groups.get(app) || []), c]) }
  return [...groups.entries()]
}
