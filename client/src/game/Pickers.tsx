import { useMemo, useState } from 'react';
import { Card } from '../cards/Card';
import { CARD_BY_ID } from '@shared/constants/cards';
import { cardIdsOfCategory } from '@shared/rules/deck';
import type { CardId } from '@shared/types';
import { Modal } from '../components/ui';
import { useGame } from '../store/gameStore';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import { sfx } from '../audio/sfx';

/** A three-column dossier picker shared by suggestions and accusations. */
export function TriplePicker({
  title,
  sub,
  lockedRoom,
  initial,
  confirmLabel,
  warning,
  onConfirm,
  onClose,
}: {
  title: string;
  sub?: string;
  lockedRoom?: CardId;
  initial?: { suspect?: CardId | null; weapon?: CardId | null; room?: CardId | null };
  confirmLabel: string;
  warning?: string;
  onConfirm: (pick: { suspect: CardId; weapon: CardId; room: CardId }) => void;
  onClose: () => void;
}) {
  const hand = useGame((s) => s.view?.private.hand ?? []);
  const [suspect, setSuspect] = useState<CardId | null>(initial?.suspect ?? null);
  const [weapon, setWeapon] = useState<CardId | null>(initial?.weapon ?? null);
  const [room, setRoom] = useState<CardId | null>(lockedRoom ?? initial?.room ?? null);

  const ready = !!suspect && !!weapon && !!room;

  const groups = useMemo(
    () => [
      {
        category: 'suspect' as const,
        label: 'Suspect',
        cards: cardIdsOfCategory('suspect'),
        selected: suspect,
        onPick: (id: CardId) => {
          sfx.card();
          setSuspect(id);
        },
      },
      {
        category: 'weapon' as const,
        label: 'Weapon',
        cards: cardIdsOfCategory('weapon'),
        selected: weapon,
        onPick: (id: CardId) => {
          sfx.card();
          setWeapon(id);
        },
      },
      {
        category: 'room' as const,
        label: 'Room',
        cards: cardIdsOfCategory('room'),
        selected: room,
        locked: !!lockedRoom,
        onPick: (id: CardId) => {
          sfx.card();
          setRoom(id);
        },
      },
    ],
    [suspect, weapon, room, lockedRoom],
  );

  return (
    <Modal
      title={title}
      sub={sub}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--brass"
            disabled={!ready}
            onClick={() => {
              if (!ready) return;
              onConfirm({ suspect: suspect as CardId, weapon: weapon as CardId, room: room as CardId });
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="picker-dossier">
        {groups.map((group) => (
          <div className="picker-group" key={group.category}>
            <div className="picker-group__head">
              <span className="eyebrow">{group.label}</span>
              {group.locked && <span className="picker-group__locked">where you are standing</span>}
            </div>
            <div className="picker-group__cards">
              {group.cards.map((id: CardId) => {
                const held = hand.includes(id);
                return (
                  <Card
                    key={id}
                    cardId={id}
                    size="sm"
                    selected={group.selected === id}
                    disabled={group.locked}
                    dimmed={group.locked}
                    onClick={group.locked ? undefined : () => group.onPick(id)}
                    title={held ? `${CARD_BY_ID[id]?.name} — in your hand` : CARD_BY_ID[id]?.name}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="dossier-sentence">
        {suspect ? (
          <>
            I {title.toLowerCase().includes('accus') ? 'accuse' : 'suggest'}{' '}
            <strong>{CARD_BY_ID[suspect]?.name}</strong> with the{' '}
            <strong>{CARD_BY_ID[weapon ?? '']?.name ?? '…'}</strong> in the{' '}
            <strong>{CARD_BY_ID[room ?? '']?.name ?? '…'}</strong>.
          </>
        ) : (
          <span className="dossier-sentence__hint">
            Choose a suspect and a weapon{lockedRoom ? '' : ' and a room'}.
          </span>
        )}
      </div>
      {warning && ready && <p className="dossier-warning">{warning}</p>}
    </Modal>
  );
}

/** "Sarah showed you the Library." — private, one card, big. */
export function ShownCardModal({
  fromId,
  card,
  onClose,
}: {
  fromId: string;
  card: CardId;
  onClose: () => void;
}) {
  const players = useGame((s) => s.view?.public.players ?? []);
  const player = players.find((p) => p.id === fromId);
  const character = player?.characterId ? CHARACTER_BY_ID[player.characterId] : null;
  return (
    <Modal
      title="A card is shown"
      sub="Only you see this"
      onClose={onClose}
      footer={
        <button className="btn btn--brass" onClick={onClose}>
          Note it down
        </button>
      }
    >
      <div className="show-card">
        <p className="show-card__line">
          <strong>{character?.short ?? player?.name ?? 'A detective'}</strong> showed you:
        </p>
        <div className="show-card__card">
          <Card cardId={card} size="lg" />
        </div>
        <p className="show-card__note">
          {CARD_BY_ID[card]?.name} is therefore not in the envelope.
        </p>
      </div>
    </Modal>
  );
}

/** You must disprove a suggestion: pick exactly one matching card. */
export function RevealModal({
  request,
  onReveal,
}: {
  request: { suspect: CardId; weapon: CardId; room: CardId; matching: CardId[]; byId: string };
  onReveal: (card: CardId) => void;
}) {
  const [picked, setPicked] = useState<CardId | null>(null);
  const players = useGame((s) => s.view?.public.players ?? []);
  const asker = players.find((p) => p.id === request.byId);
  const character = asker?.characterId ? CHARACTER_BY_ID[asker.characterId] : null;

  return (
    <Modal
      title="You can disprove it"
      sub={`${character?.short ?? asker?.name ?? 'A detective'} is waiting`}
      footer={
        <button
          className="btn btn--brass"
          disabled={!picked}
          onClick={() => picked && onReveal(picked)}
        >
          Show this card
        </button>
      }
    >
      <p className="reveal__sentence">
        They suggest <strong>{CARD_BY_ID[request.suspect]?.name}</strong> with the{' '}
        <strong>{CARD_BY_ID[request.weapon]?.name}</strong> in the{' '}
        <strong>{CARD_BY_ID[request.room]?.name}</strong>.
      </p>
      <p className="reveal__instruction">
        Choose one card to show. Only they will see which one.
      </p>
      <div className="reveal__cards">
        {request.matching.map((id) => (
          <Card
            key={id}
            cardId={id}
            size="md"
            selected={picked === id}
            onClick={() => {
              sfx.card();
              setPicked(id);
            }}
          />
        ))}
      </div>
    </Modal>
  );
}
