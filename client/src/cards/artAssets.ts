/**
 * Where the raster artwork lives.
 *
 * Everything under `client/src/assets/art/` is bundled and hashed by Vite.
 *
 * Replace any file in the assets folder with your own artwork, keeping the same name,
 * and rebuild the project for it to take effect.
 */
const cardImages = import.meta.glob('../assets/art/cards/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const roomImages = import.meta.glob('../assets/art/rooms/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const boardImages = import.meta.glob('../assets/art/board/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const cinematicVideos = import.meta.glob('../assets/cinematic/*.mp4', { eager: true, import: 'default' }) as Record<string, string>;

/** `suspect:vance` -> `/assets/art/cards/suspect-vance-[hash].png` */
export function cardArtUrl(cardId: string): string {
  const name = cardId.replace(':', '-');
  return cardImages[`../assets/art/cards/${name}.png`] || '';
}

/** `study` -> `/assets/art/rooms/study-[hash].png` */
export function roomArtUrl(roomId: string): string {
  return roomImages[`../assets/art/rooms/${roomId}.png`] || '';
}

/** The board surface behind the grid. */
export const BOARD_ART_URL = boardImages['../assets/art/board/board-bg.png'] || '';

/** Film shown before the first turn. Absent by default. */
export const INTRO_FILM_URL = cinematicVideos['../assets/cinematic/intro.mp4'] || '';
