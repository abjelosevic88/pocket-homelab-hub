import { useState } from 'react'
import type { Tile } from '../lib/types'
import { bundledIcon, hueOf } from '../lib/icons'

// A tile's picture: Pocket apps ship their own squircle; third-party logos sit
// on a glass tile; anything without artwork gets a coloured letter.
export function AppIcon({ t, size = 72 }: { t: Tile; size?: number }) {
  const [failed, setFailed] = useState<string[]>([])
  const src = [t.icon, bundledIcon(t.type)].find(url => url && !failed.includes(url)) || ''
  const style = { width: size, height: size }
  if (src && t.pocket) {
    return <span className="ico pocket" style={style}><img src={src} alt="" draggable={false} onError={() => setFailed(urls => [...urls, src])} /></span>
  }
  if (src) {
    return <span className="ico glass" style={style}><img src={src} alt="" draggable={false} onError={() => setFailed(urls => [...urls, src])} /></span>
  }
  const letter = t.name.replace(/^Pocket /, '').charAt(0).toUpperCase()
  return <span className="ico letter" style={{ ...style, background: `linear-gradient(135deg, hsl(${hueOf(t.name)} 70% 55%), hsl(${(hueOf(t.name) + 40) % 360} 70% 40%))`, fontSize: size * 0.42 }}>{letter}</span>
}
