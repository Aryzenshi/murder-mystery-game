import { CHARACTER_BY_ID } from '@shared/constants/characters';
import type { CardCategory } from '@shared/types';

/**
 * Original card artwork. Every weapon, room and suspect is drawn here as
 * vector line art — no external images, no stock art, no photography.
 */

const INK = '#2e1f14';
const INK_SOFT = 'rgba(46,31,20,0.55)';
const CREAM = '#f6ecda';

export function CardArt({
  art,
  category,
}: {
  art: string;
  category: CardCategory;
}) {
  if (category === 'weapon') return <WeaponArt kind={art.replace('weapon-', '')} />;
  if (category === 'room') return <RoomArt kind={art.replace('room-', '')} />;
  return <SuspectArt characterId={art.replace('suspect-', '')} />;
}

/* ------------------------------------------------------------------ *
 * Weapons
 * ------------------------------------------------------------------ */

function WeaponArt({ kind }: { kind: string }) {
  switch (kind) {
    case 'candlestick':
      return (
        <g stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round">
          <path d="M40 20 C34 26 34 32 40 36 C46 32 46 26 40 20 Z" fill="#f7e7b8" />
          <path d="M40 20 V15" strokeWidth="1" />
          <rect x="34" y="36" width="12" height="4" rx="1" fill="#c9a45c" />
          <path d="M40 40 V56" strokeWidth="2.4" />
          <ellipse cx="40" cy="59" rx="11" ry="4" fill="#c9a45c" />
          <path d="M51 52 C60 52 62 58 55 60" />
          <path d="M29 52 C20 52 18 58 25 60" />
          <path d="M36 44 H44" strokeWidth="0.9" stroke={INK_SOFT} />
        </g>
      );
    case 'dagger':
      return (
        <g stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 8 L46 26 L40 50 L34 26 Z" fill="#dcd6c8" />
          <path d="M40 12 V48" strokeWidth="0.8" stroke={INK_SOFT} />
          <path d="M26 50 H54" strokeWidth="3" />
          <rect x="36" y="52" width="8" height="10" rx="1.6" fill="#8a6a34" />
          <circle cx="40" cy="65" r="3.4" fill="#c9a45c" />
          <path d="M31 51 L49 51" strokeWidth="1" stroke={INK_SOFT} />
        </g>
      );
    case 'leadpipe':
      return (
        <g stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round">
          <rect x="12" y="30" width="56" height="14" rx="3" fill="#b9b3a4" />
          <path d="M12 33 H68" strokeWidth="0.9" stroke={INK_SOFT} />
          <ellipse cx="12" cy="37" rx="4.6" ry="9" fill="#cdc7b8" />
          <ellipse cx="68" cy="37" rx="4.6" ry="9" fill="#cdc7b8" />
          <ellipse cx="12" cy="37" rx="2" ry="4.6" fill="#6f6a5f" />
          <ellipse cx="68" cy="37" rx="2" ry="4.6" fill="#6f6a5f" />
          <path d="M20 30 V44 M60 30 V44" strokeWidth="0.9" stroke={INK_SOFT} />
        </g>
      );
    case 'revolver':
      return (
        <g stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="30" width="34" height="8" rx="2" fill="#8f9498" />
          <path d="M50 30 H62 V38 H50" fill="#a7acb0" />
          <circle cx="26" cy="42" r="10" fill="#b0b5b9" />
          <circle cx="26" cy="42" r="2.4" fill={INK} />
          <circle cx="26" cy="42" r="6" stroke={INK_SOFT} strokeWidth="0.8" />
          <path d="M20 48 C28 54 40 56 48 62" strokeWidth="2.6" />
          <path d="M44 46 C52 50 56 56 54 64 L44 60 Z" fill="#7a4a2c" />
          <path d="M16 26 H22" strokeWidth="1" />
        </g>
      );
    case 'rope':
      return (
        <g stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round">
          <path d="M40 12 C28 12 24 24 32 30 C40 36 44 24 36 24" />
          <path d="M40 12 C52 12 56 24 48 30" />
          <path d="M40 20 C48 26 48 38 40 44 C32 38 32 26 40 20 Z" fill="#cbae7e" />
          <path d="M40 44 C40 54 34 58 40 64 C46 58 40 54 40 44" />
          <path d="M34 26 L46 26 M36 34 L44 34" strokeWidth="0.8" stroke={INK_SOFT} />
        </g>
      );
    case 'wrench':
    default:
      return (
        <g stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 20 C34 14 46 14 52 20 L46 26 C42 22 38 22 34 26 Z" fill="#b9b3a4" />
          <path d="M40 26 V58" strokeWidth="5" stroke="#c6c0b1" />
          <path d="M40 26 V58" strokeWidth="1" stroke={INK} />
          <rect x="31" y="56" width="18" height="12" rx="2" fill="#8a6a34" />
          <path d="M35 60 V64 M45 60 V64" strokeWidth="0.9" stroke={INK_SOFT} />
          <path d="M22 30 H30 M52 30 H58" strokeWidth="1.2" />
        </g>
      );
  }
}

