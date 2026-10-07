/** Minimal line icons (24×24, currentColor). */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const I = ({ d, children }: { d?: string; children?: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...P}>
    {d ? <path d={d} /> : children}
  </svg>
)

export const IconSun = () => (
  <I>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </I>
)
export const IconMoon = () => <I d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
export const IconShadow = () => (
  <I>
    <circle cx="9" cy="9" r="5" />
    <path d="M11 21h10M13 17h8M15 13h6" />
  </I>
)
export const IconPlan = () => (
  <I>
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
  </I>
)
export const IconWalk = () => (
  <I>
    <circle cx="13" cy="4" r="1.6" />
    <path d="M10 21l2-6 3 3v3M9 11l3-3 3 2 2 3M12 8l-1 5" />
  </I>
)
export const IconOrbit = () => (
  <I>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <circle cx="12" cy="12" r="2" />
  </I>
)
export const IconCamera = () => (
  <I>
    <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </I>
)
export const IconRestore = () => <I d="M4 4v6h6M4.5 10A8 8 0 1 1 6 17" />
export const IconClose = () => <I d="M6 6l12 12M18 6L6 18" />
export const IconLayers = () => (
  <I>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
  </I>
)
export const IconSettings = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </I>
)
export const IconCompare = () => (
  <I>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M12 5v14" />
  </I>
)
export const IconCheck = () => <I d="M5 12.5l4.5 4.5L19 7.5" />
export const IconBack = () => <I d="M15 5l-7 7 7 7" />
export const IconSunset = () => (
  <I>
    <path d="M7.5 16a4.5 4.5 0 0 1 9 0" />
    <path d="M3 19h18M12 6.5V9M5.6 10.1l1.6 1.6M18.4 10.1l-1.6 1.6M2.5 16h2M19.5 16h2" />
  </I>
)
export const IconPlay = () => <I d="M8 5.5v13l10.5-6.5z" />
export const IconStop = () => (
  <I>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </I>
)
export const IconFocus = () => <I d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
