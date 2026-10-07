import { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore';
import { CHARACTERS } from '@shared/constants/characters';
import type { AiDifficulty, AiPersonality, PublicPlayer } from '@shared/types';
import { Pawn } from '../board/Token';
import { Modal, Segmented, Switch } from '../components/ui';
import { HowToPlay } from './Home';
import { fetchJson, type NetworkInfo } from '../net/socket';
import { sfx } from '../audio/sfx';

export function Lobby() {
  const view = useGame((s) => s.view);
  const session = useGame((s) => s.session);
  const prefs = useGame((s) => s.prefs);
  const addAI = useGame((s) => s.addAI);
  const fillWithAI = useGame((s) => s.fillWithAI);
  const removeAllBots = useGame((s) => s.removeAllBots);
  const removePlayer = useGame((s) => s.removePlayer);
  const updateSettings = useGame((s) => s.updateSettings);
  const setReady = useGame((s) => s.setReady);
  const startGame = useGame((s) => s.startGame);
  const leaveGame = useGame((s) => s.leaveGame);
  const pickCharacter = useGame((s) => s.pickCharacter);
  const toast = useGame((s) => s.toast);

  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [help, setHelp] = useState(false);
  const [lan, setLan] = useState<NetworkInfo | null>(null);
  const [showLan, setShowLan] = useState(false);

  useEffect(() => {
    void fetchJson<NetworkInfo>('/api/network-info').then(setLan);
  }, []);

  /** Clipboard with a graceful fallback for browsers that refuse it. */
  async function copy(kind: 'link' | 'code', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        document.body.removeChild(field);
        setCopied(kind);
      } catch {
        toast('Copy that by hand — your browser blocked the clipboard.', 'info');
        return;
      }
    }
    setTimeout(() => setCopied(null), 2500);
  }

  if (!view) return null;

  const players = view.public.players;
  const me = players.find((p) => p.id === session?.playerId) ?? null;
  const isHost = !!me?.isHost;
  const count = players.length;
  const botCount = players.filter((p) => p.isAI).length;
  const canStart = count >= 3 && players.every((p) => p.isAI || p.ready);

  return (
    <div className="lobby">
      <header className="lobby__head">
        <div className="lobby__brand">
          <span className="lobby__brand-title">Mystery Mansion</span>
          <span className="lobby__brand-sub">Game lobby</span>
        </div>
        <div className="code-plate">
          <span className="code-plate__label">Game code</span>
          <span className="code-plate__code">{view.public.roomCode}</span>
        </div>
        <div className="lobby__head-right">
          <button className="link-btn" onClick={() => setHelp(true)}>
            How to play
          </button>
          <button className="btn btn--ghost btn--sm" onClick={leaveGame}>
            Leave
          </button>
        </div>
      </header>

      <div className="lobby__body scroll-y">
        <div className="lobby__grid">
          <section className="paper lobby__table">
            <div className="lobby__table-head">
              <span className="eyebrow">The table</span>
              <span className="lobby__count">
                Players: {count} / 6
                {botCount > 0 && ` · ${botCount} bot${botCount === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="rule rule--strong" />
            <ul className="seats">
              {Array.from({ length: 6 }, (_, index) => {
                const player = players[index];
                if (!player) {
                  const isNext = index === count; // chairs fill in order
                  return (
                    <li
                      key={`empty-${index}`}
                      className="seat seat--empty"
                      data-next={isNext || undefined}
                    >
                      <span className="seat__no">{index + 1}</span>
                      <span className="seat__token">
                        <span className="seat__q">?</span>
                      </span>
                      <span className="seat__who">
                        <span className="seat__character seat__character--empty">
                          Empty chair
                        </span>
                        <span className="seat__player seat__player--empty">
                          {isNext ? 'Nobody here yet' : 'Still waiting'}
                        </span>
                      </span>
                      <span className="seat__tags" />
                      <span className="seat__actions">
                        <BotSwitch
                          on={false}
                          disabled={!isHost || !isNext}
                          label={isHost ? 'Bot' : 'Empty'}
                          title={
                            !isHost
                              ? 'The host decides who sits here'
                              : isNext
                                ? 'Put a bot in this chair'
                                : 'Fill the earlier chair first'
                          }
                          onToggle={addAI}
                        />
                      </span>
                    </li>
                  );
                }
                return (
                  <SeatRow
                    key={player.id}
                    player={player}
                    isMe={player.id === session?.playerId}
                    isHost={isHost}
                    takenIds={players.filter((p) => p.id !== player.id).map((p) => p.characterId)}
                    onPick={() => setPickerFor(player.id)}
                    onRemove={() => removePlayer(player.id)}
                    onReady={() => setReady(!player.ready)}
                    onToggleBot={() => removePlayer(player.id)}
                  />
                );
              })}
            </ul>

            {isHost && (
              <div className="lobby__table-actions">
                <button
                  className="btn btn--paper"
                  disabled={count >= 6}
                  onClick={() => {
                    if (count >= 6) return;
                    fillWithAI();
                  }}
                >
                  Fill with bots
                </button>
                <button
                  className="btn btn--ghost"
                  disabled={botCount === 0}
                  onClick={removeAllBots}
                >
                  Clear bots
                </button>
                <span className="lobby__hint">
                  {botCount === 0
                    ? count >= 6
                      ? 'The table is full.'
                      : 'Flip a switch to drop a bot into an empty chair.'
                    : `${botCount} bot${botCount === 1 ? '' : 's'} seated · flip a switch off to take one out.`}
                </span>
              </div>
            )}
          </section>

          <aside className="lobby__side">
            <section className="paper lobby__panel">
              <span className="eyebrow">Invite</span>
              <p className="lobby__panel-copy">
                Share the code — or the link, which fills it in for you. Anyone, anywhere,
                can join with it.
              </p>
              <div className="lobby__invite-actions">
                <button
                  className="btn btn--paper btn--sm"
                  onClick={() => copy('link', `${window.location.origin}/?room=${view.public.roomCode}`)}
                >
                  {copied === 'link' ? 'Link copied' : 'Copy invite link'}
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => copy('code', view.public.roomCode)}
                >
                  {copied === 'code' ? 'Code copied' : 'Copy code'}
                </button>
              </div>
              <p className="lobby__note">
                {copied
                  ? 'Paste it into your group chat. Everyone who opens it just needs a name.'
                  : `${window.location.origin}/?room=${view.public.roomCode}`}
              </p>
              {lan?.lanUrl ? (
                <>
                  <button className="link-btn" onClick={() => setShowLan((v) => !v)}>
                    {showLan ? 'Hide' : 'Show'} local Wi-Fi link
                  </button>
                  {showLan && (
                    <div className="lobby__lan">
                      <code>{lan.lanUrl}</code>
                      <img
                        src={`/api/qr?url=${encodeURIComponent(lan.lanUrl)}`}
                        alt="QR code for the local address"
                        width={132}
                        height={132}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="lobby__note">
                  No local network address is available from this host, so Wi-Fi joining is
                  unavailable here. Online codes still work from anywhere.
                </p>
              )}
            </section>

            <section className="paper lobby__panel">
              <span className="eyebrow">Table settings</span>
              <div className="lobby__setting">
                <Segmented<AiDifficulty>
                  label="AI difficulty"
                  value={view.public.settings.aiDifficulty}
                  options={[
                    { value: 'easy', label: 'Easy' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard' },
                  ]}
                  onChange={(difficulty) => updateSettings({ aiDifficulty: difficulty })}
                />
              </div>
              <div className="lobby__setting">
                <Segmented<AiPersonality>
                  label="AI personality"
                  value={view.public.settings.aiPersonality}
                  options={[
                    { value: 'analytical', label: 'Analytical' },
                    { value: 'aggressive', label: 'Aggressive' },
                    { value: 'careful', label: 'Careful' },
                    { value: 'random', label: 'Random' },
                  ]}
                  onChange={(personality) => updateSettings({ aiPersonality: personality })}
                />
              </div>
              <div className="lobby__setting">
                <Switch
                  checked={view.public.settings.autoPlayDisconnected}
                  label="Let the house play a dropped seat"
                  onChange={(next) => updateSettings({ autoPlayDisconnected: next })}
                />
              </div>
              {!isHost && <p className="lobby__note">Only the host can change these.</p>}
            </section>

            <section className="paper lobby__panel lobby__panel--start">
              {isHost ? (
                <>
                  <button
                    className="btn btn--brass btn--lg btn--block"
                    disabled={!canStart}
                    onClick={startGame}
                  >
                    Start game
                  </button>
                  <p className="lobby__note">
                    {count < 3
                      ? 'A case needs at least three detectives.'
                      : canStart
                        ? 'Deals the cards and opens the first turn.'
                        : 'Waiting for everyone to mark themselves ready.'}
                  </p>
                </>
              ) : (
                <>
                  <div className="lobby__waiting">Waiting for the host</div>
                  <p className="lobby__note">
                    {me?.ready
                      ? 'You are ready. The host deals the cards.'
                      : 'Mark yourself ready when you are.'}
                  </p>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>

      {pickerFor && (
        <CharacterPicker
          currentId={players.find((p) => p.id === pickerFor)?.characterId ?? null}
          takenIds={players.filter((p) => p.id !== pickerFor).map((p) => p.characterId)}
          onPick={(characterId) => {
            pickCharacter(characterId);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
      {help && <HowToPlay onClose={() => setHelp(false)} />}
    </div>
  );
}

function SeatRow({
  player,
  isMe,
  isHost,
  takenIds,
  onPick,
  onRemove,
  onReady,
  onToggleBot,
}: {
  player: PublicPlayer;
  isMe: boolean;
  isHost: boolean;
  takenIds: (string | null)[];
  onPick: () => void;
  onRemove: () => void;
  onReady: () => void;
  onToggleBot: () => void;
}) {
  const character = CHARACTERS.find((c) => c.id === player.characterId) ?? null;
  return (
    <li className="seat" data-me={isMe || undefined} data-out={!player.connected || undefined}>
      <span className="seat__no">{player.seat + 1}</span>
      <span className="seat__token">
        {character ? <Pawn character={character} size={30} /> : <span className="seat__q">?</span>}
      </span>
      <span className="seat__who">
        <span className="seat__character">{character?.name ?? 'No character'}</span>
        <span className="seat__player">
          {player.isAI ? player.name : player.name}
          {isMe && <em className="seat__you"> (you)</em>}
        </span>
      </span>
      <span className="seat__tags">
        <span className={`badge badge--${player.isAI ? 'ai' : 'human'}`}>
          {player.isAI ? 'AI' : 'Human'}
        </span>
        {player.isAI && <span className="seat__ai-meta">{player.difficulty} · {player.personality}</span>}
        {player.isHost && <span className="badge badge--host">Host</span>}
        {!player.isAI && (
          <span className={`badge ${player.ready ? 'badge--human' : 'badge--off'}`}>
            {player.ready ? 'Ready' : 'Not ready'}
          </span>
        )}
        {!player.isAI && !player.connected && <span className="badge badge--off">Disconnected</span>}
      </span>
      <span className="seat__actions">
        {player.isAI ? (
          <>
            {isHost && (
              <button
                className="btn btn--sm btn--paper"
                onClick={onPick}
                title={takenIds.includes(player.characterId) ? 'Taken' : 'Change character'}
              >
                Change
              </button>
            )}
            <BotSwitch
              on
              disabled={!isHost}
              label="Bot"
              title={isHost ? 'Take this bot out of the chair' : 'Only the host can change the bots'}
              onToggle={onToggleBot}
            />
          </>
        ) : isMe ? (
          <>
            <button className="btn btn--sm btn--paper" onClick={onPick}>
              {character ? 'Change' : 'Choose'}
            </button>
            <button className="btn btn--sm btn--ghost" onClick={onReady}>
              {player.ready ? 'Not ready' : 'Ready'}
            </button>
          </>
        ) : (
          isHost && (
            <>
              <button
                className="btn btn--sm btn--paper"
                onClick={onPick}
                title={takenIds.includes(player.characterId) ? 'Taken' : 'Change character'}
              >
                Change
              </button>
              <button className="btn btn--sm btn--ghost" onClick={onRemove}>
                Remove
              </button>
            </>
          )
        )}
      </span>
    </li>
  );
}

/**
 * The per-chair bot switch. On = a bot is sitting here (click to take it out),
 * off = the chair is empty or taken by a person (click to drop a bot in).
 */
const sfxClick = () => sfx.click();

function BotSwitch({
  on,
  disabled,
  label,
  title,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="bot-switch"
      data-on={on || undefined}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      onClick={() => {
        sfxClick();
        onToggle();
      }}
    >
      <span className="bot-switch__track" aria-hidden="true">
        <span className="bot-switch__knob" />
      </span>
      <span className="bot-switch__label">{label}</span>
    </button>
  );
}

function CharacterPicker({
  currentId,
  takenIds,
  onPick,
  onClose,
}: {
  currentId: string | null;
  takenIds: (string | null)[];
  onPick: (characterId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Choose a character"
      sub="Each detective takes a different token"
      onClose={onClose}
      wide
    >
      <div className="picker">
        {CHARACTERS.map((character) => {
          const taken = takenIds.includes(character.id);
          const mine = character.id === currentId;
          return (
            <button
              key={character.id}
              className="picker__card"
              data-taken={taken || undefined}
              data-mine={mine || undefined}
              disabled={taken}
              onClick={() => onPick(character.id)}
            >
              <span className="picker__token">
                <Pawn character={character} size={54} />
              </span>
              <span className="picker__name">{character.name}</span>
              <span className="picker__title">{character.title}</span>
              <span className="picker__start">
                Starts by the {startLabel(character.start)}
              </span>
              {taken && <span className="picker__flag">Taken</span>}
              {mine && <span className="picker__flag picker__flag--mine">Yours</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function startLabel(cell: { row: number; col: number }): string {
  if (cell.col === 0) return 'west corridor';
  if (cell.col === 23) return 'east corridor';
  if (cell.row === 24) return 'south terrace';
  return 'mansion corridor';
}