/* ------------------------------------------------------------------ *
 * Rooms
 * ------------------------------------------------------------------ */

function RoomArt({ kind }: { kind: string }) {
  const s = { stroke: INK, strokeWidth: 1.4, fill: 'none' as const, strokeLinejoin: 'round' as const };
  const soft = { stroke: INK_SOFT, strokeWidth: 0.8, fill: 'none' as const };
  switch (kind) {
    case 'study':
      return (
        <g {...s}>
          <rect x="10" y="14" width="26" height="46" fill="rgba(124,90,44,0.16)" />
          <path d="M10 26 H36 M10 38 H36" {...soft} />
          <path d="M14 26 V14 M22 26 V14 M30 26 V14" {...soft} />
          <path d="M46 44 H74 V66 H46 Z" fill="rgba(60,42,26,0.14)" />
          <path d="M46 44 H74" strokeWidth="2" />
          <path d="M50 66 V52 M70 66 V52" {...soft} />
          <path d="M56 44 V30 L60 26 L64 30 V44" />
          <path d="M56 44 H64" strokeWidth="1" />
          <path d="M52 34 H68" {...soft} />
        </g>
      );
    case 'hall':
      return (
        <g {...s}>
          <path d="M40 12 V26" strokeWidth="1" />
          <path d="M32 26 H48 L52 34 H28 Z" fill="#e8d9b4" />
          <circle cx="40" cy="34" r="4" fill="#f2e4bd" />
          <path d="M12 68 H30 V46 H12 Z" fill="rgba(124,90,44,0.12)" />
          <path d="M50 68 H68 V46 H50 Z" fill="rgba(124,90,44,0.12)" />
          <path d="M12 54 H30 M50 54 H68" {...soft} />
          <path d="M40 40 V68" {...soft} />
          <path d="M32 68 V54 M48 68 V54" {...soft} />
          <path d="M24 40 H56" strokeWidth="1" />
          <path d="M16 46 H26 M54 46 H64" {...soft} />
        </g>
      );
    case 'lounge':
      return (
        <g {...s}>
          <rect x="8" y="16" width="24" height="26" fill="rgba(60,42,26,0.18)" />
          <path d="M14 22 H26 V30 H14 Z" fill="#d9a45c" />
          <path d="M14 26 H26" {...soft} />
          <path d="M20 16 V10" strokeWidth="1" />
          <path d="M40 58 H74 V44 C74 38 68 36 62 36 H52 C46 36 40 38 40 44 Z" fill="rgba(124,90,44,0.16)" />
          <path d="M44 44 C44 40 48 38 52 38" {...soft} />
          <path d="M70 44 C70 40 66 38 62 38" {...soft} />
          <path d="M42 58 V64 M72 58 V64" strokeWidth="1.6" />
          <path d="M34 68 H78" {...soft} />
        </g>
      );
    case 'library':
      return (
        <g {...s}>
          <rect x="8" y="10" width="28" height="56" fill="rgba(124,90,44,0.16)" />
          <rect x="44" y="10" width="28" height="56" fill="rgba(124,90,44,0.16)" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <path d={`M8 ${20 + i * 13} H36 M44 ${20 + i * 13} H72`} {...soft} />
              <path
                d={`M11 ${12 + i * 13} h3 v8 h-3 z M16 ${11 + i * 13} h2.6 v9 h-2.6 z M20 ${13 + i * 13} h3.4 v7 h-3.4 z M25 ${10 + i * 13} h2.6 v10 h-2.6 z M29 ${12.5 + i * 13} h3.6 v7.5 h-3.6 z`}
                fill="rgba(109,34,51,0.28)"
                stroke="none"
              />
              <path
                d={`M47 ${12 + i * 13} h2.6 v8 h-2.6 z M51 ${10.5 + i * 13} h3.4 v9.5 h-3.4 z M56 ${13 + i * 13} h2.6 v7 h-2.6 z M60 ${11 + i * 13} h3 v9 h-3 z M65 ${12.5 + i * 13} h2.6 v7.5 h-2.6 z`}
                fill="rgba(34,69,47,0.3)"
                stroke="none"
              />
            </g>
          ))}
        </g>
      );
    case 'dining':
      return (
        <g {...s}>
          <path d="M14 44 H66 L60 52 H20 Z" fill="rgba(124,90,44,0.2)" />
          <path d="M20 52 V66 M60 52 V66" strokeWidth="1.6" />
          <path d="M8 40 H72" strokeWidth="1" />
          {[22, 36, 50].map((x) => (
            <g key={x}>
              <path d={`M${x - 6} 60 V54 h12 v6`} fill="rgba(60,42,26,0.14)" />
              <path d={`M${x - 6} 54 h12`} {...soft} />
            </g>
          ))}
          <path d="M40 40 V26" strokeWidth="1" />
          <path d="M32 26 H48" strokeWidth="1.6" />
          {[34, 40, 46].map((x) => (
            <path key={x} d={`M${x} 26 V20`} strokeWidth="1.4" />
          ))}
          <circle cx="34" cy="18" r="2" fill="#f1dfa8" stroke="none" />
          <circle cx="40" cy="16" r="2" fill="#f1dfa8" stroke="none" />
          <circle cx="46" cy="18" r="2" fill="#f1dfa8" stroke="none" />
        </g>
      );
    case 'billiard':
      return (
        <g {...s}>
          <path d="M10 30 H70 L64 56 H16 Z" fill="rgba(34,69,47,0.3)" />
          <path d="M10 30 H70" strokeWidth="2" />
          {[
            [24, 44],
            [34, 40],
            [44, 46],
            [54, 41],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.8" fill={i === 1 ? '#f3e6c8' : '#8a2f2f'} stroke={INK} strokeWidth="0.6" />
          ))}
          <path d="M16 56 V66 M64 56 V66" strokeWidth="1.6" />
          <path d="M56 12 L30 26" strokeWidth="2" />
          <path d="M56 12 L58 10" {...soft} />
          <circle cx="28" cy="27" r="1.6" fill="#c9a45c" stroke="none" />
        </g>
      );
    case 'kitchen':
      return (
        <g {...s}>
          <rect x="10" y="34" width="34" height="32" fill="rgba(60,42,26,0.16)" />
          <path d="M10 44 H44" {...soft} />
          <circle cx="20" cy="39" r="3" fill={INK_SOFT} />
          <circle cx="34" cy="39" r="3" fill={INK_SOFT} />
          <rect x="14" y="48" width="26" height="16" rx="1" fill="rgba(124,90,44,0.2)" />
          <path d="M27 48 V64" {...soft} />
          <path d="M52 26 H70 V40 H52 Z" fill="rgba(124,90,44,0.18)" />
          <path d="M50 40 H72" strokeWidth="1.4" />
          <path d="M56 22 C56 16 66 16 66 22" />
          <path d="M61 16 V12" strokeWidth="1" />
          <path d="M52 50 H74" strokeWidth="1" />
          <path d="M56 50 V58 M64 50 V56 M70 50 V59" strokeWidth="1" />
        </g>
      );
    case 'conservatory':
      return (
        <g {...s}>
          <path d="M8 22 H72 L60 12 H20 Z" fill="rgba(124,90,44,0.12)" />
          <path d="M20 22 L28 12 M40 22 V12 M52 22 L60 12" {...soft} />
          <path d="M8 22 V66 H72 V22" strokeWidth="1.6" />
          <path d="M40 22 V66" {...soft} />
          <path d="M8 40 H72" {...soft} />
          <path d="M40 62 V44" strokeWidth="1.6" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M40 48 C${30 - i * 2} ${44 + i * 3} ${26 - i * 3} ${36 + i * 3} ${24 - i * 4} ${30 + i * 4}`}
              strokeWidth="1.4"
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <path
              key={`r${i}`}
              d={`M40 48 C${50 + i * 2} ${44 + i * 3} ${54 + i * 3} ${36 + i * 3} ${56 + i * 4} ${30 + i * 4}`}
              strokeWidth="1.4"
            />
          ))}
          <path d="M34 62 H46 L44 68 H36 Z" fill="rgba(109,34,51,0.24)" />
        </g>
      );
    case 'ballroom':
    default:
      return (
        <g {...s}>
          <path d="M40 8 V20" strokeWidth="1" />
          <path d="M28 20 H52 L46 30 H34 Z" fill="#e8d9b4" />
          <circle cx="40" cy="30" r="3.4" fill="#f2e4bd" />
          <path d="M14 66 V34 C14 26 20 22 28 22 M66 66 V34 C66 26 60 22 52 22" strokeWidth="1.6" />
          <path d="M14 66 H30 M50 66 H66" {...soft} />
          <path d="M8 66 H72" strokeWidth="2" />
          <path d="M18 34 H26 M54 34 H62" {...soft} />
          <path d="M24 56 C30 50 34 58 40 52 C46 46 50 54 56 48" stroke="#8a6a34" strokeWidth="1.2" />
        </g>
      );
  }
}

/* ------------------------------------------------------------------ *
 * Suspects
 * ------------------------------------------------------------------ */

function SuspectArt({ characterId }: { characterId: string }) {
  const character = CHARACTER_BY_ID[characterId];
  const color = character?.color ?? '#6d2233';
  const shade = character?.shade ?? '#3a1a20';
  const light = character ? mix(color, '#ffffff', 0.32) : '#a1676f';
  return (
    <g>
      <circle cx="40" cy="38" r="31" fill={color} opacity="0.14" />
      <circle cx="40" cy="38" r="31" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <g clipPath="url(#portrait-clip)">
        <path d="M14 74 C14 56 26 50 40 50 C54 50 66 56 66 74 Z" fill={shade} />
        <path d="M30 52 L40 64 L50 52 C46 49 34 49 30 52 Z" fill={CREAM} />
        <path d="M40 64 L46 74 H34 Z" fill={light} />
        <circle cx="40" cy="36" r="15" fill={color} />
        <path d="M25 36 C25 24 33 18 40 18 C47 18 55 24 55 36 C55 30 48 26 40 26 C32 26 25 30 25 36 Z" fill={shade} />
        <PortraitHat token={character?.token ?? 'scholar'} color={color} shade={shade} light={light} />
        <path d="M34 40 h3 M43 40 h3" stroke={shade} strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
        <path d="M36 46 C38 47.6 42 47.6 44 46" stroke={shade} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6" />
      </g>
      <defs>
        <clipPath id="portrait-clip">
          <circle cx="40" cy="38" r="29" />
        </clipPath>
      </defs>
    </g>
  );
}

function PortraitHat({
  token,
  color,
  shade,
  light,
}: {
  token: string;
  color: string;
  shade: string;
  light: string;
}) {
  const stroke = { stroke: shade, strokeWidth: 1.3, strokeLinejoin: 'round' as const };
  switch (token) {
    case 'heirloom':
      return (
        <g {...stroke}>
          <ellipse cx="40" cy="24" rx="26" ry="5.4" fill={light} />
          <path d="M29 24 C28 12 32 6 40 6 C48 6 52 12 51 24 Z" fill={color} />
          <path d="M44 8 C56 2 66 4 70 9 C62 12 52 14 46 12 Z" fill="#efe4cb" strokeWidth="0.8" />
        </g>
      );
    case 'colonel':
      return (
        <g {...stroke}>
          <path d="M24 24 C24 10 31 4 40 4 C49 4 56 10 56 24 Z" fill={color} />
          <ellipse cx="40" cy="24" rx="21" ry="4.4" fill={shade} />
          <circle cx="40" cy="14" r="3.4" fill="#d8b878" strokeWidth="0.7" />
        </g>
      );
    case 'housekeeper':
      return (
        <g {...stroke}>
          <path d="M22 26 C20 8 30 2 40 2 C50 2 60 8 58 26 Z" fill={light} />
          <path d="M22 26 C28 30 52 30 58 26" fill="none" />
          <circle cx="57" cy="28" r="4.4" fill={CREAM} strokeWidth="0.8" />
        </g>
      );
    case 'businessman':
      return (
        <g {...stroke}>
          <path d="M26 24 C26 10 32 4 40 4 C48 4 54 10 54 24 Z" fill={color} />
          <ellipse cx="40" cy="24" rx="19" ry="4.6" fill={shade} />
          <path d="M30 14 H50" stroke={light} strokeWidth="1.6" />
        </g>
      );
    case 'socialite':
      return (
        <g {...stroke}>
          <ellipse cx="40" cy="23" rx="23" ry="5" fill={light} />
          <path d="M31 23 C30 8 34 2 40 2 C46 2 50 8 49 23 Z" fill={color} />
          <path d="M28 6 C18 -1 6 2 4 9 C14 10 24 10 30 8" fill="#efe4cb" strokeWidth="0.8" />
        </g>
      );
    case 'scholar':
    default:
      return (
        <g {...stroke}>
          <path d="M28 24 C28 12 33 6 40 6 C47 6 52 12 52 24 Z" fill={color} />
          <path d="M40 6 L68 15 L40 24 L12 15 Z" fill={shade} />
          <path d="M64 16 C69 22 70 28 68 32" fill="none" stroke="#d8b878" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
  }
}

function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}
