// The casino across the street (flrnoh fork, see FORK.md): roulette, blackjack, poker and a bank
// of slot machines, for play chips only. Nothing can be bought and nothing is paid out: everyone
// starts with START_CHIPS and gets topped back up once a day. Shared by the server (the wallets,
// the tables) and the client (the building, the games' windows).
//
// Inside, the casino is a place of its own like the roof (CASINO is a peer's `floor` while they're
// in there), so people from every floor meet at its tables. Outside, it stands on every floor's
// street, diagonally across from the office.

/** Where you are while you're in the casino (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const CASINO = '@casino';
export const CASINO_NAME = 'Casino';

/** The building's footprint on the street (walls included), south of the road, west of the golf hole. */
export const CASINO_BOX = { minX: -46, maxX: -20, minZ: 36, maxZ: 56 } as const;
/** How tall its walls stand above the street, and how thick they are. */
export const CASINO_HEIGHT = 9;
export const CASINO_WALL = 0.3;
/** The front door, in the middle of its north face (toward the street): its center along x, and how wide. */
export const CASINO_DOOR = { x: -33, width: 2.4, height: 2.8 } as const;
/**
 * Inside: the room between the walls, its floor at y 0 (the interior is its own scene, like the
 * roof, so it doesn't matter how far down the street is on your floor).
 */
export const CASINO_ROOM = {
  minX: CASINO_BOX.minX + CASINO_WALL,
  maxX: CASINO_BOX.maxX - CASINO_WALL,
  minZ: CASINO_BOX.minZ + CASINO_WALL,
  maxZ: CASINO_BOX.maxZ - CASINO_WALL,
  height: 5.2,
} as const;
/** Where you stand when you come in, facing into the room (+z), and where you land outside when you leave, facing the street. */
export const CASINO_ENTRY = { x: CASINO_DOOR.x, z: CASINO_ROOM.minZ + 2.2, rotY: 0 } as const;
export const CASINO_STREET_SPOT = { x: CASINO_DOOR.x, z: CASINO_BOX.minZ - 1.8, rotY: Math.PI } as const;

export type CasinoKind = 'slots' | 'roulette' | 'blackjack' | 'poker';

/** A table (or a slot machine): where it stands inside, which way its players face, and how many sit at it. */
export interface CasinoTableDef {
  id: string;
  kind: CasinoKind;
  name: string;
  x: number;
  z: number;
  /** Which way someone playing at it faces (toward the dealer, or the machine's screen), as a facing angle: (sin, cos) on x/z. */
  rotY: number;
  seats: number;
}

/** How many slot machines stand along the west wall. */
export const SLOT_COUNT = 8;

export const CASINO_TABLES: readonly CasinoTableDef[] = [
  { id: 'roulette', kind: 'roulette', name: 'Roulette', x: -37, z: 44, rotY: 0, seats: 6 },
  { id: 'poker', kind: 'poker', name: 'Poker', x: -37, z: 51.5, rotY: 0, seats: 6 },
  { id: 'blackjack-1', kind: 'blackjack', name: 'Blackjack', x: -28.5, z: 42, rotY: Math.PI / 2, seats: 5 },
  { id: 'blackjack-2', kind: 'blackjack', name: 'Blackjack', x: -28.5, z: 50, rotY: Math.PI / 2, seats: 5 },
  // The slot bank, screens facing east into the room.
  ...Array.from({ length: SLOT_COUNT }, (_, i) => ({
    id: `slots-${i + 1}`,
    kind: 'slots' as const,
    name: `Slot machine ${i + 1}`,
    x: CASINO_ROOM.minX + 0.55,
    z: 39.6 + i * 1.9,
    rotY: -Math.PI / 2,
    seats: 1,
  })),
];
export const CASINO_TABLE_BY_ID = new Map(CASINO_TABLES.map((t) => [t.id, t]));
/** The cashier's counter along the east wall: where your chips are counted. */
export const CASHIER = { x: CASINO_ROOM.maxX - 0.7, z: 46, length: 7 } as const;

// ---- Chips --------------------------------------------------------------------------------------

/** What everyone starts with, and what the daily top-up brings you back up to. */
export const START_CHIPS = 1000;
/** No single stake is bigger than this, at any table. */
export const MAX_BET = 500;
export const MIN_BET = 1;
/** Nobody holds more than this (a runaway jackpot stays a number people can read). */
export const MAX_CHIPS = 10_000_000;

/** Whether `amount` is a stake a table may take: a whole number of chips within the limits. */
export function validBet(amount: unknown, min = MIN_BET, max = MAX_BET): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= min && amount <= max;
}

// ---- The protocol -------------------------------------------------------------------------------
// You go in and out with floor.go (CASINO, and back to your floor with `at` outside the door). At a
// table everything goes through three messages, whatever the game: each game says what its actions
// mean (`action`, `data`) and what its table looks like (`state`), so a new game needs no new
// message types.

export type CasinoClientMsg =
  /** Take a seat at a table (a slot machine: step up to it). You sit at one table at a time. */
  | { t: 'casino.sit'; table: string }
  /** Get up from wherever you sit. */
  | { t: 'casino.stand' }
  /** Play: a bet, a spin, hit or stand… `action` and `data` are the game's own. */
  | { t: 'casino.act'; table: string; action: string; data?: unknown };

export type CasinoServerMsg =
  /** Your chips. `nextTopUpAt`: when the daily top-up can bring you back up to START_CHIPS, if you're below it and had today's. */
  | { t: 'casino.wallet'; chips: number; nextTopUpAt?: number }
  /** A table as you see it (a game's own shape: see its module). Everyone in the casino gets every table's. */
  | { t: 'casino.table'; table: string; state: unknown }
  /** How your play went: a toast, and whatever the game's window animates (`data`). `delta`: what it did to your chips. */
  | { t: 'casino.result'; table: string; text: string; delta?: number; data?: unknown };

/** Whether `t` is one of the casino's messages (the server hands those to the casino). */
export const isCasinoMsg = (t: string): t is CasinoClientMsg['t'] => t === 'casino.sit' || t === 'casino.stand' || t === 'casino.act';
