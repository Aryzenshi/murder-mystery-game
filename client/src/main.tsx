import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';
import './styles/ui.css';
import './styles/board.css';
import './styles/cards.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
