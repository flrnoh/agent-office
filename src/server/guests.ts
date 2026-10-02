import type { ClientMsg } from '../shared/protocol.js';
import { radioRequestShape } from './radio.js';

/*
 * The guest role (flrnoh fork, see FORK.md): guests walk around, chat, talk, play and watch the
 * workers' terminals, and nothing else. Every message a page can send is sorted into exactly one of
 * the three lists below. A message type upstream adds lands in none of them, and then the server
 * doesn't compile (see `allReviewed`) until someone decides whether guests may send it.
 */

/** All a guest may send: walking about, talking, playing, and opening a worker's terminal to watch. Party guests (party.ts) get these minus watching and the whiteboard. */
const GUEST = [
  'move', 'act', 'golf', 'emote', 'sit', 'profile',
  'voice', 'rtc', 'chat', 'floor.go', 'ball.take', 'ball.throw',
  'toss', 'dog.pet', 'gong', 'horn', 'dj.play', 'dj.stop', 'tv.play', 'tv.stop', 'car.enter', 'car.leave',
  'car.drive', 'car.honk', 'worker.attach', 'worker.detach', 'wb.open', 'wb.close',
  'wb.update', 'wb.pointer', 'jukebox.play', 'jukebox.skip', 'jukebox.stop', 'cabinet.play',
  'cabinet.leave', 'cabinet.frame', 'ping',
  'casino.sit', 'casino.stand', 'casino.act', // fork: the casino, for play chips
  'gym.sit', 'gym.stand', 'gym.act', // fork: the gym across the street
  // The racing rig (fork, see server/rig.ts).
  'rig.play', 'rig.leave', 'rig.frame', 'rig.finish',
  'table.join', 'table.leave', 'table.input', 'table.sync', // fork: games on the roof
  'padel.look', 'padel.join', 'padel.leave', 'padel.input', 'padel.sync', // fork: padel in the hall
  'bungee.jump', // fork: bungee off the roof
  'soccer.join', 'soccer.leave', 'soccer.kick', 'soccer.slide', // fork: the soccer hall (and its slide tackles)
  'boat.enter', 'boat.leave', 'boat.drive', 'boat.horn', // fork: jetskis and the motorboat at the beach
  'bm.fork.enter', 'bm.fork.leave', 'bm.fork.drive', 'bm.fork.horn', 'bm.trolley.grab', 'bm.trolley.push', 'bm.trolley.let', 'bm.hold', 'bm.use', 'bm.mix', // fork: the Baumarkt
  'kino.play', 'kino.stop', // fork: your own film in the cinema's Saal 2
  'toy.use', // fork: toys from the city's toy shop
  'claw.drop', 'post.recipients', 'post.send', 'post.check', // fork: the Spielhalle's claw machine, the Post's postcards
  'trolley.set', // fork: the supermarket's shopping trolley
  'bike.ride', 'bike.bell', // fork: bikes from the city's bike shop
  'tank.fill', 'tank.wash', // fork: the petrol station and its car wash
  'bowling.lights', 'bowling.shoes', // fork: the bowling centre's cosmic switch and rental shoes
  'mg.look', 'mg.take', 'mg.return', 'mg.group', 'mg.putt', 'mg.pickup', // fork: the bowling centre's mini golf
] as const satisfies readonly ClientMsg['t'][];

/** What a guest's page sends on its own (resizing a terminal it watches, polling boards): dropped without a word. */
const QUIET = [
  'term.resize', 'term.typing', 'gh.refresh', 'limits.refresh', 'floor.repos', 'team.get',
  'accounts.get', 'signins.get', 'changes.watch', 'changes.unwatch', 'upgrade.check', 'doing',
] as const satisfies readonly ClientMsg['t'][];

/** For the team only: typing, hiring, GitHub, queues, meetings, settings, accounts. Refused, with a note. */
const TEAM_ONLY = [
  'accounts.cancel', 'accounts.invite', 'accounts.revoke', 'accounts.role', 'accounts.shared',
  'carry', 'changes.commit', 'changes.diff', 'changes.discard', 'changes.pr',
  'decor.add', 'decor.remove', 'decor.update', 'desk.label', 'dog.name',
  'floor.add', 'floor.cancel', 'floor.expand', 'floor.interior', 'floor.order', 'floor.projectsDir', 'floor.remove', 'floor.shrink',
  'gh.close', 'gh.comment', 'gh.labels', 'gh.merge', 'jukebox.speakers', 'leaveOnMerge.set',
  'machine.limit', 'map.set', 'meeting.clear', 'meeting.start', 'meeting.stop',
  'notify.test', 'notify.webhook', 'prompts.agent', 'prompts.set', 'queue.add',
  'queue.clear', 'queue.limit', 'queue.move', 'queue.remove', 'queue.retry',
  'signins.cancel', 'signins.code', 'signins.office', 'signins.signout', 'signins.start',
  'signins.token', 'station.prompt', 'team.invite', 'team.remove', 'term.input',
  'theme.set', 'upgrade.start', 'worker.kill', 'worker.pr', 'worker.prompt',
  'worker.rebuild', 'worker.resume', 'worker.spawn', 'worker.worktree',
] as const satisfies readonly ClientMsg['t'][];

type Reviewed = (typeof GUEST)[number] | (typeof QUIET)[number] | (typeof TEAM_ONLY)[number];
type Unreviewed = Exclude<ClientMsg['t'], Reviewed>;
/**
 * Fails to compile when upstream adds a message type nobody has sorted yet: the error names it.
 * Put it in GUEST if it's play or looking, else in TEAM_ONLY (QUIET if the page sends it by itself).
 */
export const allReviewed: [Unreviewed] extends [never] ? true : { unreviewed: Unreviewed } = true;

export const GUEST_MSGS: ReadonlySet<string> = new Set<string>(GUEST);
export const GUEST_QUIET: ReadonlySet<string> = new Set<string>(QUIET);
export const TEAM_ONLY_MSGS: ReadonlySet<string> = new Set<string>(TEAM_ONLY);

/**
 * What a guest's page may load besides the page itself: the whiteboard's pictures, the jukebox's
 * radio, and pictures already hanging on a wall (the image proxy fetches any address, so not just any). Not a worker's
 * changes, the project's docs, GitHub details, search or dropping files into a terminal; any route
 * upstream adds is refused to guests until it's listed here.
 */
export function guestMayFetch(p: string, url: URL, onAWall: (imageUrl: string) => boolean): boolean {
  if (!p.startsWith('/api/')) return true;
  if (p === '/api/whiteboard/file') return true;
  if (p === '/api/image') return onAWall(url.searchParams.get('url') ?? '');
  // The jukebox's radio: a built-in station, or the stream on a floor's jukebox (the handler checks it's that one).
  if (p === '/api/radio') return radioRequestShape(url.searchParams);
  return false;
}
