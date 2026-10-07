import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CARD_BY_ID } from '@shared/constants/cards';
import type { CardId } from '@shared/types';
import { Card } from './Card';
import { sfx } from '../audio/sfx';

/** How long the "putting it back" animation runs before the card unmounts. */
const CLOSE_MS = 180;

export interface ZoomState {
  cardId: CardId;
  closing: boolean;
}

/**
 * Keeps track of which card is lifted out of the hand, and lets it animate
 * back down before it disappears.
 */
export function useCardZoom() {
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const current = useRef<ZoomState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  current.current = zoom;

  const close = useCallback(() => {
    const open = current.current;
    if (!open || open.closing) return;
    setZoom({ ...open, closing: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setZoom(null), CLOSE_MS);
  }, []);

  const open = useCallback((cardId: CardId) => {
    if (timer.current) clearTimeout(timer.current);
    sfx.card();
    setZoom({ cardId, closing: false });
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { zoom, open: open as (cardId: CardId) => void, close };
}

/**
 * One card, held up to the light.
 *
 * The cards in the dossier rail are small enough to keep a whole hand on
 * screen, which makes them hard to read. Clicking one lifts it into the middle
 * of the table; clicking it again, clicking anywhere off it, or pressing Escape
 * puts it back.
 */
export function CardZoom({
  state,
  onClose,
}: {
  state: ZoomState;
  onClose: () => void;
}) {
  const { cardId, closing } = state;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const card = CARD_BY_ID[cardId];

  return createPortal(
    <div
      className="card-zoom"
      data-closing={closing || undefined}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={card?.name ?? 'Card'}
    >
      <div className="card-zoom__stage">
        <div className="card-zoom__card" onClick={onClose} title="Put it back">
          <Card cardId={cardId} size="lg" />
        </div>
        <p className="card-zoom__hint">
          {card ? `${card.category} · ` : ''}
          Click the card again, click away, or press <kbd>Esc</kbd> to put it back.
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Put it back
        </button>
      </div>
    </div>,
    document.body,
  );
}
