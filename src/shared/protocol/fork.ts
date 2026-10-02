// flrnoh fork (see FORK.md): the messages of everything this fork adds to the office, so upstream's
// own protocol files only carry a hook line each. protocol.ts puts these into ClientMsg and ServerMsg.

import type { CasinoClientMsg, CasinoServerMsg } from '../casino.js';
import type { BoatClientMsg, BoatServerMsg } from '../boats.js';
import type { BaumarktClientMsg, BaumarktServerMsg } from '../baumarkt-play.js';
import type { ToyClientMsg, ToyServerMsg } from '../shopwares.js';
import type { BungeeState } from '../bungee.js';
import type { DjSetState } from '../djset.js';
import type { GymClientMsg, GymServerMsg } from '../gym.js';
import type { PadelClientMsg, PadelServerMsg } from '../padel/court.js';
import type { RigFrame, RigResult, RigState } from '../rig.js';
import type { SoccerClientMsg, SoccerServerMsg } from '../soccer.js';
import type { Side, TableId, TableSeat, TableSnap } from '../tablegames/tables.js';
import type { TvState } from '../tv.js';
import type { KinoClientMsg, KinoServerMsg } from '../kino.js';
import type { ClawClientMsg, ClawServerMsg, PostClientMsg, PostServerMsg } from '../funshops.js';
import type { TrolleyClientMsg, TrolleyServerMsg } from '../trolley.js';
import type { RideClientMsg, RideServerMsg } from '../ride.js';
import type { TankClientMsg, TankServerMsg } from '../tankstelle-play.js';
import type { CoasterClientMsg, CoasterServerMsg } from '../coaster.js';
import type { KaraokeClientMsg, KaraokeServerMsg } from '../karaoke.js';
import type { BowlingHouseClientMsg, BowlingHouseServerMsg } from '../bowling-house.js';
import type { VoiceRangeClientMsg, VoiceRangeServerMsg } from '../voicerange.js';
import type { VenueHouseClientMsg, VenueHouseServerMsg } from '../venue-house.js';

export type ForkClientMsg =
  | CasinoClientMsg // the casino (shared/casino.ts)
  | GymClientMsg // the gym (shared/gym.ts)
  | PadelClientMsg // padel in the hall (shared/padel/court.ts)
  | SoccerClientMsg // the soccer hall (shared/soccer.ts)
  | BoatClientMsg // the jetskis and the motorboat at the beach (shared/boats.ts)
  | BaumarktClientMsg // the Baumarkt: forklift, pallets, trolleys, tools, paint (shared/baumarkt-play.ts)
  | KinoClientMsg // the cinema's Saal 2 (shared/kino.ts)
  | ToyClientMsg // playing with a toy from the city's toy shop (shared/shopwares.ts)
  | ClawClientMsg // the Spielhalle's claw machine (shared/funshops.ts)
  | PostClientMsg // the Post's postcards (shared/funshops.ts)
  | TrolleyClientMsg // the supermarket's shopping trolley (shared/trolley.ts)
  | RideClientMsg // a bike from the city's bike shop (shared/ride.ts)
  | TankClientMsg // the petrol station and its car wash (shared/tankstelle-play.ts)
  | CoasterClientMsg // DER BRECHER, the roller coaster round the tower (shared/coaster.ts)
  | KaraokeClientMsg // the bowling centre's karaoke bar (shared/karaoke.ts)
  | BowlingHouseClientMsg // the bowling centre's cosmic switch and rental shoes (shared/bowling-house.ts)
  | VenueHouseClientMsg // the Schallwerk's house: concert or club, the light desk, stamp, cloakroom, merch (shared/venue-house.ts)
  | VoiceRangeClientMsg // how far your voice carries (shared/voicerange.ts)
  /** Put a YouTube, SoundCloud or Mixcloud set on at the DJ booth, for everyone on the roof (see shared/djset.ts). */
  | { t: 'dj.play'; url: string }
  /** Back to the house DJ. */
  | { t: 'dj.stop' }
  /** The set's tempo, tapped at the booth: `at` a beat on the office's clock; bpm 0 goes back to what the office heard (shared/djbeats.ts). */
  | { t: 'dj.tap'; bpm: number; at: number }
  /** The party's volume on the roof, 0–2 (2 is Disco), for everyone there (the team's to set, not guests'). */
  | { t: 'dj.volume'; volume: number }
  /** Put a YouTube or Twitch link on the floor's TV, for everyone there (see shared/tv.ts). */
  | { t: 'tv.play'; url: string }
  /** Turn the TV's stream off. */
  | { t: 'tv.stop' }
  /** Step up to a table game on the roof (see shared/tablegames), step back, a move to the host, a snapshot from it. */
  | { t: 'table.join'; table: TableId; side?: Side }
  | { t: 'table.leave' }
  | { t: 'table.input'; table: TableId; input: number[] }
  | { t: 'table.sync'; table: TableId; snap: TableSnap }
  /** Jump off the bungee jetty on the roof (see shared/bungee.ts). */
  | { t: 'bungee.jump' }
  /** Switch the speakers all over your floor on or off. */
  | { t: 'jukebox.speakers'; on: boolean }
  /** Get in the racing rig on your floor (the office answers with `rig`), out of it, your race as it looks now, and your laps at the flag. */
  | { t: 'rig.play' }
  | { t: 'rig.leave' }
  | { t: 'rig.frame'; frame: RigFrame }
  | { t: 'rig.finish'; result: RigResult }
  /** Floors in any order (admins only): the built floors' ids, bottom floor first. */
  | { t: 'floor.order'; ids: string[] }
  /** Furnish a floor in an interior of shared/interiors.ts (admins only), or with null the way its place in the stack does. */
  | { t: 'floor.interior'; id: string; interior: string | null };

export type ForkServerMsg =
  | CasinoServerMsg
  | GymServerMsg
  | PadelServerMsg
  | SoccerServerMsg
  | BoatServerMsg
  | BaumarktServerMsg
  | KinoServerMsg
  | ToyServerMsg
  | ClawServerMsg
  | PostServerMsg
  | TrolleyServerMsg
  | RideServerMsg
  | TankServerMsg
  | CoasterServerMsg
  | KaraokeServerMsg // the bowling centre's karaoke bar
  | BowlingHouseServerMsg
  | VenueHouseServerMsg // the Schallwerk's house
  | VoiceRangeServerMsg // how far someone's voice carries
  /** The DJ set on the roof changed (sent to everyone up there). */
  | { t: 'dj'; state: DjSetState }
  /** The stream on the floor's TV changed (sent to everyone on the floor). */
  | { t: 'tv'; state: TvState }
  /** Who's at the roof's tables (to everyone up there), a table's snapshot, and a move for its host. */
  | { t: 'tables'; tables: TableSeat[] }
  | { t: 'table.sync'; table: TableId; snap: TableSnap }
  | { t: 'table.input'; table: TableId; side: Side; input: number[] }
  /** Someone jumped off the bungee jetty, or came off the rope (to everyone in the building: it's seen from below). */
  | { t: 'bungee'; state: BungeeState }
  /** Who's at the racing rig on your floor now and the building's tables, and their race (to everyone else on the floor). */
  | { t: 'rig'; state: RigState }
  | { t: 'rig.frame'; frame: RigFrame };
