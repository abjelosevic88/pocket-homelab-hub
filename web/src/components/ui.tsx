import React, { useEffect, useRef, useId } from 'react'
import { X } from './icons'

// Share the lock so opening one overlay from another cannot restore scrolling early.
let scrollLocks = 0
let unlockScroll = () => {}
export function useOverlayScrollLock() {
  useEffect(() => {
    if (scrollLocks++ === 0) {
      const body = document.body
      const overflow = body.style.overflow, padding = body.style.paddingRight
      const gutter = window.innerWidth - document.documentElement.clientWidth
      if (gutter > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`
      body.style.overflow = 'hidden'
      unlockScroll = () => { body.style.overflow = overflow; body.style.paddingRight = padding }
    }
    return () => { if (--scrollLocks === 0) unlockScroll() }
  }, [])
}

export function Modal({ title, onClose, children, wide = false, className = '' }: { title?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  useOverlayScrollLock()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]') || [])].filter(el => !el.closest('[inert]') && el.getClientRects().length > 0)
    if (!ref.current?.contains(document.activeElement)) focusable()[0]?.focus({ preventScroll: true })
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current() }
      if (e.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previousFocus.current?.focus({ preventScroll: true }) }
  }, [])
  return (
    <div className="backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`sheet ${wide ? 'wide' : ''} ${className}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : "App details"}>
        <button className="iconbtn sheet-close" onClick={onClose} aria-label="Close"><X /></button>
        {title && <h2 className="sheet-title" id={titleId}>{title}</h2>}
        <div className="sheet-body">{children}</div>
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
