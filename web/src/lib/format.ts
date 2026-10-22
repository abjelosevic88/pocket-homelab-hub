import type { CoreEvent, Tile } from './types'

export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function uptime(s: number | undefined): string {
  if (!s && s !== 0) return ''
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function clock(d: Date, h24: boolean): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !h24 })
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// "habits.marked" → "Marked", "core.app.registered" → "App registered"
export function humanTopic(t: string): string {
  const rest = t.split('.').slice(1).join(' ').replace(/_/g, ' ').trim() || t
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

export function topicApp(t: string): string {
  const i = t.indexOf('.')
  return i > 0 ? t.slice(0, i) : t
}

const TITLE_KEYS = ['title', 'summary', 'name', 'recipe', 'original_file_name', 'monitor', 'watch', 'release_title', 'message', 'habit', 'item', 'book', 'episode', 'task', 'note', 'document']

export function eventTitle(e: CoreEvent): string {
  const p = e.payload || {}
  for (const k of TITLE_KEYS) {
    const v = p[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  if (e.subject) return e.subject.replace(/^[a-z_]+:/, '')
  return ''
}

export function eventURL(e: CoreEvent): string {
  const u = e.payload?.url
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : ''
}

export function tileForTopic(tiles: Tile[], topic: string): Tile | undefined {
  const app = topicApp(topic)
  return tiles.find(t => t.slug === app) || tiles.find(t => t.type === app)
}
