import React, { useEffect, useRef } from 'react'
import { X } from './icons'

export function Modal({ title, onClose, children, wide = false }: { title?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`sheet ${wide ? 'wide' : ''}`} ref={ref} role="dialog" aria-modal="true">
        <button className="iconbtn sheet-close" onClick={onClose} aria-label="Close"><X /></button>
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Toggle({ value, onChange, label, help }: { value: boolean; onChange: (v: boolean) => void; label: React.ReactNode; help?: React.ReactNode }) {
  return (
    <label className="toggle-row">
      <span><span className="toggle-label">{label}</span>{help && <span className="toggle-help">{help}</span>}</span>
      <button type="button" role="switch" aria-checked={value} className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button>
    </label>
  )
}

export function Pill({ status }: { status: string }) {
  if (!status) return null
  const ok = status === 'ok'
  return <span className={`pill ${ok ? 'ok' : 'down'}`}><span className="dot" />{ok ? 'Online' : 'Down'}</span>
}

export function Glass({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass ${className}`} {...rest}>{children}</div>
}

export function Spinner() { return <span className="spinner" aria-label="Loading" /> }
