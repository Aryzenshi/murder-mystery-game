import { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore';
import { MansionMark, Modal, Segmented, Switch } from '../components/ui';
import { fetchJson, loadSession, type NetworkInfo } from '../net/socket';
import { nameProblem, NAME_MAX, NAME_MIN } from '@shared/names';
import type { AiDifficulty, AiPersonality } from '@shared/types';
import { sfx } from '../audio/sfx';

type Mode = 'menu' | 'join' | 'local';

export function Home() {
  const prefs = useGame((s) => s.prefs);
  const setPrefs = useGame((s) => s.setPrefs);
  const createGame = useGame((s) => s.createGame);
  const joinGame = useGame((s) => s.joinGame);
  const rejoin = useGame((s) => s.rejoin);
  const busy = useGame((s) => s.busy);
  const joinError = useGame((s) => s.joinError);
  const clearJoinError = useGame((s) => s.clearJoinError);
  const updateSettings = useGame((s) => s.updateSettings);

  const [mode, setMode] = useState<Mode>('menu');
  const [code, setCode] = useState('');
  const [openHelp, setOpenHelp] = useState(false);
  // Step one of the Skribbl-style flow: you are naming yourself until you say
  // otherwise (a saved name from a previous visit skips straight past it).
  const [naming, setNaming] = useState(() => !!nameProblem(prefs.name));
  const [stored, setStored] = useState<ReturnType<typeof loadSession>>(null);
  const [lan, setLan] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    setStored(loadSession());
    // A shared link like https://host/?room=K7P4X drops you straight at the
    // code prompt — handy when the invite is pasted into a chat.
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) {
      const clean = room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      if (clean.length === 5) {
        setCode(clean);
        setMode('join');
      }
    }
  }, []);

  useEffect(() => {
    if (mode === 'local') {
      void fetchJson<NetworkInfo>('/api/network-info').then(setLan);
    }
  }, [mode]);

  const name = prefs.name.trim();
  const problem = nameProblem(name);

  const submitName = (event: React.FormEvent) => {
    event.preventDefault();
    if (problem) return;
    sfx.click();
    setNaming(false);
  };

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__head">
          <div className="home__mark">
            <MansionMark />
          </div>
          <h1 className="home__title">Mystery Mansion</h1>
          <div className="home__rule" />
          <p className="home__tag">
            A deduction board game for three to six detectives.
            <br />
            Roll, move, suggest — and be the first to name the killer.
          </p>
        </header>

        {stored && mode === 'menu' && (
          <div className="home__rejoin paper">
            <div>
              <span className="eyebrow">A seat is waiting</span>
              <div className="home__rejoin-code">{stored.roomCode}</div>
            </div>
            <div className="home__rejoin-actions">
              <button className="btn btn--brass" disabled={busy} onClick={() => rejoin(stored)}>
                Rejoin game
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  localStorage.removeItem('mystery-mansion.session.v1');
                  setStored(null);
                }}
              >
                Forget it
              </button>
            </div>
          </div>
        )}

        {naming ? (
          <form className="home__gate paper" onSubmit={submitName}>
            <span className="eyebrow">Step one</span>
            <h2 className="home__gate-title">What shall we call you?</h2>
            <p className="home__gate-copy">
              No account, no password, no email. Pick a name your friends will recognise —
              it appears on the seating plan and in the case log. Two detectives at the same
              table cannot share a name.
            </p>
            <div className="home__gate-row">
              <input
                id="detective-name"
                className="field field--name"
                value={prefs.name}
                maxLength={NAME_MAX}
                minLength={NAME_MIN}
                placeholder="Detective"
                autoComplete="nickname"
                autoFocus
                aria-label="Your detective name"
                onChange={(event) => {
                  setPrefs({ name: event.target.value });
                  clearJoinError();
                }}
              />
              <button className="btn btn--brass" type="submit" disabled={!!problem}>
                Take the case
              </button>
            </div>
            <p className="home__gate-hint" role="status">
              {name.length === 0
                ? `${NAME_MIN}–${NAME_MAX} characters. We keep it in this browser so you keep your seat if you drop out.`
                : problem ?? `${name.length}/${NAME_MAX} · press “Take the case” to continue`}
            </p>
          </form>
        ) : (
          <div className="home__name">
            <span className="home__name-label">Playing as</span>
            <strong className="home__name-value">{name}</strong>
            <button
              className="link-btn"
              onClick={() => {
                sfx.click();
                setPrefs({ name: '' });
                setNaming(true);
                setMode('menu');
              }}
            >
              Change name
            </button>
          </div>
        )}

        {mode === 'menu' && !naming && (
          <div className="home__panels">
            <section className="paper home__panel">
              <span className="eyebrow">Play online</span>
              <h2 className="home__panel-title">A room of your own</h2>
              <p className="home__panel-copy">
                Create a table and share the five letter code. Friends join from any device,
                anywhere.
              </p>
              <div className="home__panel-actions">
                <button
                  className="btn btn--brass btn--block"
                  disabled={busy}
                  onClick={() => {
                    sfx.click();
                    createGame(name);
                  }}
                >
                  Create game
                </button>
                <button
                  className="btn btn--paper btn--block"
                  onClick={() => {
                    sfx.click();
                    setMode('join');
                  }}
                >
                  Join game
                </button>
              </div>
            </section>

            <section className="paper home__panel">
              <span className="eyebrow">Local game</span>
              <h2 className="home__panel-title">Around one table</h2>
              <p className="home__panel-copy">
                Host on this machine and let everyone on the same Wi-Fi join by scanning a QR
                code. No accounts, no installs.
              </p>
              <div className="home__panel-actions">
                <button
                  className="btn btn--brass btn--block"
                  disabled={busy}
                  onClick={() => {
                    sfx.click();
                    createGame(name);
                  }}
                >
                  Host local game
                </button>
                <button
                  className="btn btn--paper btn--block"
                  onClick={() => {
                    sfx.click();
                    setMode('local');
                  }}
                >
                  Join local game
                </button>
              </div>
            </section>
          </div>
        )}

        {mode === 'join' && !naming && (
          <section className="paper home__panel home__panel--single">
            <span className="eyebrow">Join a game</span>
            <h2 className="home__panel-title">Enter game code</h2>
            <input
              className="field field--code"
              value={code}
              maxLength={5}
              placeholder="K7P4X"
              autoFocus
              onChange={(event) => {
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                clearJoinError();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && code.length === 5) joinGame(code, name);
              }}
            />
            {joinError && <p className="home__error">{joinError}</p>}
            <div className="home__panel-actions home__panel-actions--row">
              <button
                className="btn btn--brass"
                disabled={code.length !== 5 || busy}
                onClick={() => joinGame(code, name)}
              >
                Join game
              </button>
              <button className="btn btn--ghost" onClick={() => setMode('menu')}>
                Back
              </button>
            </div>
          </section>
        )}

        {mode === 'local' && !naming && (
          <section className="paper home__panel home__panel--single">
            <span className="eyebrow">Local game</span>
            <h2 className="home__panel-title">Join from this Wi-Fi</h2>
            <p className="home__panel-copy">
              {lan?.lanUrl
                ? 'On the hosting machine, press “Host local game”. Then open this address on any device on the same network — or scan the code.'
                : 'This page is being served from a machine with no local network address, so LAN hosting is not available here. Use “Play online” instead, or run the game from your own computer.'}
            </p>
            {lan?.lanUrl && (
              <>
                <div className="home__lan-url">{lan.lanUrl}</div>
                <div className="home__qr">
                  <QrImage url={lan.lanUrl} />
                </div>
              </>
            )}
            <div className="home__panel-actions home__panel-actions--row">
              <button className="btn btn--ghost" onClick={() => setMode('menu')}>
                Back
              </button>
            </div>
          </section>
        )}

        <footer className="home__foot">
          <button className="link-btn" onClick={() => setOpenHelp(true)}>
            How to play
          </button>
          <span className="home__dot">·</span>
          <Switch
            checked={prefs.sound}
            label="Sound"
            onChange={(next) => setPrefs({ sound: next })}
          />
          <span className="home__dot">·</span>
          <Switch
            checked={prefs.music}
            label="Music"
            onChange={(next) => setPrefs({ music: next })}
          />
          {prefs.music && (
            <input
              type="range"
              className="vol-slider"
              min="0"
              max="1"
              step="0.05"
              value={prefs.musicVolume ?? 0.8}
              onChange={(e) => setPrefs({ musicVolume: parseFloat(e.target.value) })}
              style={{ width: '80px', margin: '0 8px', verticalAlign: 'middle' }}
              title="Music Volume"
            />
          )}
          <span className="home__dot">·</span>
          <span className="home__credit">
            An original fan-made deduction game. Not affiliated with any commercial board game.
          </span>
        </footer>

        <div className="home__settings paper">
          <span className="eyebrow">Table settings</span>
          <div className="home__settings-row">
            <Segmented<AiDifficulty>
              label="AI difficulty"
              value={(prefs.difficulty as AiDifficulty) ?? 'medium'}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
              onChange={(difficulty) => {
                setPrefs({ difficulty });
                updateSettings({ aiDifficulty: difficulty });
              }}
            />
            <Segmented<AiPersonality>
              label="AI personality"
              value={(prefs.personality as AiPersonality) ?? 'analytical'}
              options={[
                { value: 'analytical', label: 'Analytical' },
                { value: 'aggressive', label: 'Aggressive' },
                { value: 'careful', label: 'Careful' },
                { value: 'random', label: 'Random' },
              ]}
              onChange={(personality) => {
                setPrefs({ personality });
                updateSettings({ aiPersonality: personality });
              }}
            />
          </div>
        </div>
      </div>

      {openHelp && <HowToPlay onClose={() => setOpenHelp(false)} />}
    </div>
  );
}

