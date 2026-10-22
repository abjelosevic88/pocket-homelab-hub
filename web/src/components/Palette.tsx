import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/app-context'
import { AppIcon } from './AppIcon'
import { Search } from './icons'
import { useOverlayScrollLock, useOverlayExit, restoreOverlayFocus } from './ui'
import { searchApps, intentHints } from '../lib/experience'

export function Palette({ onClose }: { onClose: () => void }) {
  useOverlayScrollLock()
  const exiting = useOverlayExit()
  const exitingRef = useRef(exiting)
  exitingRef.current = exiting
  const { allTiles, open, setSheet } = useApp()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const trap = (e: KeyboardEvent) => {
      if (exitingRef.current || e.key !== 'Tab') return
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('input, button') || [])]
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); restoreOverlayFocus(previousFocus.current, dialog.current) }
  }, [])
  const hits = useMemo(() => searchApps(allTiles, q), [q, allTiles])
  useEffect(() => { setI(0) }, [q])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(v => Math.max(0, Math.min(v + 1, hits.length - 1))) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(v => Math.max(v - 1, 0)) }
    if (e.key === 'Enter' && hits[i]) { e.preventDefault(); if (e.metaKey || e.ctrlKey) { setSheet(hits[i]); onClose() } else open(hits[i]) }
  }
  return (
    <div className={`backdrop top ${exiting ? 'exiting' : ''}`} inert={exiting} aria-hidden={exiting || undefined} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} className="palette" role="dialog" aria-modal="true" aria-label="Search apps">
        <div className="palette-input"><Search /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search apps, or describe what you want to do" aria-label="Search apps or intentions" /><kbd>esc</kbd></div>
        {!q && <div className="intent-hints">{intentHints(allTiles).map(h => <button key={h} onClick={() => setQ(h)}>{h}</button>)}</div>}
        <div className="palette-list">
          {hits.map((t, k) => (
            <button key={t.key} className={`palette-row ${k === i ? 'active' : ''}`} onMouseEnter={() => setI(k)} onClick={() => open(t)}>
              <AppIcon t={t} size={28} />
              <span className="palette-name">{t.name}</span>
              <span className="palette-group">{t.group}</span>
              {t.status === 'down' && <span className="dot down" />}
            </button>
          ))}
          {hits.length === 0 && <div className="palette-empty">No apps match “{q}”. Try an app name, or something like “photos” or “plan dinner”.</div>}
        </div>
        <div className="palette-foot"><span><kbd>↵</kbd> open</span><span><kbd>⌘↵</kbd> app details</span><span><kbd>↑↓</kbd> move</span></div>
      </div>
    </div>
  )
}
