import type { Tile } from './types'

// Apps sorted by what people use them for, so a box with dozens of apps reads
// like a tidy shelf instead of one long grid. An app's own category (from its
// manifest) comes first; this table, keyed by Core catalog type, is for apps
// that name none; apps the hub doesn't know fall back to their Core group.
const CATEGORIES: [string, string[]][] = [
  ['Everyday', ['notes', 'tasks', 'calendar', 'day', 'habits', 'kitchen', 'contacts', 'clips', 'docmost']],
  ['Money', ['money', 'split', 'invoicing', 'firefly', 'pico']],
  ['Photos & media', ['photos', 'immich', 'music', 'navidrome', 'maloja', 'podcasts', 'pinepods', 'audiobooks', 'audiobookshelf', 'bookshelf', 'library', 'kavita', 'calibre', 'calibre-web', 'watch', 'jellyfin', 'jellyseerr', 'jellystat', 'still', 'subtitles', 'romm', 'metube']],
  ['Files & work', ['files', 'documents', 'office', 'review', 'projects', 'nextcloud', 'paperless', 'forgejo']],
  ['Life & places', ['travel', 'garage', 'lubelogger', 'health', 'movement', 'dawarich', 'inventory', 'wishlist']],
  ['Tools', ['searxng', 'changedetection', 'it-tools', 'stirling', 'excalidraw', 'drawio', 'ntfy']],
  ['Downloads', ['radarr', 'sonarr', 'lidarr', 'prowlarr', 'bazarr', 'qbittorrent', 'sabnzbd', 'nzbget', 'slskd', 'chaptarr', 'lazylibrarian']],
  ['Your box', ['core', 'hub', 'monitoring', 'network', 'backups', 'adguard', 'kuma', 'backrest', 'scrutiny', 'glances', 'truenas', 'komodo', 'beszel', 'speedtest', 'homepage', 'ssh']],
]
const BY_TYPE = new Map(CATEGORIES.flatMap(([name, types]) => types.map(t => [t, name] as [string, string])))
const ORDER = CATEGORIES.map(([name]) => name)

// An app may name its own shelf in its manifest, in its own word ("Money",
// "Home", "media"). The word is taken when it is one of the shelves above, or
// a common word for one; any other word falls back to the table, so the
// shelves stay the familiar eight.
const SYNONYMS: [string, string[]][] = [
  ['Life & places', ['home', 'family', 'health', 'life', 'travel', 'places']],
  ['Files & work', ['work', 'documents', 'files']],
  ['Photos & media', ['media', 'photos', 'music', 'video', 'books', 'reading']],
  ['Money', ['finance']],
  ['Your box', ['system', 'box']],
  ['Tools', ['utilities']],
]
const SHELF = new Map<string, string>([...ORDER.map(name => [name.toLowerCase(), name] as [string, string]), ...SYNONYMS.flatMap(([name, words]) => words.map(w => [w, name] as [string, string]))])
export const shelfFor = (category: string | undefined) => SHELF.get((category || '').trim().toLowerCase())

export function categoryOf(t: Pick<Tile, 'type' | 'group' | 'pocket' | 'category'>): string {
  return shelfFor(t.category) || BY_TYPE.get(t.type) || (t.group && t.group !== 'Pocket' ? t.group : 'More apps')
}

// Categories in a fixed, familiar order (unknown Core groups after them, "More
// apps" last); apps keep the person's own order inside each one.
export function categorize(tiles: Tile[]): [string, Tile[]][] {
  const m = new Map<string, Tile[]>()
  for (const t of tiles) { const c = categoryOf(t); m.set(c, [...(m.get(c) || []), t]) }
  const rank = (c: string) => c === 'More apps' ? 1e6 : ORDER.includes(c) ? ORDER.indexOf(c) : ORDER.length
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]))
}
