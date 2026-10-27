import type { Prefs, Tile } from './types'

export type Space = { id: string; name: string; description: string; color: string; symbol: string; types?: string[]; apps?: string[] }
export const SPACES: Space[] = [
  { id: 'focus', name: 'Work & focus', description: 'Tasks, notes and documents.', color: '#c1caff', symbol: '◈', types: ['tasks', 'notes', 'day', 'review', 'docmost', 'excalidraw', 'drawio'] },
  { id: 'unwind', name: 'Relax', description: 'Movies, music, books and photos.', color: '#f6c99d', symbol: '☾', types: ['jellyfin', 'jellyseerr', 'navidrome', 'podcasts', 'bookshelf', 'audiobookshelf', 'immich', 'romm', 'kavita', 'calibre', 'calibre-web', 'pinepods'] },
  { id: 'life', name: 'Everyday life', description: 'Home, money, food and trips.', color: '#b7e6c6', symbol: '✳', types: ['habits', 'kitchen', 'money', 'split', 'travel', 'garage', 'inventory', 'documents', 'invoicing', 'firefly'] },
]
export function spacesFor(prefs: Prefs): Space[] {
  return [...SPACES, ...(prefs.spaces || []).map(s => ({ ...s, description: 'A collection you made.', symbol: '✧' }))]
}
export function spaceTiles(space: Space, tiles: Tile[]): Tile[] {
  if (space.apps) return space.apps.map(k => tiles.find(t => t.key === k)).filter((t): t is Tile => !!t)
  return tiles.filter(t => space.types?.includes(t.type))
}

// Local intent matching: useful language, without sending a person's query anywhere.
const INTENTS: { words: string[]; types: string[]; hint: string }[] = [
  { words: ['cook', 'dinner', 'recipe', 'meal', 'groceries', 'shopping'], types: ['kitchen'], hint: 'Plan dinner' },
  { words: ['watch', 'movie', 'film', 'series', 'tv'], types: ['jellyfin', 'jellyseerr'], hint: 'Watch something' },
  { words: ['listen', 'music', 'song', 'album'], types: ['navidrome', 'podcasts', 'pinepods'], hint: 'Listen to music' },
  { words: ['read', 'book', 'reading'], types: ['bookshelf', 'kavita', 'calibre', 'calibre-web', 'audiobookshelf'], hint: 'Find a good read' },
  { words: ['plan', 'task', 'todo', 'focus', 'work'], types: ['tasks', 'day', 'notes', 'review'], hint: 'Plan my day' },
  { words: ['write', 'note', 'idea', 'brainstorm'], types: ['notes', 'docmost', 'excalidraw'], hint: 'Capture an idea' },
  { words: ['photo', 'photos', 'memories', 'picture'], types: ['immich'], hint: 'Revisit my photos' },
  { words: ['money', 'budget', 'expense', 'bill', 'spending'], types: ['money', 'split', 'firefly', 'invoicing'], hint: 'Check my spending' },
  { words: ['trip', 'travel', 'holiday', 'vacation'], types: ['travel'], hint: 'Plan a trip' },
  { words: ['habit', 'routine', 'streak'], types: ['habits'], hint: 'Build a routine' },
  { words: ['file', 'files', 'document', 'scan'], types: ['documents', 'paperless', 'nextcloud', 'filebrowser'], hint: 'Find my documents' },
  { words: ['play', 'game', 'gaming'], types: ['romm'], hint: 'Play a game' },
]
export function searchApps(tiles: Tile[], query: string): Tile[] {
  const q = query.trim().toLowerCase()
  if (!q) return tiles.slice(0, 12)
  const words: string[] = q.match(/[a-z0-9]+/g) || []
  const matched = INTENTS.filter(intent => intent.words.some(w => words.includes(w)))
  const specific = matched.filter(intent => intent.words.some(w => w !== 'plan' && words.includes(w)))
  const intents = specific.length ? specific : matched
  const ranks = tiles.map(t => {
    const name = t.name.toLowerCase().replace(/^pocket /, '')
    const text = `${t.name} ${t.type} ${t.group} ${t.description || ''}`.toLowerCase()
    const rank = name === q ? 100 : name.startsWith(q) ? 90 : text.includes(q) ? 80 : intents.some(intent => intent.types.includes(t.type)) ? 60 : words.length > 0 && words.every(w => text.includes(w)) ? 40 : 0
    return { t, rank }
  })
  return ranks.filter(r => r.rank).sort((a, b) => b.rank - a.rank).slice(0, 12).map(r => r.t)
}
export function intentHints(tiles: Tile[]): string[] {
  return INTENTS.filter(i => tiles.some(t => i.types.includes(t.type))).map(i => i.hint).slice(0, 5)
}
