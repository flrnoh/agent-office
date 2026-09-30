import type { GameState, TableGame } from './game.js';
import { hockey } from './hockey.js';
import { kicker } from './kicker.js';
import { pingpong } from './pingpong.js';
import { pool } from './pool.js';
import type { TableId } from './tables.js';

/** Each table's game (see game.ts). */
export const GAMES: Record<TableId, TableGame<GameState>> = {
  kicker: kicker as unknown as TableGame<GameState>,
  pool: pool as unknown as TableGame<GameState>,
  hockey: hockey as unknown as TableGame<GameState>,
  pingpong: pingpong as unknown as TableGame<GameState>,
};
