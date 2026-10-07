import { useEffect, useRef } from 'react';
import { useGame } from './store/gameStore';
import { Home } from './lobby/Home';
import { Lobby } from './lobby/Lobby';
import { GameScreen } from './game/GameScreen';
import { ConnectionStrip, ToastStack } from './components/ui';
import { unlockAudio } from './audio/sfx';
import { unlockMusic } from './audio/music';

export default function App() {
  const screen = useGame((s) => s.screen);
  const init = useGame((s) => s.init);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    init();
  }, [init]);

  // A gentle click on anything interactive keeps the sound engine warm.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      unlockMusic();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <>
      {screen === 'home' && <Home />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <GameScreen />}
      <ToastStack />
      <ConnectionStrip />
    </>
  );
}
