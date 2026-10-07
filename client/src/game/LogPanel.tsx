import { useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import type { LogEntry } from '@shared/types';

export function LogPanel({ compact = false }: { compact?: boolean }) {
  const log = useGame((s) => s.view?.public.log ?? []);
  const players = useGame((s) => s.view?.public.players ?? []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);

  const colourOf = (text: string) => {
    const player = players.find((p) => {
      const name = p.characterId ? CHARACTER_BY_ID[p.characterId]?.short : p.name;
      return name ? text.startsWith(name) : false;
    });
    return player?.characterId ? CHARACTER_BY_ID[player.characterId]?.color : undefined;
  };

  return (
    <div className={`log${compact ? ' log--compact' : ''}`}>
      <div className="log__head">
        <span className="eyebrow">Case log</span>
      </div>
      <div className="rule" />
      <div className="log__body scroll-y">
        {log.map((entry: LogEntry) => (
          <p className="log__line" key={entry.id} data-kind={entry.kind}>
            <span className="log__turn">{entry.turn}</span>
            <span className="log__text" style={{ color: colourOf(entry.text) }}>
              {entry.text}
            </span>
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
