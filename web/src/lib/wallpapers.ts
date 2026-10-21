// Wallpapers are pure CSS: layered radial gradients that drift slowly.
export type Wallpaper = { id: string; name: string; css: string; accent: string }

export const WALLPAPERS: Wallpaper[] = [
  { id: 'dusk', name: 'Dusk', accent: '#8b7cf6', css: 'radial-gradient(120% 90% at 15% 10%, #4338ca 0%, transparent 55%), radial-gradient(90% 80% at 85% 20%, #be185d 0%, transparent 55%), radial-gradient(100% 100% at 50% 100%, #0f172a 0%, #020617 70%), #0b1020' },
  { id: 'aurora', name: 'Aurora', accent: '#34d399', css: 'radial-gradient(110% 80% at 10% 20%, #065f46 0%, transparent 55%), radial-gradient(90% 70% at 80% 10%, #0e7490 0%, transparent 55%), radial-gradient(80% 80% at 60% 90%, #4c1d95 0%, transparent 60%), #06121a' },
  { id: 'ocean', name: 'Ocean', accent: '#38bdf8', css: 'radial-gradient(120% 90% at 20% 0%, #0369a1 0%, transparent 55%), radial-gradient(90% 90% at 90% 40%, #1e3a8a 0%, transparent 55%), radial-gradient(100% 80% at 40% 100%, #042f2e 0%, transparent 60%), #04101f' },
  { id: 'ember', name: 'Ember', accent: '#fb923c', css: 'radial-gradient(110% 80% at 10% 10%, #7c2d12 0%, transparent 55%), radial-gradient(90% 90% at 90% 20%, #be123c 0%, transparent 55%), radial-gradient(100% 90% at 50% 100%, #1c1917 0%, #0c0a09 70%), #0c0a09' },
  { id: 'forest', name: 'Forest', accent: '#a3e635', css: 'radial-gradient(120% 90% at 15% 0%, #14532d 0%, transparent 55%), radial-gradient(90% 80% at 85% 30%, #365314 0%, transparent 55%), radial-gradient(100% 90% at 50% 100%, #052e16 0%, #020a05 70%), #020a05' },
  { id: 'rose', name: 'Rose', accent: '#f472b6', css: 'radial-gradient(110% 80% at 20% 10%, #9d174d 0%, transparent 55%), radial-gradient(90% 90% at 90% 20%, #6d28d9 0%, transparent 55%), radial-gradient(100% 90% at 50% 100%, #1e1b4b 0%, #0f0a1e 70%), #0f0a1e' },
  { id: 'graphite', name: 'Graphite', accent: '#a1a1aa', css: 'radial-gradient(120% 90% at 20% 0%, #3f3f46 0%, transparent 55%), radial-gradient(90% 90% at 90% 40%, #27272a 0%, transparent 55%), radial-gradient(100% 90% at 50% 100%, #18181b 0%, #09090b 70%), #09090b' },
  { id: 'sand', name: 'Sand', accent: '#fbbf24', css: 'radial-gradient(120% 90% at 20% 0%, #92400e 0%, transparent 55%), radial-gradient(90% 90% at 90% 30%, #78350f 0%, transparent 55%), radial-gradient(100% 90% at 50% 100%, #1c1917 0%, #0c0a09 70%), #0c0a09' },
]

export function wallpaper(id: string | undefined): Wallpaper {
  return WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0]
}
