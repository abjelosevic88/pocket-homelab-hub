export const BRAND_ICON = '/pocket-box.png'

export function Brand({ name = 'Pocket Box', compact = false }: { name?: string; compact?: boolean }) {
  return <span className={`pocket-brand ${compact ? 'compact-brand' : ''}`}>
    <img src={BRAND_ICON} width={40} height={40} alt="" />
    <span><strong>{name}</strong><small>by Pocket Homelab</small></span>
  </span>
}
