import { useEffect, useState } from 'react';
import { Card } from '../cards/Card';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import { useGame } from '../store/gameStore';
import type { Solution } from '@shared/types';

export function VictoryScreen() {
  const view = useGame((s) => s.view);
  const session = useGame((s) => s.session);
  const restartGame = useGame((s) => s.restartGame);
  const leaveGame = useGame((s) => s.leaveGame);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 620);
    return () => clearTimeout(timer);
  }, []);

  if (!view || view.public.phase !== 'finished') return null;
  const solution = view.public.revealedSolution as Solution | null;
  const winner = view.public.players.find((p) => p.id === view.public.winnerId);
  const winnerCharacter = winner?.characterId ? CHARACTER_BY_ID[winner.characterId] : null;
  const iWon = winner?.id === session?.playerId;
  const me = view.public.players.find((p) => p.id === session?.playerId);
  const amHost = !!me?.isHost;

  return (
    <div className="scrim victory">
      <div className="victory__sheet paper">
        <div className="victory__stamp">
          {solution ? 'CASE CLOSED' : 'CASE COLD'}
        </div>
        <h2 className="victory__title">
          {solution ? (iWon ? 'You solved it' : 'The case is solved') : 'The case goes cold'}
        </h2>
        <div className="rule rule--strong" />
        <p className="victory__line">
          {solution ? (
            <>
              <strong style={{ color: winnerCharacter?.color }}>
                {winnerCharacter?.short ?? winner?.name ?? 'Nobody'}
              </strong>{' '}
              named the contents of the envelope.
            </>
          ) : (
            'Every detective was discredited. Nobody named the killer.'
          )}
        </p>

        {solution && (
          <div className="victory__envelope">
            <div className="victory__cards">
              {[solution.suspect, solution.weapon, solution.room].map((cardId, index) => (
                <div
                  className="victory__card"
                  key={cardId}
                  style={{ animationDelay: `${index * 260 + 260}ms` }}
                  data-open={open || undefined}
                >
                  <div className="victory__card-inner">
                    <div className="victory__card-face">
                      <Card cardId={cardId} size="lg" />
                    </div>
                    <div className="victory__card-back">
                      <Card cardId={cardId} size="lg" faceDown />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="victory__actions">
          {amHost && (
            <button
              className="btn btn--brass"
              onClick={restartGame}
            >
              Deal a new case
            </button>
          )}
          <button className="btn btn--paper" onClick={leaveGame}>
            Leave the table
          </button>
        </div>
        {amHost && <p className="victory__hint">Dealing a new case returns everyone to the lobby.</p>}
      </div>
    </div>
  );
}
