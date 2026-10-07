import { memo, useState } from 'react';
import { CARD_BY_ID } from '@shared/constants/cards';
import type { CardId } from '@shared/types';
import { CardArt } from './CardArt';
import { cardArtUrl } from './artAssets';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const ACCENT: Record<string, string> = {
  suspect: '#6d2233',
  weapon: '#3d352c',
  room: '#22452f',
};

interface CardProps {
  cardId: CardId;
  size?: CardSize;
  faceDown?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  deal?: number;
  title?: string;
}

function CardInner({
  cardId,
  size = 'md',
  faceDown = false,
  onClick,
  selected,
  disabled,
  dimmed,
  deal = 0,
  title,
}: CardProps) {
  const card = CARD_BY_ID[cardId];
  const accent = ACCENT[card?.category ?? 'room'];
  const interactive = !!onClick && !disabled;
  return (
    <div
      className="card"
      data-size={size}
      data-face={faceDown ? 'down' : 'up'}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      data-dim={dimmed || undefined}
      style={{
        animationDelay: deal ? `${deal * 70}ms` : undefined,
        // @ts-expect-error custom property
        '--accent': accent,
      }}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      title={title ?? card?.name}
      aria-label={faceDown ? 'Face down card' : card?.name}
    >
      {faceDown ? <CardBack /> : <CardFace cardId={cardId} />}
    </div>
  );
}

/**
 * Optional raster artwork, layered over the vector drawing.
 *
 * The game ships with original vector art for every card. If a picture has
 * been dropped into `public/art/cards/` for this card it is shown instead; if
 * the file is missing or broken the drawing underneath simply shows through, so
 * the cards never break.
 */
function ArtImage({ cardId }: { cardId: CardId }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      className="card__img"
      src={cardArtUrl(cardId)}
      alt=""
      draggable={false}
      data-room={cardId.startsWith('room:') ? true : undefined}
      onError={() => setBroken(true)}
    />
  );
}

function CardFace({ cardId }: { cardId: CardId }) {
  const card = CARD_BY_ID[cardId];
  if (!card) return null;
  const words = card.name.split(' ');
  return (
    <>
      <div className="card__head">
        <span className="card__cat">{card.category}</span>
      </div>
      <div className="card__rule" />
      <div className="card__art">
        <svg viewBox="0 0 80 74" className="card__art-svg" aria-hidden="true">
          <CardArt art={card.art} category={card.category} />
        </svg>
        <ArtImage cardId={cardId} />
      </div>
      <div className="card__name">
        {words.length > 2 ? (
          <>
            <span>{words[0]}</span>
            <span>{words.slice(1).join(' ')}</span>
          </>
        ) : (
          words.map((word, i) => <span key={i}>{word}</span>)
        )}
      </div>
    </>
  );
}

export function CardBack() {
  const rosette = Array.from({ length: 22 }, (_, i) => i * (180 / 22));
  return (
    <svg viewBox="0 0 100 150" className="card__back" aria-hidden="true">
      <rect width="100" height="150" fill="#5b1b28" />
      <rect width="100" height="150" fill="url(#none)" />
      <g transform="translate(50 75)" stroke="#c79c5e" fill="none" opacity="0.42">
        {rosette.map((angle) => (
          <ellipse key={angle} rx="30" ry="9" transform={`rotate(${angle})`} strokeWidth="0.5" />
        ))}
        {rosette.map((angle) => (
          <ellipse key={`b${angle}`} rx="18" ry="6" transform={`rotate(${angle + 4})`} strokeWidth="0.4" />
        ))}
      </g>
      <circle cx="50" cy="75" r="34" fill="none" stroke="#c79c5e" strokeWidth="0.7" opacity="0.6" />
      <circle cx="50" cy="75" r="30" fill="none" stroke="#c79c5e" strokeWidth="0.4" opacity="0.5" />
      <rect
        x="5"
        y="5"
        width="90"
        height="140"
        rx="4"
        fill="none"
        stroke="#c79c5e"
        strokeWidth="1.4"
        opacity="0.75"
      />
      <rect
        x="9.5"
        y="9.5"
        width="81"
        height="131"
        rx="2"
        fill="none"
        stroke="#c79c5e"
        strokeWidth="0.5"
        opacity="0.5"
      />
      <text
        x="50"
        y="86"
        textAnchor="middle"
        className="card__monogram"
        fill="#e8cf9c"
      >
        M
      </text>
    </svg>
  );
}

export const Card = memo(CardInner);

/** A neat little stack used for "other players' hands". */
export function CardStack({ count, size = 'xs' }: { count: number; size?: CardSize }) {
  const shown = Math.min(count, 6);
  return (
    <div className="card-stack" data-size={size}>
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} className="card-stack__item" style={{ transform: `translateX(${i * 42}%)` }}>
          <Card cardId={'weapon:rope'} size={size} faceDown />
        </div>
      ))}
      <span className="card-stack__count">{count}</span>
    </div>
  );
}
