export type User = { id: number; email: string; name: string; role: 'admin' | 'member'; created_at: string }

export type AuthStatus = {
  needs_setup: boolean
  auth_mode: string
  authenticated: boolean
  user: User | null
  version: string
  title: string
  oidc: boolean
  oidc_name: string
  password_login: boolean
  core: boolean
}

export type Tile = {
  key: string
  id: number
  type: string
  slug?: string
  name: string
  group: string
  url: string
  open_url: string
  icon: string
  pocket: boolean
  status: '' | 'ok' | 'down' | string
  version?: string
  description?: string
  last_seen_at?: string
  last_error?: string
  publishes?: string[]
}

export type Box = {
  name: string
  core_url: string
  core_version?: string
  core_uptime_s?: number
  counts?: Record<string, number>
  apps_up: number
  apps_checked: number
}

export type Prefs = {
  spaces?: { id: string; name: string; color: string; apps: string[] }[]
  active_space?: string
  wallpaper?: string
  wallpaper_url?: string
  density?: 'cozy' | 'compact'
  labels?: boolean
  group?: boolean
  clock24?: boolean
  order?: string[]
  dock?: string[]
  hidden?: string[]
}

export type Launcher = {
  me: User
  prefs: Prefs
  core: 'ok' | 'reconnect' | 'unconfigured' | 'unreachable'
  error?: string
  apps: Tile[]
  box?: Box
  refresh_seconds: number
}

export type CoreEvent = {
  id: number
  topic: string
  source: string
  subject: string
  payload: Record<string, unknown>
  created_at: string
}

export type Activity = { events: CoreEvent[]; scope: 'box' | 'mine' | 'none'; error?: string }
