# 🕵️‍♂️ Mystery Mansion

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)]()
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)]()
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)]()
[![Express.js](https://img.shields.io/badge/Express.js-000000?logo=express&logoColor=white)]()
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?logo=socketdotio&logoColor=white)]()
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)]()

**An original, server-authoritative deduction board game for 3–6 players — any mix of humans and bots, online or over a local network.** 

Mystery Mansion follows the classic murder-mystery board-game formula: move through a mansion, suggest a suspect + weapon + room, privately disprove suggestions, and be the first to name the three cards sealed in the envelope!

> **Copyright (c) 2026 Aaryav Rastogi**  
> The names, characters, rooms, board layout, card art, pawn art, type, and sound are all original work produced for this project. This is a personal/educational implementation and is not affiliated with, endorsed by, or derived from any commercial board game or its artwork.

---

## 🚀 Quickstart

Mystery Mansion uses a modern monorepo architecture (Vite + React frontend, Node/Express backend). 

```bash
# 1. Install dependencies across all workspaces
npm install

# 2. Build the shared types, server, and client securely
npm run build

# 3. Start the game server (serves the client + websocket)
npm start
```

Then open **http://localhost:3000** in your browser.

**For development (with hot-reload):**
```bash
npm run dev
```

---

## ☁️ Deployment (Recommended: Render)

This project is fully configured for one-click deployment on [Render](https://render.com), which natively supports the WebSockets and persistent memory required for the game.

1. Push this repository to GitHub.
2. Go to the Render Dashboard and click **New +** > **Blueprint**.
3. Connect your repository. Render will automatically read the included `render.yaml` file, build the game, and deploy it on their free tier.

*Note: Serverless platforms like Vercel or Netlify are not recommended as they do not support persistent WebSocket connections.*

---

## 🎨 Artwork & Assets (100% Secure)

The game ships with original vector art, but every picture is an **optional slot**. You can drop your own files in with the same name to replace them.

To protect the game from asset scraping and cheating, all artwork and audio are **bundled and hashed by Vite** during the build process. 

**Where to put your assets:**
| Asset Type | Location (`client/src/assets/`) | Size |
| --- | --- | --- |
| **Card Art** (21 files) | `art/cards/suspect-vance.png`, `weapon-rope.png`, … | 768 × 1024 (suspects), 1024 × 768 (weapons), 1024 × 1024 (rooms) |
| **Room Floors** (9 files) | `art/rooms/study.png`, `hall.png`, … | 1024 × 1024 |
| **Board Surface** | `art/board/board-bg.png` | 2080 × 2160 |
| **Opening Film** | `cinematic/intro.mp4` | 1080p, ~8 s, with sound, under 5 MB |
| **Background Music**| `audio/music.mp3` | looping, 15 s or longer, under 2 MB |

> ⚠️ **Important:** Because the assets are securely compiled into the final JavaScript bundle, **you must run `npm run build`** after adding or changing any artwork for it to appear in the game.

---

## 🎮 How to Play

1. **Create Game / Host Local Game:** You get a five-character room code (e.g., `K7P4X`).
2. **Join with Code:** Identity is Skribbl-like (no account, no passwords). Pick a name, and your session is securely remembered via a 192-bit token.
3. **Bots (Optional):** Click the switch on any empty chair to seat an AI bot. You can play with any mix of humans and bots.
4. **Gameplay:** On your turn, roll the dice, move to a room, and make a **suggestion** (suspect + weapon in that room). The first detective holding one of those cards must privately show it to you.
5. **Accusation:** When you are certain, accuse! If you are correct, the envelope is revealed and you win. If wrong, you are out of the case.
6. **Detective Notes:** Use the built-in private pad to track your deductions.

---

## 🤖 The Bots

The AI (`AIController`) is built to be fair. It receives *exactly the same* information a human player does—no engine hooks, no peeking at the solution, and no looking at other hands. 
- **Difficulty:** Changes how well the bot uses the information it gathers (Easy/Medium/Hard). Hard bots will ruthlessly track who passed on what cards.
- **Personality:** Changes their taste in moves and risks (Analytical/Aggressive/Careful/Random).

---

## 🔒 Security Model

Mystery Mansion was built from the ground up to be **100% Server-Authoritative** and heavily resistant to cheating.

- **Hostile Client Architecture:** The client is treated as a simple renderer. It sends *intents* (`roll`, `suggest`, `accuse`), and the server calculates the outcomes.
- **Zero Data Leakage:** The envelope contents, other players' hands, and private notes are *never* sent over the network to anyone but their owner.
- **Abuse Resistance:** Intent flooding is throttled. Prototype pollution and malformed packets are strictly caught. Names are sanitized to prevent markup injection.
- **Asset Obfuscation:** All images and audio are hashed by Vite, making it impossible for someone to scrape the URLs to see the cards.

Every simulated game in our test suite verifies that no player receives data they shouldn't legally know.

---

## 🏗️ Architecture Summary

```text
shared/    rules, data and types — imported by both server and client
  src/rules/       boardGraph, movement, deck, engine   ← ALL rules live here
server/    authority
  src/game/Room.ts        one table: intents in, PlayerViews out, AI scheduling
client/    presentation only — computes no dice, no solution, no legal moves
  src/board/  SVG mansion, pawns
  src/cards/  original card art
tests/     119 specs (100% passing)
```
For a deep dive into the design rationale, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---
*Made with ❤️ by Aaryav Rastogi.*
