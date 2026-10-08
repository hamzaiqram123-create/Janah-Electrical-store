import type { ReactNode } from "react";

/** 24×24 stroke icons. Directional icons (chev, arrow) point "forward" and flip automatically in RTL. */
const P: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cart: <><path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.1L20 8H6.3" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1-4 4.5-6 8-6s7 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.7-3.6 3.4-5.5 6.5-5.5s5.8 1.9 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chev: <path d="m9 5 7 7-7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  home: <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  truck: <><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.3 7.8 8 9 4.7-1.2 8-4.5 8-9V6l-8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  box: <><path d="m12 3 9 4.5v9L12 21l-9-4.5v-9L12 3Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  print: <><path d="M7 8V3h10v5M7 17H4V9h16v8h-3" /><rect x="7" y="14" width="10" height="7" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  upload: <path d="M12 16V4m-5 5 5-5 5 5M4 20h16" />,
  edit: <path d="M4 20h4L19.500 8.500a2.100 2.100 0 0 0-3-3L5 17l-1 3ZM14 7l3 3" />,
  eye: <><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 20a2 2 0 0 0 4 0" />,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100" /></>,
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-7M20 16v-3" />,
  barcode: <path d="M4 5v14M7 5v14M10 5v10M13 5v14M15.500 5v10M18 5v14M20.500 5v14" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" /><circle cx="12" cy="13" r="3.500" /></>,
  refresh: <path d="M20 5v5h-5M4 19v-5h5M19 10a7.500 7.500 0 0 0-13-3M5 14a7.500 7.500 0 0 0 13 3" />,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" />,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="1.500" /><circle cx="12" cy="12" r="2.500" /><path d="M6 9v6M18 9v6" /></>,
  alert: <><path d="M12 4 2.500 20h19L12 4Z" /><path d="M12 10v4M12 17v.500" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.500V8" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.500" /><path d="M16 8V4H4v12h4" /></>,
  play: <path d="M7 4v16l13-8L7 4Z" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.500M4 12h.500M4 18h.500" />,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.500" /><circle cx="17" cy="17" r="2.500" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.500" cy="9.500" r="1.500" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  file: <path d="M6 3h8l4 4v14H6V3ZM14 3v4h4M9 12h6M9 16h6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="1.500" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  swap: <path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4 4-4-4 4-4" />,
  store: <path d="M4 10v10h16V10M3 10l2-6h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0ZM10 20v-5h4v5" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 .900-1 1.700M12 17v.500" /></>,
  undo: <path d="M8 5 4 9l4 4M4 9h10a5 5 0 0 1 0 10h-3" />,
  zoom: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.500-3.500M11 8v6M8 11h6" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />,
  whatsapp: <><path d="M4 20l1.300-4.300A8 8 0 1 1 8.400 18.800L4 20Z" /><path d="M9 8.500c0 3.500 3 6.500 6.500 6.500l1-1.500-2-1-1 .800c-1-.400-1.800-1.300-2.300-2.300l.800-1-1-2L9 8.500Z" /></>,
};

