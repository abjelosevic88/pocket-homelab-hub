// Service icons bundled with the hub (web/public/icons), so nothing is fetched
// from outside the box. Artwork: homarr-labs/dashboard-icons (Apache-2.0),
// keyed by Core catalog type. Pocket apps use the favicon Core reports.
const FILES: Record<string, string> = {
  adguard: 'adguard.svg', audiobookshelf: 'audiobookshelf.svg', backrest: 'backrest.png', bazarr: 'bazarr.svg', beszel: 'beszel.svg',
  calibre: 'calibre.svg', chaptarr: 'chaptarr.svg', changedetection: 'changedetection.svg', dawarich: 'dawarich.png', firefly: 'firefly.svg',
  forgejo: 'forgejo.svg', glances: 'glances.svg', homepage: 'homepage.png', immich: 'immich.svg', jellyfin: 'jellyfin.svg',
  jellyseerr: 'jellyseerr.svg', jellystat: 'jellystat.svg', kavita: 'kavita.svg', komodo: 'komodo.png', kuma: 'kuma.svg', maloja: 'maloja.png',
  lidarr: 'lidarr.png', lubelogger: 'lubelogger.png', metube: 'metube.svg', navidrome: 'navidrome.svg', nextcloud: 'nextcloud.svg', ntfy: 'ntfy.svg',
  nzbget: 'nzbget.svg', paperless: 'paperless.svg', pico: 'pico.svg', pinepods: 'pinepods.png', prowlarr: 'prowlarr.svg', qbittorrent: 'qbittorrent.svg',
  radarr: 'radarr.svg', sabnzbd: 'sabnzbd.svg', scrutiny: 'scrutiny.svg', searxng: 'searxng.svg', slskd: 'slskd.svg', sonarr: 'sonarr.svg',
  speedtest: 'speedtest.png', ssh: 'ssh.svg', truenas: 'truenas.svg',
  bookshelf: 'pocket-bookshelf.svg', clips: 'pocket-clips.svg', collaborator: 'pocket-collaborator.svg', day: 'pocket-day.svg', garage: 'pocket-garage.svg',
  habits: 'pocket-habits.svg', inventory: 'pocket-inventory.svg', invoicing: 'pocket-invoicing.svg', kitchen: 'pocket-kitchen.svg', money: 'pocket-money.svg',
  notes: 'pocket-notes.svg', podcasts: 'pocket-podcasts.svg', split: 'pocket-split.svg', subtitles: 'pocket-subtitles.svg', travel: 'pocket-travel.svg',
  documents: 'pocket-documents.svg', tasks: 'pocket-tasks.svg', core: 'pocket-core.svg', files: 'pocket-files.svg',
  office: 'pocket-office.svg', calendar: 'pocket-calendar.svg',
}

export function bundledIcon(type: string): string {
  const f = FILES[type]
  return f ? '/icons/' + f : ''
}

// A stable hue per name for letter tiles.
export function hueOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}
