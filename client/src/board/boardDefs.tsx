import { ROOMS, type FloorPattern } from '@shared/constants/board';

/**
 * Printed-board texture: paper grain, wood, brass and one floor pattern per
 * room so every room reads as a different floor covering.
 */

export function BoardDefs() {
  return (
    <defs>
      {/* ---- paper / board surface ---- */}
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
        <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
        <feComponentTransfer in="grey" result="soft">
          <feFuncA type="linear" slope="0.16" intercept="0" />
        </feComponentTransfer>
        <feComposite in="soft" in2="SourceGraphic" operator="in" />
      </filter>

      <linearGradient id="woodFrame" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stopColor="#5d4028" />
        <stop offset="45%" stopColor="#3a271c" />
        <stop offset="100%" stopColor="#1e140e" />
      </linearGradient>

      <linearGradient id="brassGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e3c489" />
        <stop offset="50%" stopColor="#b1834a" />
        <stop offset="100%" stopColor="#7c5a2c" />
      </linearGradient>

      <radialGradient id="tableLight" cx="50%" cy="18%" r="82%">
        <stop offset="0%" stopColor="rgba(255,240,210,0.20)" />
        <stop offset="60%" stopColor="rgba(255,240,210,0)" />
        <stop offset="100%" stopColor="rgba(30,18,10,0.34)" />
      </radialGradient>

      <filter id="tokenShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="0.09" stdDeviation="0.09" floodColor="#1a100a" floodOpacity="0.5" />
      </filter>

      <filter id="roomShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0.05" stdDeviation="0.08" floodColor="#3b2717" floodOpacity="0.35" />
      </filter>

      {/* ---- corridor floor ---- */}
      <pattern id="corridorFloor" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#efe2c6" />
        <rect width="1" height="1" fill="rgba(122,92,52,0.06)" />
        <path d="M0 0.5 H1 M0.5 0 V1" stroke="rgba(90,66,40,0.20)" strokeWidth="0.02" />
        <path
          d="M0 0 L0.5 0.5 L0 1"
          stroke="rgba(90,66,40,0.13)"
          strokeWidth="0.025"
          fill="none"
        />
      </pattern>

      <pattern id="boardPaper" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#f4e9d2" />
        <rect width="6" height="6" fill="url(#corridorFloor)" opacity="0.16" />
      </pattern>

      {/* ---- room floors ---- */}
      {ROOMS.map((room) => (
        <RoomPattern
          key={room.id}
          id={`floor-${room.id}`}
          tint={room.tint}
          kind={room.pattern}
        />
      ))}
    </defs>
  );
}

function RoomPattern({ id, tint, kind }: { id: string; tint: string; kind: FloorPattern }) {
  const line = 'rgba(58,39,28,0.26)';
  const soft = hexToRgba(tint, 0.16);
  const mid = hexToRgba(tint, 0.34);
  const strong = hexToRgba(tint, 0.6);

  switch (kind) {
    case 'parquet':
      return (
        <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill={soft} />
          <path d="M0 0.5 L0.5 0 M0.5 1 L1 0.5" stroke={mid} strokeWidth="0.035" fill="none" />
          <path d="M0 0 L0.5 0.5 M1 0 L0.5 0.5" stroke={hexToRgba(tint, 0.18)} strokeWidth="0.02" />
        </pattern>
      );
    case 'tile':
      return (
        <pattern id={id} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
          <rect width="0.5" height="0.5" fill={soft} />
          <rect
            x="0.02"
            y="0.02"
            width="0.46"
            height="0.46"
            fill="none"
            stroke={mid}
            strokeWidth="0.025"
          />
          <circle cx="0.25" cy="0.25" r="0.05" fill={hexToRgba(tint, 0.3)} />
        </pattern>
      );
    case 'carpet':
      return (
        <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill={soft} />
          <rect
            x="0.1"
            y="0.1"
            width="0.8"
            height="0.8"
            fill="none"
            stroke={strong}
            strokeWidth="0.05"
          />
          <path d="M0.2 0.5 H0.8 M0.5 0.2 V0.8" stroke={mid} strokeWidth="0.02" />
          <circle cx="0.5" cy="0.5" r="0.11" fill="none" stroke={mid} strokeWidth="0.03" />
        </pattern>
      );
    case 'rug':
      return (
        <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill={soft} />
          <rect
            x="0.14"
            y="0.14"
            width="0.72"
            height="0.72"
            fill="none"
            stroke={strong}
            strokeWidth="0.04"
          />
          <rect
            x="0.24"
            y="0.24"
            width="0.52"
            height="0.52"
            fill="none"
            stroke={mid}
            strokeWidth="0.025"
          />
          <circle cx="0.5" cy="0.5" r="0.09" fill={hexToRgba(tint, 0.28)} />
        </pattern>
      );
    case 'marble':
      return (
        <pattern id={id} width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill={soft} />
          <path
            d="M0 1.4 C0.5 1.1 0.7 1.7 1.2 1.3 S1.9 0.9 2 1.1"
            stroke={mid}
            strokeWidth="0.05"
            fill="none"
          />
          <path
            d="M0 0.4 C0.6 0.7 0.9 0.2 1.5 0.5 S1.9 0.8 2 0.75"
            stroke={hexToRgba(tint, 0.22)}
            strokeWidth="0.035"
            fill="none"
          />
          <path d="M0 1 H2 M1 0 V2" stroke={line} strokeWidth="0.02" />
        </pattern>
      );
    case 'glass':
      return (
        <pattern id={id} width="0.7" height="0.7" patternUnits="userSpaceOnUse">
          <rect width="0.7" height="0.7" fill={soft} />
          <path
            d="M0 0.35 L0.35 0 L0.7 0.35 L0.35 0.7 Z"
            fill="none"
            stroke={mid}
            strokeWidth="0.03"
          />
          <path d="M0 0 L0.7 0.7 M0.7 0 L0 0.7" stroke={hexToRgba(tint, 0.16)} strokeWidth="0.02" />
        </pattern>
      );
    case 'plank':
      return (
        <pattern id={id} width="1" height="0.5" patternUnits="userSpaceOnUse">
          <rect width="1" height="0.5" fill={soft} />
          <path d="M0 0.5 H1" stroke={mid} strokeWidth="0.03" />
          <path d="M0.3 0 V0.5 M0.8 0.25 V0.5" stroke={mid} strokeWidth="0.022" />
        </pattern>
      );
    case 'checker':
      return (
        <pattern id={id} width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <rect width="0.6" height="0.6" fill={soft} />
          <rect width="0.3" height="0.3" fill={hexToRgba(tint, 0.2)} />
          <rect x="0.3" y="0.3" width="0.3" height="0.3" fill={hexToRgba(tint, 0.2)} />
        </pattern>
      );
    case 'inlay':
    default:
      return (
        <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill={soft} />
          <path d="M0.5 0.15 L0.85 0.5 L0.5 0.85 L0.15 0.5 Z" fill="none" stroke={mid} strokeWidth="0.035" />
          <circle cx="0.5" cy="0.5" r="0.13" fill="none" stroke={strong} strokeWidth="0.03" />
          <circle cx="0.5" cy="0.5" r="0.05" fill={hexToRgba(tint, 0.4)} />
        </pattern>
      );
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
