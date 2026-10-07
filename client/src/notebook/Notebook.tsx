import { useGame, type NotebookMark } from '../store/gameStore';
import { ALL_CARDS, CATEGORY_LABEL, CATEGORY_ORDER } from '@shared/constants/cards';
import type { CardCategory } from '@shared/types';

const MARK_LABEL: Record<NotebookMark, string> = {
  unknown: 'Unknown',
  possible: 'Possible',
  confirmed: 'Confirmed',
  eliminated: 'Eliminated',
};

export function Notebook({ compact = false }: { compact?: boolean }) {
  const notebook = useGame((s) => s.notebook);
  const mark = useGame((s) => s.markNotebook);
  const clear = useGame((s) => s.clearNotebook);
  const hand = useGame((s) => s.view?.private.hand ?? []);
  const seen = useGame((s) => s.view?.private.seenCards ?? []);

  const seenFrom = new Map(seen.map((entry) => [entry.card, entry.fromId]));

  return (
    <div className={`notebook${compact ? ' notebook--compact' : ''}`}>
      <div className="notebook__head">
        <span className="eyebrow">Detective notes</span>
        <button className="link-btn" onClick={clear}>
          Clear
        </button>
      </div>
      <div className="rule" />
      <div className="notebook__grid">
        {CATEGORY_ORDER.map((category: CardCategory) => (
          <div className="notebook__col" key={category}>
            <h4 className="notebook__col-title">{CATEGORY_LABEL[category]}</h4>
            <ul className="notebook__list">
              {ALL_CARDS.filter((card) => card.category === category).map((card) => {
                const state = notebook[card.id] ?? 'unknown';
                const held = hand.includes(card.id);
                return (
                  <li key={card.id}>
                    <button
                      className="note-row"
                      data-state={state}
                      onClick={() => mark(card.id)}
                      title={`${card.name} — ${MARK_LABEL[state]}`}
                    >
                      <span className="note-box" aria-hidden="true">
                        {state === 'confirmed' && '✓'}
                        {state === 'eliminated' && '✕'}
                        {state === 'possible' && '?'}
                      </span>
                      <span className="note-name">{card.name}</span>
                      {held && <span className="note-flag note-flag--held">held</span>}
                      {!held && seenFrom.has(card.id) && (
                        <span className="note-flag note-flag--seen">shown</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="notebook__legend">
        Tap a line to cycle: unknown → possible → confirmed → eliminated. Your notes are private and
        never leave this device.
      </p>
    </div>
  );
}
