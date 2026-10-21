import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/app-context'
import { AppIcon } from './AppIcon'
import { Search } from './icons'

export function Palette({ onClose }: { onClose: () => void }) {
  const { allTiles, open, setSheet } = useApp()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return allTiles.slice(0, 12)
    const score = (n: string) => n.toLowerCase().startsWith(s) ? 0 : n.toLowerCase().includes(s) ? 1 : 2
    return allTiles.filter(t => `${t.name} ${t.type} ${t.group}`.toLowerCase().includes(s)).sort((a, b) => score(a.name) - score(b.name)).slice(0, 12)
  }, [q, allTiles])
  useEffect(() => { setI(0) }, [q])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(v => Math.min(v + 1, hits.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(v => Math.max(v - 1, 0)) }
    if (e.key === 'Enter' && hits[i]) { e.preventDefault(); if (e.metaKey || e.ctrlKey) { setSheet(hits[i]); onClose() } else open(hits[i]) }
  }
  return (
    <div className="backdrop top" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="palette" role="dialog" aria-modal="true">
        <div className="palette-input"><Search /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search apps" /><kbd>esc</kbd></div>
        <div className="palette-list">
          {hits.map((t, k) => (
            <button key={t.key} className={`palette-row ${k === i ? 'active' : ''}`} onMouseEnter={() => setI(k)} onClick={() => open(t)}>
              <AppIcon t={t} size={28} />
              <span className="palette-name">{t.name}</span>
              <span className="palette-group">{t.group}</span>
              {t.status === 'down' && <span className="dot down" />}
            </button>
          ))}
          {hits.length === 0 && <div className="palette-empty">Nothing matches “{q}”.</div>}
        </div>
        <div className="palette-foot"><span><kbd>↵</kbd> open</span><span><kbd>⌘↵</kbd> details</span><span><kbd>↑↓</kbd> move</span></div>
      </div>
    </div>
  )
}
