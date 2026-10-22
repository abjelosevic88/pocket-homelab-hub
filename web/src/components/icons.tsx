// Small inline glyphs for the chrome (no icon font). One stroke weight, 24px grid.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
type I = { size?: number }
const svg = (size: number, children: React.ReactNode) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...P}>{children}</svg>

export const Home = ({ size = 20 }: I) => svg(size, <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" /></>)
export const Grid = ({ size = 20 }: I) => svg(size, <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>)
export const Sun = ({ size = 20 }: I) => svg(size, <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>)
export const Moon = ({ size = 20 }: I) => svg(size, <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />)
export const Monitor = ({ size = 20 }: I) => svg(size, <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>)
export const Calendar = ({ size = 20 }: I) => svg(size, <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>)
export const Bell = ({ size = 20 }: I) => svg(size, <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>)
export const Pulse = Bell
export const Help = ({ size = 20 }: I) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" /></>)
export const Gear = ({ size = 20 }: I) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>)
export const Search = ({ size = 18 }: I) => svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>)
export const Plus = ({ size = 18 }: I) => svg(size, <path d="M12 5v14M5 12h14" />)
export const X = ({ size = 18 }: I) => svg(size, <path d="M6 6l12 12M18 6 6 18" />)
export const Pin = ({ size = 18 }: I) => svg(size, <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />)
export const EyeOff = ({ size = 18 }: I) => svg(size, <path d="M3 3l18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.6 3.9M6.6 6.6A11 11 0 0 0 2 12c1 3 5 7 10 7a9.8 9.8 0 0 0 4.1-.9" />)
export const Eye = ({ size = 18 }: I) => svg(size, <><path d="M2 12c1-3 5-7 10-7s9 4 10 7c-1 3-5 7-10 7S3 15 2 12z" /><circle cx="12" cy="12" r="3" /></>)
export const External = ({ size = 16 }: I) => svg(size, <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />)
export const ChevL = ({ size = 16 }: I) => svg(size, <path d="m14 6-6 6 6 6" />)
export const ChevR = ({ size = 16 }: I) => svg(size, <path d="m10 6 6 6-6 6" />)
export const Check = ({ size = 16 }: I) => svg(size, <path d="m5 12 4.5 4.5L19 7" />)
export const Refresh = ({ size = 16 }: I) => svg(size, <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />)
export const Dots = ({ size = 18 }: I) => svg(size, <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>)
export const Task = ({ size = 22 }: I) => svg(size, <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>)
export const Note = ({ size = 22 }: I) => svg(size, <><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8.5 12.5h7M8.5 16h5" /></>)
export const Journal = ({ size = 22 }: I) => svg(size, <><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A1.5 1.5 0 0 1 6 18z" /><path d="M6 18a1.5 1.5 0 0 1 1.5-1.5h11M10 8h5" /></>)
export const Timer = ({ size = 22 }: I) => svg(size, <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M10 2.5h4" /></>)
export const Logout = ({ size = 18 }: I) => svg(size, <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />)
export const Phone = ({ size = 20 }: I) => svg(size, <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></>)
export const Shield = ({ size = 20 }: I) => svg(size, <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z" />)
export const Spark = ({ size = 18 }: I) => svg(size, <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />)
export const Logo = ({ size = 22 }: { size?: number }) => <img src="/pocket-box.png" alt="" width={size} height={size} style={{ display: 'block' }} />