function QrImage({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void fetchJson<{ dataUrl: string }>(`/api/qr?url=${encodeURIComponent(url)}`).then((data) =>
      setSrc(data?.dataUrl ?? null),
    );
  }, [url]);
  if (!src) return <div className="home__qr-empty" />;
  return <img src={src} alt={`QR code for ${url}`} width={168} height={168} />;
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" sub="Nine rooms · six suspects · six weapons" onClose={onClose} wide>
      <div className="help">
        <section>
          <h3>The case</h3>
          <p>
            One suspect, one weapon and one room have been sealed in an envelope. Nobody — not even
            the computer — is allowed to look inside. Every other card is dealt out among the
            detectives. Whoever works out the contents of the envelope first wins.
          </p>
        </section>
        <section>
          <h3>A turn</h3>
          <ol>
            <li>Roll the dice — the server rolls them, so nobody can fudge the result.</li>
            <li>
              Move up to that many squares along the corridors. Doors are the only way into a room,
              and stepping into a room ends your move. You may not walk through a room.
            </li>
            <li>
              If you end up in a room, make a <em>suggestion</em>: a suspect and a weapon, in the
              room you are standing in.
            </li>
          </ol>
        </section>
        <section>
          <h3>Suggestions and answers</h3>
          <p>
            The other detectives, in turn, try to disprove your suggestion. The first one holding
            any of the three cards shows you exactly one of them — privately. Everyone else only
            sees that a card changed hands. If nobody can help, the suggestion stands unchallenged,
            which is a very loud clue.
          </p>
        </section>
        <section>
          <h3>Secret passages</h3>
          <p>
            The Study connects to the Kitchen, and the Lounge to the Conservatory. If you start your
            turn in one of them you may slip through instead of rolling — and then suggest in the
            room you arrive in.
          </p>
        </section>
        <section>
          <h3>Mansion rules</h3>
          <ul>
            <li>You may stop short of your full roll (it keeps the corridors from dead-ending).</li>
            <li>The suggested suspect is always summoned into the room.</li>
            <li>One suggestion per turn. Accusations may be made on your own turn.</li>
            <li>
              A wrong accusation ends your investigation: you stay at the table and must still
              answer suggestions, but you may no longer move, suggest or accuse.
            </li>
          </ul>
        </section>
        <section>
          <h3>Playing with bots</h3>
          <p>
            Bots receive exactly the same information a human does: their own cards, the size of
            everyone else's hand, whatever they have been shown, and what they watched happen at the
            table. They keep their own private notebook and deduce from there — they are never
            shown the envelope.
          </p>
        </section>
        <section>
          <h3>Local and online play</h3>
          <p>
            <strong>Online</strong> uses the server this page came from: create a game, share the
            five letter code, and anyone can join from anywhere. <strong>Local</strong> mode is for
            a game hosted on your own computer — everyone on the same Wi-Fi opens the host's
            address. A cloud deployment cannot see your Wi-Fi, so if the host screen shows no
            address, LAN hosting is not available in this environment.
          </p>
        </section>
      </div>
    </Modal>
  );
}
