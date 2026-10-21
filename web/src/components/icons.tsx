// Small inline glyphs for the chrome (no icon font).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
export const Grid = () => <svg viewBox="0 0 24 24" width="22" height="22" {...P}><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>
export const Pulse = () => <svg viewBox="0 0 24 24" width="22" height="22" {...P}><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></svg>
export const Gear = () => <svg viewBox="0 0 24 24" width="22" height="22" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
export const Search = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
export const X = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const Pin = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M12 17v5M8 4h8l-1 6 3 3H6l3-3z" /></svg>
export const EyeOff = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M3 3l18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.6 3.9M6.6 6.6A11 11 0 0 0 2 12c1 3 5 7 10 7a9.8 9.8 0 0 0 4.1-.9" /></svg>
export const Eye = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M2 12c1-3 5-7 10-7s9 4 10 7c-1 3-5 7-10 7S3 15 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
export const External = () => <svg viewBox="0 0 24 24" width="16" height="16" {...P}><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
export const ChevL = () => <svg viewBox="0 0 24 24" width="16" height="16" {...P}><path d="m14 6-6 6 6 6" /></svg>
export const ChevR = () => <svg viewBox="0 0 24 24" width="16" height="16" {...P}><path d="m10 6 6 6-6 6" /></svg>
export const Check = () => <svg viewBox="0 0 24 24" width="16" height="16" {...P}><path d="m5 12 4.5 4.5L19 7" /></svg>
export const Refresh = () => <svg viewBox="0 0 24 24" width="16" height="16" {...P}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
export const Home = () => <svg viewBox="0 0 24 24" width="22" height="22" {...P}><path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" /></svg>
export const Spark = () => <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
export const Logo = ({ size = 22 }: { size?: number }) => <img src="/pocket-ember.png" alt="" width={size} height={size} style={{ display: 'block' }} />
