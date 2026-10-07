import { useEffect, useState } from 'react';

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [30, 26],
    [30, 50],
    [30, 74],
    [70, 26],
    [70, 50],
    [70, 74],
  ],
};

export function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const timer = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(timer);
  }, [rolling, value]);

  return (
    <svg viewBox="0 0 100 100" className="die" data-rolling={rolling || undefined} aria-hidden="true">
      <rect x="4" y="4" width="92" height="92" rx="14" fill="#f7efdd" />
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="14"
        fill="none"
        stroke="rgba(46,31,20,0.5)"
        strokeWidth="2"
      />
      <rect
        x="9"
        y="9"
        width="82"
        height="82"
        rx="10"
        fill="none"
        stroke="rgba(177,131,74,0.6)"
        strokeWidth="1"
      />
      <path d="M12 14 C22 8 34 8 44 12" stroke="rgba(255,255,255,0.8)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {PIPS[face]?.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy + 1.5} r="9" fill="rgba(46,31,20,0.18)" />
          <circle cx={cx} cy={cy} r="9" fill="#2b1c12" />
          <circle cx={cx - 2.5} cy={cy - 3} r="2.6" fill="rgba(255,255,255,0.35)" />
        </g>
      ))}
    </svg>
  );
}

export function DiceTray({
  dice,
  rolling,
  movesLeft,
  label,
}: {
  dice: [number, number] | null;
  rolling: boolean;
  movesLeft: number;
  label?: string;
}) {
  const total = dice ? dice[0] + dice[1] : 0;
  return (
    <div className="dice-tray">
      <div className="dice-tray__dice">
        <Die value={dice?.[0] ?? 3} rolling={rolling} />
        <Die value={dice?.[1] ?? 5} rolling={rolling} />
      </div>
      <div className="dice-tray__read">
        {dice && !rolling ? (
          <>
            <span className="dice-tray__sum">
              {dice[0]} + {dice[1]} = <strong>{total}</strong>
            </span>
            {movesLeft > 0 && (
              <span className="dice-tray__left">
                {movesLeft} {movesLeft === 1 ? 'square' : 'squares'} left
              </span>
            )}
          </>
        ) : (
          <span className="dice-tray__sum dice-tray__sum--idle">{label ?? 'Dice'}</span>
        )}
      </div>
    </div>
  );
}
