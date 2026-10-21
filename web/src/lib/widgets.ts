export type WidgetSize = 'small' | 'medium' | 'large'
export type WidgetKind = 'tasks-today' | 'habit-progress' | 'meal-plan' | 'recent-notes' | 'clock' | 'calendar' | 'focus' | 'favorites' | 'recent' | 'activity' | 'space' | 'shortcut' | 'note' | 'checklist' | 'countdown' | 'photo' | 'health' | 'box' | 'discover'
export type WidgetConfig = {
  title?: string; timezone?: string; clockStyle?: 'digital' | 'analog'; appKey?: string; spaceId?: string
  note?: string; items?: { id: string; text: string; done: boolean }[]; targetDate?: string; photoUrl?: string
}
export type HomeWidget = { id: string; kind: WidgetKind; size: WidgetSize; config: WidgetConfig }
export type WidgetDefinition = { kind: WidgetKind; name: string; description: string; category: 'Everyday' | 'Your apps' | 'Personal' | 'Your box'; symbol: string; tone: string; sizes: WidgetSize[]; initial: WidgetSize }
export const MAX_WIDGETS = 24
export const WIDGETS: WidgetDefinition[] = [
  { kind: 'tasks-today', name: 'Tasks today', description: 'Your real tasks and due counts from Pocket Tasks. Dates follow your Tasks time zone.', category: 'Your apps', symbol: '☑', tone: 'sage', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'habit-progress', name: 'Habit progress', description: 'Your scheduled habits and today’s check-ins from Pocket Habits.', category: 'Your apps', symbol: '◉', tone: 'lavender', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'meal-plan', name: 'Meal plan', description: 'What you have planned for today in Pocket Kitchen.', category: 'Your apps', symbol: '♧', tone: 'peach', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'recent-notes', name: 'Recent notes', description: 'Pick up a thought from your latest Pocket Notes documents.', category: 'Your apps', symbol: '✎', tone: 'butter', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'clock', name: 'Clock', description: 'Your time, or somewhere you love. Analog and digital faces with a choice of time zone.', category: 'Everyday', symbol: '◷', tone: 'cream', sizes: ['small', 'medium'], initial: 'small' },
  { kind: 'calendar', name: 'Calendar', description: 'A little perspective on the month. A date calendar, without appointments or account setup.', category: 'Everyday', symbol: '▦', tone: 'paper', sizes: ['small', 'medium', 'large'], initial: 'small' },
  { kind: 'focus', name: 'Focus', description: 'Start a quiet session, pause it, and come back when you’re ready. Uses your existing focus timer.', category: 'Everyday', symbol: '◈', tone: 'sage', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'favorites', name: 'Favorites', description: 'The apps pinned to your dock, right where you need them.', category: 'Your apps', symbol: '☆', tone: 'glass', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'recent', name: 'Recently opened', description: 'Pick up where you left off. Uses your history in this browser.', category: 'Your apps', symbol: '↺', tone: 'glass', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'activity', name: 'Activity', description: 'Recent moments from your connected apps, using your existing activity permissions.', category: 'Your apps', symbol: '≋', tone: 'glass', sizes: ['medium', 'large'], initial: 'medium' },
  { kind: 'space', name: 'Space', description: 'Keep a favorite space close: your work, evening plans or a collection you made.', category: 'Your apps', symbol: '✳', tone: 'lavender', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'shortcut', name: 'App shortcut', description: 'Give one app a place of its own. Opens inside your Pocket Box workspace.', category: 'Your apps', symbol: '↗', tone: 'glass', sizes: ['small', 'medium'], initial: 'small' },
  { kind: 'note', name: 'Quick note', description: 'A thought, a reminder, a little encouragement. A personal note saved to your account.', category: 'Personal', symbol: '✎', tone: 'butter', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'checklist', name: 'Checklist', description: 'A small list for the day. Add items and check them off without opening an app.', category: 'Personal', symbol: '☑', tone: 'paper', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'countdown', name: 'Countdown', description: 'A birthday, a trip, something to look forward to. Count the days to your own date.', category: 'Personal', symbol: '◴', tone: 'peach', sizes: ['small', 'medium', 'large'], initial: 'small' },
  { kind: 'photo', name: 'Photo frame', description: 'A picture that feels like home. Bring your own HTTPS image address.', category: 'Personal', symbol: '▧', tone: 'photo', sizes: ['small', 'medium', 'large'], initial: 'medium' },
  { kind: 'health', name: 'App health', description: 'The latest available health checks for apps in your profile. Unchecked apps are labeled separately.', category: 'Your box', symbol: '◉', tone: 'sage', sizes: ['small', 'medium', 'large'], initial: 'small' },
  { kind: 'box', name: 'Your Box', description: 'Your Box’s name, Core version and Core uptime, read from its live connection.', category: 'Your box', symbol: '▣', tone: 'glass', sizes: ['small', 'medium'], initial: 'small' },
  { kind: 'discover', name: 'Something to do', description: 'Find an app by what you want to do: cook, read, listen or capture an idea.', category: 'Your apps', symbol: '✦', tone: 'lavender', sizes: ['medium', 'large'], initial: 'medium' },
]
export const widgetDefinition = (kind: WidgetKind) => WIDGETS.find(w => w.kind === kind)!
export const widgetName = (w: HomeWidget) => w.config.title || widgetDefinition(w.kind).name
export const DEFAULT_WIDGETS: HomeWidget[] = [
  { id: 'home-clock', kind: 'clock', size: 'small', config: { clockStyle: 'analog' } },
  { id: 'home-calendar', kind: 'calendar', size: 'small', config: {} },
  { id: 'home-focus', kind: 'focus', size: 'medium', config: {} },
  { id: 'home-favorites', kind: 'favorites', size: 'medium', config: {} },
  { id: 'home-note', kind: 'note', size: 'medium', config: {} },
  { id: 'home-activity', kind: 'activity', size: 'medium', config: {} },
  { id: 'home-health', kind: 'health', size: 'small', config: {} },
  { id: 'home-countdown', kind: 'countdown', size: 'small', config: {} },
]
// Ignore unknown future widget types, duplicate IDs and unsupported sizes without
// resetting an intentionally empty home. Config is bounded by the editors.
export function homeWidgets(saved: HomeWidget[] | undefined): HomeWidget[] {
  if (!Array.isArray(saved)) return DEFAULT_WIDGETS.map(w => ({ ...w, config: { ...w.config } }))
  const seen = new Set<string>()
  return saved.filter(w => {
    if (!w || typeof w.id !== 'string' || seen.has(w.id) || !WIDGETS.some(d => d.kind === w.kind)) return false
    seen.add(w.id); return true
  }).slice(0, MAX_WIDGETS).map(w => ({ ...w, size: widgetDefinition(w.kind).sizes.includes(w.size) ? w.size : widgetDefinition(w.kind).initial, config: cleanConfig(w.config) }))
}
export function moveWidget(list: HomeWidget[], id: string, target: number): HomeWidget[] {
  const from = list.findIndex(w => w.id === id)
  if (from < 0) return list
  const next = [...list], [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(target, next.length)), 0, item)
  return next
}
export function daysUntil(date: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1, d))
  if (target.getUTCFullYear() !== y || target.getUTCMonth() !== m - 1 || target.getUTCDate() !== d) return null
  return Math.round((target.getTime() - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}
export function validImageURL(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password } catch { return false }
}

function cleanConfig(value: WidgetConfig): WidgetConfig {
  if (!value || typeof value !== 'object') return {}
  const out: WidgetConfig = {}
  const fields = { title: 40, timezone: 80, appKey: 200, spaceId: 200, note: 500, targetDate: 10, photoUrl: 1024 } as const
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (typeof value[key] === 'string') out[key] = value[key]!.slice(0, fields[key])
  }
  if (value.clockStyle === 'analog' || value.clockStyle === 'digital') out.clockStyle = value.clockStyle
  if (Array.isArray(value.items)) {
    const seen = new Set<string>()
    out.items = value.items.filter(item => {
      if (!item || typeof item.id !== 'string' || seen.has(item.id) || typeof item.text !== 'string') return false
      seen.add(item.id); return true
    }).slice(0, 12).map(item => ({ id: item.id.slice(0, 100), text: item.text.slice(0, 100), done: item.done === true }))
  }
  return out
}
