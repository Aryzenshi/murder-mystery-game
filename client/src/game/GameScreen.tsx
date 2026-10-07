import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../board/Board';
import { Card, CardStack } from '../cards/Card';
import { CardZoom, useCardZoom } from '../cards/CardZoom';
import { CHARACTER_BY_ID } from '@shared/constants/characters';
import { ROOM_BY_ID } from '@shared/constants/board';
import { useGame, useIsMyTurn } from '../store/gameStore';
import { sfx } from '../audio/sfx';
import { DiceTray } from './DiceTray';
import { Notebook } from '../notebook/Notebook';
import { LogPanel } from './LogPanel';
import { RevealModal, ShownCardModal, TriplePicker } from './Pickers';
import { VictoryScreen } from './VictoryScreen';
import { Cinematic } from './Cinematic';
import { Modal } from '../components/ui';
import type { CardId } from '@shared/types';
import { CARD_BY_ID } from '@shared/constants/cards';

type Drawer = 'cards' | 'notes' | 'log';

/** Tooltip text for a card in your own hand. */
function cardName(cardId: CardId): string {
  return CARD_BY_ID[cardId]?.name ?? 'Card';
}

export function GameScreen() {
  const view = useGame((s) => s.view);
  const session = useGame((s) => s.session);
  const rolling = useGame((s) => s.rolling);
  const aiStatus = useGame((s) => s.aiStatus);
  const prefs = useGame((s) => s.prefs);
  const setPrefs = useGame((s) => s.setPrefs);
  const roll = useGame((s) => s.roll);
  const moveTo = useGame((s) => s.moveTo);
  const usePassage = useGame((s) => s.usePassage);
  const suggest = useGame((s) => s.suggest);
  const accuse = useGame((s) => s.accuse);
  const endTurn = useGame((s) => s.endTurn);
  const reveal = useGame((s) => s.reveal);
  const leaveGame = useGame((s) => s.leaveGame);
  const toast = useGame((s) => s.toast);

  const [drawer, setDrawer] = useState<Drawer>('cards');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deskTab, setDeskTab] = useState<'notes' | 'log'>('notes');
  const [picking, setPicking] = useState<'suggest' | 'accuse' | null>(null);
  const [shownCard, setShownCard] = useState<{ fromId: string; card: CardId } | null>(null);
  const [help, setHelp] = useState(false);
  const { zoom, open: zoomCard, close: closeZoom } = useCardZoom();
  const [intro, setIntro] = useState(() => {
    // once per case, and never again on a refresh or a reconnect
    const gameId = view?.public.gameId;
    if (!gameId) return false;
    // Never show or download intro when joining a game already in progress
    if (view?.public.turnNumber && view.public.turnNumber > 1) return false;
    if (view?.public.phase === 'finished') return false;
    try {
      const key = `mystery:intro:${gameId}`;
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
      return true;
    } catch {
      return true;
    }
  });
  const [panelsOpen, setPanelsOpen] = useState(true);

  const meId = session?.playerId ?? null;
  const myTurn = useIsMyTurn();
  const lastReveal = view?.private.lastReveal ?? null;

  // Pop the private reveal the moment the server tells us about it.
  useEffect(() => {
    if (lastReveal) setShownCard(lastReveal);
  }, [lastReveal?.fromId, lastReveal?.card, lastReveal]);

  // A wrong accusation is a big moment: say so plainly, once.
  const wasEliminated = useRef(false);
  useEffect(() => {
    const out = !!view?.public.players.find((p) => p.id === meId)?.eliminated;
    if (out && !wasEliminated.current) {
      toast(
        'Your accusation was wrong. You are out of the investigation — you can still disprove suggestions.',
        'error',
      );
      sfx.defeat();
    }
    wasEliminated.current = out;
  }, [view?.public.players, meId, toast]);

  if (!view) return null;

  const pub = view.public;
  const priv = view.private;
  const me = pub.players.find((p) => p.id === meId) ?? null;
  const current = pub.players.find((p) => p.id === pub.currentPlayerId) ?? null;
  const currentCharacter = current?.characterId ? CHARACTER_BY_ID[current.characterId] : null;
  const myRoom = me ? ROOM_BY_ID[pub.positions[me.id]?.kind === 'room' ? (pub.positions[me.id] as { roomId: string }).roomId : ''] : null;
  const passageTarget = priv.canUsePassage && me && pub.positions[me.id]?.kind === 'room'
    ? ROOM_BY_ID[ROOM_BY_ID[(pub.positions[me.id] as { roomId: string }).roomId]?.secretPassage ?? '']
    : null;
  const eliminated = !!me?.eliminated;

  const status = (() => {
    if (pub.phase === 'finished') return 'The case is closed';
    if (priv.revealRequest) return 'Choose a card to show';
    if (aiStatus?.text && current?.isAI) {
      return `${currentCharacter?.short ?? current?.name} ${aiStatus.text}…`;
    }
    if (!myTurn) {
      return currentCharacter
        ? `${currentCharacter.short}'s turn`
        : `${current?.name ?? 'Someone'}'s turn`;
    }
    if (eliminated) return 'You are out of the investigation';
    if (pub.turnStep === 'move') return 'Choose where to move';
    if (pub.turnStep === 'roll') return 'Roll the dice';
    if (pub.turnStep === 'action') {
      return myRoom ? 'Suggest, accuse or end your turn' : 'Accuse or end your turn';
    }
    return 'Waiting…';
  })();

  const opponents = useMemo(
    () => pub.players.filter((p) => p.id !== meId),
    [pub.players, meId],
  );

  return (
    <div className="game">
      <header className="game__bar">
        <div className="game__bar-left">
          <span className="game__brand">Mystery Mansion</span>
          <span className="game__code">{pub.roomCode}</span>
          {eliminated && (
            <span className="game__flag" title="You can still disprove suggestions.">
              Out of the case
            </span>
          )}
        </div>
        <div className="game__turn" data-mine={myTurn || undefined}>
          <span
            key={pub.currentPlayerId ?? 'none'}
            className="game__turn-line"
            style={{ color: currentCharacter?.color }}
          >
            {status}
          </span>
          <span className="game__turn-meta">
            Turn {pub.turnNumber}
            {me ? ` · ${me.cardCount} cards in hand` : ''}
          </span>
        </div>
        <div className="game__bar-right">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setPrefs({ sound: !prefs.sound })}
            title={prefs.sound ? 'Mute the sound effects' : 'Unmute the sound effects'}
          >
            Sound: {prefs.sound ? 'On' : 'Off'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setPrefs({ music: !prefs.music })}
            title={
              prefs.music
                ? 'Silence the background music — the game stays quiet'
                : 'Bring the background music back'
            }
          >
            Music: {prefs.music ? 'On' : 'Off'}
          </button>
          {prefs.music && (
            <input
              type="range"
              className="vol-slider"
              min="0"
              max="1"
              step="0.05"
              value={prefs.musicVolume ?? 0.8}
              onChange={(e) => setPrefs({ musicVolume: parseFloat(e.target.value) })}
              style={{ width: '60px', marginLeft: '-4px', marginRight: '4px', verticalAlign: 'middle' }}
              title="Music Volume"
            />
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => setHelp(true)}>
            Rules
          </button>
          <button className="btn btn--ghost btn--sm" onClick={leaveGame}>
            Leave
          </button>
        </div>
      </header>

      <div className="game__table" data-collapsed={!panelsOpen || undefined}>
        <div className="game__main">
          <div className="board-wrap">
                <Board
                  positions={pub.positions}
                  players={pub.players}
                  legalMoves={myTurn ? priv.legalMoves : []}
                  currentPlayerId={pub.currentPlayerId}
                  myPlayerId={meId}
                  onPickTarget={myTurn && pub.turnStep === 'move' ? moveTo : undefined}
                />
          </div>

          <div className="game__controls">
            <DiceTray
              dice={pub.dice}
              rolling={rolling}
              movesLeft={pub.movesLeft}
              label={myTurn ? 'Awaiting roll' : 'Dice'}
            />

            <div className="game__actions">
              {myTurn && !eliminated && (
                <>
                  {pub.turnStep === 'roll' && (
                    <button className="btn btn--brass btn--lg" onClick={roll} disabled={rolling}>
                      Roll dice
                    </button>
                  )}
                  {priv.canUsePassage && passageTarget && (
                    <button className="btn btn--paper" onClick={usePassage}>
                      Secret passage
                      <span className="btn__sub">to the {passageTarget.name}</span>
                    </button>
                  )}
                  {priv.canSuggest && myRoom && (
                    <button className="btn btn--paper" onClick={() => setPicking('suggest')}>
                      Make suggestion
                      <span className="btn__sub">in the {myRoom.name}</span>
                    </button>
                  )}
                  {priv.canAccuse && (
                    <button className="btn btn--danger" onClick={() => setPicking('accuse')}>
                      Make accusation
                    </button>
                  )}
                  {(pub.turnStep === 'action' || pub.turnStep === 'move') && (
                    <button className="btn btn--ghost" onClick={endTurn}>
                      End turn
                    </button>
                  )}
                </>
              )}
              {!myTurn && <span className="game__waiting">{status}</span>}
              {eliminated && myTurn && (
                <span className="game__waiting">
                  Out of the case — you can still disprove suggestions.
                </span>
              )}
            </div>

            <div className="game__opponents">
              {opponents.slice(0, 5).map((player) => {
                const character = player.characterId ? CHARACTER_BY_ID[player.characterId] : null;
                return (
                  <div
                    className="opp"
                    key={player.id}
                    data-current={player.id === pub.currentPlayerId || undefined}
                    style={{ borderColor: character?.color }}
                    title={`${player.name}${player.isAI ? ' (AI)' : ''} — ${player.cardCount} cards`}
                  >
                    <span className="opp__name">{character?.short ?? player.name}</span>
                    <CardStack count={player.cardCount} size="xs" />
                    {player.eliminated && <span className="opp__out">out</span>}
                    {!player.connected && !player.isAI && <span className="opp__out">away</span>}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <aside className="game__side">
          <section className="paper game__hand-panel">
            <div className="game__panel-head">
              <span className="eyebrow">Your cards</span>
              <span className="game__panel-note">
                {panelsOpen
                  ? 'Private to you · click one to read it'
                  : `${priv.hand.length} cards`}
              </span>
            </div>
            <div className="hand">
              {priv.hand.map((cardId, index) => (
                <div
                  className="hand__card"
                  key={cardId}
                  style={{ transform: `rotate(${(index - (priv.hand.length - 1) / 2) * 1.6}deg)` }}
                >
                  <Card
                    cardId={cardId}
                    size="sm"
                    deal={index}
                    onClick={() => zoomCard(cardId)}
                    title={`${cardName(cardId)} — click to read it`}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="paper game__notes-panel">
            <div className="game__tabs">
              {(['notes', 'log'] as const).map((tab) => (
                <button
                  key={tab}
                  className="game__tab"
                  aria-pressed={panelsOpen && deskTab === tab}
                  onClick={() => {
                    if (panelsOpen && deskTab === tab) setPanelsOpen(false);
                    else {
                      setDeskTab(tab);
                      setPanelsOpen(true);
                    }
                  }}
                >
                  <span className="game__tab-full">
                    {tab === 'notes' ? 'Detective notes' : 'Case log'}
                  </span>
                  <span className="game__tab-short">
                    {tab === 'notes' ? 'Notes' : 'Log'}
                  </span>
                </button>
              ))}
              <button
                className="game__tab game__tab--plain"
                onClick={() => setPanelsOpen(!panelsOpen)}
                title={panelsOpen ? 'Give the board more room' : 'Bring the panels back'}
              >
                <span className="game__tab-full">{panelsOpen ? 'Hide' : 'Show'}</span>
                <span className="game__tab-short">{panelsOpen ? 'Show' : 'Hide'}</span>
              </button>
            </div>
            {deskTab === 'notes' ? <Notebook /> : <LogPanel />}
          </section>
        </aside>
      </div>

      {/* ---------- mobile drawer ---------- */}
      <div className="game__drawer">
        <div className="game__drawer-tabs">
          {(['cards', 'notes', 'log'] as Drawer[]).map((tab) => (
            <button
              key={tab}
              className="game__drawer-tab"
              aria-pressed={drawerOpen && drawer === tab}
              onClick={() => {
                if (drawerOpen && drawer === tab) setDrawerOpen(false);
                else {
                  setDrawer(tab);
                  setDrawerOpen(true);
                }
              }}
            >
              {tab === 'cards' ? 'Cards' : tab === 'notes' ? 'Notes' : 'Log'}
            </button>
          ))}
        </div>
        <div className="game__drawer-body scroll-y" data-open={drawerOpen || undefined}>
          {drawer === 'cards' && (
            <div className="hand hand--drawer">
              {priv.hand.map((cardId) => (
                <Card
                  key={cardId}
                  cardId={cardId}
                  size="sm"
                  onClick={() => zoomCard(cardId)}
                  title={`${cardName(cardId)} — tap to read it`}
                />
              ))}
            </div>
          )}
          {drawer === 'notes' && <Notebook compact />}
          {drawer === 'log' && <LogPanel compact />}
        </div>
      </div>

      {/* ---------- opening credits ---------- */}
      {intro && (
        <Cinematic
          players={pub.players}
          soundOn={prefs.sound}
          onDone={() => setIntro(false)}
        />
      )}

      {/* ---------- one card, held up to the light ---------- */}
      {zoom && <CardZoom state={zoom} onClose={closeZoom} />}

      {/* ---------- modals ---------- */}
      {priv.revealRequest && (
        <RevealModal request={priv.revealRequest} onReveal={(card) => reveal(card)} />
      )}

      {!priv.revealRequest && shownCard && (
        <ShownCardModal
          fromId={shownCard.fromId}
          card={shownCard.card}
          onClose={() => setShownCard(null)}
        />
      )}

      {picking === 'suggest' && myRoom && (
        <TriplePicker
          title="Make a suggestion"
          sub={`You are standing in the ${myRoom.name}`}
          lockedRoom={`room:${myRoom.id}` as CardId}
          confirmLabel="Make the suggestion"
          onConfirm={(pick) => {
            setPicking(null);
            suggest(pick.suspect, pick.weapon);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {picking === 'accuse' && (
        <TriplePicker
          title="Make an accusation"
          sub="A wrong accusation ends your investigation"
          confirmLabel="Accuse"
          warning="If you are wrong you will be out of the investigation for the rest of the case."
          onConfirm={(pick) => {
            setPicking(null);
            accuse(pick.suspect, pick.weapon, pick.room);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {pub.phase === 'finished' && !priv.revealRequest && <VictoryScreen />}

      {help && (
        <Modal title="How to play" onClose={() => setHelp(false)}>
          <div className="help help--short">
            <p>
              <strong>Roll</strong> — the server rolls, everybody sees the same numbers.
            </p>
            <p>
              <strong>Move</strong> — up to that many squares along the corridors. Doors are the
              only way into a room, and entering a room ends your move.
            </p>
            <p>
              <strong>Suggest</strong> — a suspect and a weapon in the room you are standing in. The
              first detective holding one of those three cards shows you one of them, privately.
            </p>
            <p>
              <strong>Accuse</strong> — name all three. Get it right and the envelope is yours; get
              it wrong and you are out.
            </p>
            <p>
              <strong>Secret passages</strong> — Study ↔ Kitchen, Lounge ↔ Conservatory. Slip
              through instead of rolling.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
