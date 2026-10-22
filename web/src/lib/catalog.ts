import type { Tile } from './types'

// Plain-language words for every app a Pocket Box can carry. People choosing an
// app want to know what it is for, not what it is called upstream.
const ABOUT: Record<string, string> = {
  notes: 'Write things down and keep your ideas organized.',
  tasks: 'To-do lists and reminders for everything you need to do.',
  calendar: 'Your appointments and plans, shared with your household.',
  kitchen: 'Recipes, meal plans and the shopping list.',
  habits: 'Build good routines and keep your streaks going.',
  bookshelf: 'Keep track of the books you read and want to read.',
  podcasts: 'Follow and listen to your favorite shows.',
  money: 'See where your money goes and plan your budget.',
  split: 'Share costs with friends and settle up easily.',
  travel: 'Plan trips and keep memories from the road.',
  garage: 'Fuel, service and repairs for your vehicles.',
  inventory: 'Know what you own and where you put it.',
  day: 'A daily journal that writes itself from your day.',
  documents: 'Scan, store and find your paperwork.',
  files: 'Your files and folders, available everywhere.',
  office: 'Write documents, spreadsheets and presentations.',
  collaborator: 'Review documents and leave comments together.',
  invoicing: 'Create invoices and see who has paid.',
  clips: 'Everything you copied, saved and easy to find again.',
  subtitles: 'Subtitles for your movies and shows.',
  hub: 'Your Pocket Box home screen.',
  core: 'Manage people, apps and the box itself.',
  immich: 'Back up and browse all your photos and videos.',
  jellyfin: 'Watch your movies and TV shows.',
  jellyseerr: 'Ask for a movie or show to be added.',
  navidrome: 'Listen to your music collection.',
  audiobookshelf: 'Listen to audiobooks and podcasts.',
  kavita: 'Read comics, manga and e-books.',
  calibre: 'Your e-book library.',
  'calibre-web': 'Your e-book library.',
  nextcloud: 'Files, contacts and calendars in one place.',
  paperless: 'Scan, store and find your paperwork.',
  adguard: 'Blocks ads and trackers for every device at home.',
  romm: 'Your retro game collection.',
  dawarich: 'A private map of where you have been.',
  firefly: 'Track spending and budgets.',
  forgejo: 'Store code and projects.',
  searxng: 'Private web search.',
  kuma: 'Checks that everything is up and running.',
  backrest: 'Keeps backups of the box.',
}

export const friendlyName = (t: Pick<Tile, 'name'>) => t.name.replace(/^Pocket /, '')
export const aboutApp = (t: Tile) => ABOUT[t.type] || t.description || ''
export const isDown = (t: Tile) => t.status !== '' && t.status !== 'ok' && !!t.status