export function Icon({ name, size = 20, className = "", flip = false }: { name: string; size?: number; className?: string; flip?: boolean }) {
  const directional = name === "chev" || name === "arrow" || flip;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${directional ? "rtl:-scale-x-100" : ""} ${className}`} aria-hidden="true">
      {P[name] ?? P.box}
    </svg>
  );
}

/** Line drawings of electrical product families. Used for category tiles and as the placeholder when a product has no photo. */
const G: Record<string, ReactNode> = {
  switch: <><rect x="5" y="3" width="14" height="18" rx="2" /><rect x="9" y="7" width="6" height="10" rx="1" /><path d="M9 12h6" /></>,
  socket: <><rect x="4" y="4" width="16" height="16" rx="2.500" /><path d="M12 7.500v2.500M8.500 13v2.500M15.500 13v2.500" /></>,
  led: <><rect x="3" y="9" width="18" height="6" rx="1" /><path d="M6 12h.500M9.200 12h.500M12.400 12h.500M15.600 12h.500M18.300 12h.500M5 6l1 1.500M12 5v2M19 6l-1 1.500" /></>,
  bulb: <><path d="M8.500 15a6 6 0 1 1 7 0c-.600.500-1 1.200-1 2h-5c0-.800-.400-1.500-1-2Z" /><path d="M9.500 19.500h5M10.500 22h3" /></>,
  ceiling: <><path d="M4 4h16M12 4v3" /><path d="M5 14a7 7 0 0 1 14 0H5Z" /><path d="M9.500 17a2.500 2.500 0 0 0 5 0" /></>,
  downlight: <><circle cx="12" cy="12" r="8.500" /><circle cx="12" cy="12" r="4.500" /><path d="M12 9.500v5M9.500 12h5" /></>,
  flood: <><rect x="5" y="4" width="14" height="10" rx="1" /><path d="M8 7h8M8 10h8M9 14l-2 6h10l-2-6" /></>,
  outdoor: <><path d="M12 2v3M8 5h8l2 8H6l2-8Z" /><path d="M9.500 13v3a2.500 2.500 0 0 0 5 0v-3M12 18.500V22" /></>,
  cable: <><circle cx="9" cy="12" r="6.500" /><circle cx="9" cy="12" r="2.500" /><path d="M15.500 12c3 0 3 6 6 6" /></>,
  breaker: <><rect x="7" y="2.500" width="10" height="19" rx="1.500" /><rect x="10" y="8.500" width="4" height="6.500" rx=".800" /><path d="M10 6h4M10 18.500h4" /></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="1.500" /><path d="M3 9h18M3 16h18M7 9v7M11 9v7M15 9v7M19 9v7" /></>,
  contactor: <><rect x="5" y="4" width="14" height="16" rx="1.500" /><path d="M5 9h14M5 15h14M9 4v5M15 4v5M9 15v5M15 15v5" /><rect x="10" y="10.800" width="4" height="2.400" /></>,
  relay: <><rect x="4" y="6" width="16" height="11" rx="1.500" /><path d="M8 17v4M12 17v4M16 17v4M8 11.500h3l3-2.500M15 11.500h1.500" /></>,
  accessory: <><path d="M5 8h6v8H5z" /><path d="M11 10h3l2-2h3v8h-3l-2-2h-3" /><path d="M2.500 10.500H5M2.500 13.500H5" /></>,
  extension: <><rect x="2.500" y="8" width="15" height="8" rx="2" /><circle cx="6.500" cy="12" r="1.300" /><circle cx="10.500" cy="12" r="1.300" /><circle cx="14" cy="12" r="1.300" /><path d="M17.500 12c2.500 0 2 5 4.500 5" /></>,
  plug: <><path d="M9 2.500v5M15 2.500v5" /><path d="M6.500 7.500h11v4a5.500 5.500 0 0 1-11 0v-4Z" /><path d="M12 17v4.500" /></>,
  fan: <><circle cx="12" cy="12" r="2" /><path d="M12 10c-1-4 1-7 3.500-7s2 5-1.500 7.500M13.700 13c3 2.800 3.200 6.200 1 7.500s-4.500-3-3.200-7.300M10.300 13C6.500 14.500 3.500 13 3.500 10.500S8.500 8 10.700 10.600" /></>,
  tool: <><path d="M14.500 5.500a4 4 0 0 0 4.800 4.800L21 12l-9 9-1.700-1.700M4 20l8.500-8.500" /><path d="M3 5l3-2 4.500 4.500L8.500 9.500 3 5Z" /></>,
  safety: <><path d="M4 16a8 8 0 0 1 16 0" /><path d="M2.500 16h19v2.500h-19zM10 8.300V4.500h4v3.800" /></>,
  smart: <><rect x="6" y="2.500" width="12" height="19" rx="2" /><path d="M9.500 13.500a3.500 3.500 0 0 1 5 0M11 16a1.500 1.500 0 0 1 2 0M12 18.500v.200M8.300 11a5.300 5.300 0 0 1 7.400 0" /></>,
  other: <><path d="M13 2 5 13h6l-1 9 9-12h-6l1-8Z" /></>,
};
export const GLYPHS = Object.keys(G);

export function Glyph({ name, size = 28, className = "", strokeWidth = 1.5 }: { name?: string | null; size?: number | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      {G[name ?? ""] ?? G.other}
    </svg>
  );
}
