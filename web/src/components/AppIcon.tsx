import { useState } from 'react'
import type { Tile } from '../lib/types'
import { bundledIcon, hueOf } from '../lib/icons'

// A tile's picture: Pocket apps ship their own squircle; third-party logos sit
// on a glass tile; anything without artwork gets a coloured letter.
export function AppIcon({ t, size = 72 }: { t: Tile; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = !broken ? (t.icon || bundledIcon(t.type)) : bundledIcon(t.type) !== t.icon ? bundledIcon(t.type) : ''
  const style = { width: size, height: size }
  if (src && t.pocket) {
    return <span className="ico pocket" style={style}><img src={src} alt="" draggable={false} onError={() => setBroken(true)} /></span>
  }
  if (src) {
    return <span className="ico glass" style={style}><img src={src} alt="" draggable={false} onError={() => setBroken(true)} /></span>
  }
  const letter = t.name.replace(/^Pocket /, '').charAt(0).toUpperCase()
  return <span className="ico letter" style={{ ...style, background: `linear-gradient(135deg, hsl(${hueOf(t.name)} 70% 55%), hsl(${(hueOf(t.name) + 40) % 360} 70% 40%))`, fontSize: size * 0.42 }}>{letter}</span>
}
