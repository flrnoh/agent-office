import { roomName, type RoomView } from '../../../shared/proberaum';
import { DRINK_BY_ID, type Drink } from '../../../shared/rooftop';
import type { RehearsalRoomId } from '../../../shared/venue';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import { toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';
import type { RecorderUi } from './recui';
import type { ProberaumSound } from './sound';
import type { ProbeUi } from './ui';

/*
 * What E does at each thing in the rehearsal wing, and what the hint bar says there (flrnoh fork, see
 * FORK.md "The rehearsal wing"). The doors: open and shut while a room's free; while it's booked the
 * band opens it and everyone else knocks; inside, the band lets whoever knocked in. The screens and
 * the lobby's board book; the mixers record; the whiteboards take a setlist; the fridges hand out
 * beer, the machines drinks and strings, the jar takes a coin.
 */

export interface WingHere {
  room(id: RehearsalRoomId): RoomView | undefined;
  /** You're in that room (inside its walls). */
  inside(id: RehearsalRoomId): boolean;
  /** You're in its band (it's booked). */
  member(id: RehearsalRoomId): boolean;
  /** Where a thing sounds from. */
  at(it: Interactable): { x: number; y: number; z: number };
  sound(kind: ProberaumSound, at?: { x: number; y: number; z: number }): void;
  /** Hand over a drink or a snack (as the bowling centre's counter does). */
  served(d: Drink): void;
  cutOff(): boolean;
  /** Roll a new band name for the chalkboard. */
  roll(): string;
  bandIdea(): string;
  /** The lava lamp's colour, round the next. */
  lava(): void;
}

type HintOut = { k: string; parts: (HTMLElement | string)[] };

const LOCKER_FINDS = ['drei Paar Drumsticks und ein alter Döner', 'ein Kapodaster, eingestaubt', 'Setlists von 2014', 'ein Stimmgerät ohne Batterie', 'jemandes Lieblingskabel (nicht anfassen)', 'Ohrstöpsel, benutzt. Igitt.', 'ein Zettel: „Wer das liest, schuldet mir ein Bier“', 'nichts. Spind 4 ist leer.'];

export function wingActions(ctx: Ctx, here: WingHere, ui: ProbeUi, rec: RecorderUi) {
  let lastUse = 0;
  const send = ctx.net.send.bind(ctx.net);

  function door(id: RehearsalRoomId, r: RoomView | undefined, it: Interactable) {
    const inside = here.inside(id);
    const booked = !!r?.booking;
    const member = here.member(id);
    const at = here.at(it);
    if (inside && member && r?.knocks.length) {
      send({ t: 'probe.letin', room: id, id: r.knocks[0].id });
      return;
    }
    if (!inside && booked && !member && !r?.door) {
      send({ t: 'probe.knock', room: id });
      here.sound('knock', at);
      return;
    }
    if (!inside && booked && !member && r?.door) {
      // Open, but not yours: a knock on the frame.
      send({ t: 'probe.knock', room: id });
      here.sound('knock', at);
      return;
    }
    send({ t: 'probe.door', room: id, open: !r?.door });
  }

  function use(it: Interactable, k: string): boolean {
    const s = it.probe;
    if (it.kind !== 'proberaum' || !s) return false;
    if (k !== 'E') return true;
    // Some pages hear one press twice (the part and the kind): once is enough.
    if (performance.now() - lastUse < 150) return true;
    lastUse = performance.now();
    const id = s.room;
    const r = id ? here.room(id) : undefined;
    switch (s.what) {
      case 'door':
      case 'doorin':
        door(id!, r, it);
        break;
      case 'panel':
        ui.booking(id);
        break;
      case 'board':
        ui.booking();
        break;
      case 'mixer':
        rec.show(id!);
        break;
      case 'setlist':
        ui.setlist(id!, here.inside(id!) && (!r?.booking || here.member(id!)));
        break;
      case 'notes':
        ui.notes();
        break;
      case 'polaroids':
        ui.polaroids();
        break;
      case 'bandname':
        ui.bandname(here.roll(), () => here.roll());
        break;
      case 'fridge': {
        const studio = id === 'studio';
        const d = DRINK_BY_ID.get(studio ? 'mate' : here.cutOff() ? 'spezi' : 'helles');
        if (d) here.served(d);
        break;
      }
      case 'vending':
        ui.menu('🥤 Getränkeautomat', 'Steck ’nen Euro rein – heute aufs Haus.', (['mate', 'spezi', 'cola'] as const).flatMap((x) => {
          const d = DRINK_BY_ID.get(x);
          return d ? [{ emoji: d.emoji, name: d.name, meta: `${d.blurb} · 1,50 €`, pick: () => {
            here.sound('vend', here.at(it));
            setTimeout(() => here.served(d), 900);
          } }] : [];
        }));
        break;
      case 'strings':
        ui.menu('🎸 Saitenautomat', 'Für den Notfall um 23 Uhr. Kostet nix, ist ja Spiel.', [
          ['🎸', 'Saiten 10-46', 'Für Gitarre: endlich wieder stimmen'],
          ['🎻', 'Bass-Saiten', 'Fünf Jahre alt waren die alten'],
          ['🥢', 'Sticks 5A', 'Die alten sind Zahnstocher'],
          ['🔺', 'Plektren', 'Sechs Stück, eins bleibt'],
          ['🔋', '9V-Block', 'Für das Effektgerät, das immer ausgeht'],
          ['🦻', 'Ohrstöpsel', 'Euer Ohrenarzt sagt danke'],
        ].map(([emoji, name, meta]) => ({ emoji, name, meta, pick: () => {
          here.sound('vend', here.at(it));
          toast(`${emoji} ${name} gezogen`);
        } })));
        break;
      case 'rental':
        ui.menu('🎛️ Backline-Verleih', 'Drums, Amps, Keys und Mics stehen in jedem Raum schon bereit.', [
          ['🔌', 'Klinkenkabel, 6 m', 'Rot, geht garantiert'],
          ['🎚️', 'DI-Box', 'Für den Bass direkt ins Pult'],
          ['🎧', 'Kopfhörer', 'Fürs Studio, mit Spiralkabel'],
          ['🪢', 'Gitarrengurt', 'Leder, schon eingespielt'],
          ['🧲', 'Gaffa-Tape', 'Hält alles zusammen'],
        ].map(([emoji, name, meta]) => ({ emoji, name, meta, pick: () => toast(`${emoji} ${name} ausgeliehen – bring’s zurück!`) })));
        break;
      case 'tip':
        send({ t: 'probe.tip' });
        here.sound('coin', here.at(it));
        break;
      case 'lockers':
        here.sound('locker', here.at(it));
        toast(`🔐 Im Spind: ${LOCKER_FINDS[Math.floor(Math.random() * LOCKER_FINDS.length)]}`);
        break;
      case 'lava':
        here.lava();
        break;
      case 'kicker': {
        here.sound('kicker', here.at(it));
        const [a, b] = [Math.floor(Math.random() * 6), Math.floor(Math.random() * 6)];
        toast(a === b ? `⚽ ${a}:${b} – Revanche!` : `⚽ Tor! ${a}:${b} für ${a > b ? 'Rot' : 'Blau'}`);
        break;
      }
    }
    ctx.hint.invalidate();
    return true;
  }

  function hint(it: Interactable): HintOut | null {
    const s = it.probe;
    if (it.kind !== 'proberaum' || !s) return null;
    const id = s.room;
    const r = id ? here.room(id) : undefined;
    const name = id ? roomName(id) : '';
    switch (s.what) {
      case 'door':
      case 'doorin': {
        const inside = here.inside(id!);
        const member = here.member(id!);
        const b = r?.booking;
        const title = hintTitle(`🚪 ${name}${b ? ` · ${b.band}` : ''}`);
        const k = `door|${id}|${inside}|${member}|${r?.door}|${b?.band}|${r?.knocks.map((x) => x.name).join()}`;
        if (inside && member && r?.knocks.length) return { k, parts: [title, key('E', `${r.knocks[0].name} reinlassen`), aside('klopft gerade')] };
        if (!inside && b && !member) return { k, parts: [title, key('E', 'Anklopfen'), aside(`gebucht bis ${new Date(b.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`)] };
        return { k, parts: [title, key('E', r?.door ? 'Tür zu' : 'Tür auf'), aside(b ? (member ? 'deine Band' : 'gebucht') : 'frei')] };
      }
      case 'panel':
        return { k: `panel|${id}|${r?.booking?.band}`, parts: [hintTitle(`📟 ${name}`), key('E', r?.booking ? 'Buchung ansehen' : 'Buchen'), aside(r?.booking ? `${r.booking.band}` : 'frei')] };
      case 'board':
        return { k: 'board', parts: [hintTitle('🗓️ Belegungsplan'), key('E', 'Raum buchen')] };
      case 'mixer': {
        const st = r?.rec ? '● nimmt auf' : r?.playing ? '▶ spielt ab' : 'bereit';
        return { k: `mixer|${id}|${st}`, parts: [hintTitle(id === 'studio' ? '🎚️ Mischpult · Aufnahme' : '🎚️ Mixer · Recorder'), key('E', 'Aufnahme'), aside(st)] };
      }
      case 'setlist':
        return { k: `setlist|${id}`, parts: [hintTitle('📝 Setlist'), key('E', 'Schreiben')] };
      case 'notes':
        return { k: 'notes', parts: [hintTitle('📌 Schwarzes Brett'), key('E', 'Zettel anpinnen')] };
      case 'polaroids':
        return { k: 'polaroids', parts: [hintTitle('📸 Hier haben geprobt'), key('E', 'Ansehen')] };
      case 'bandname':
        return { k: `bandname|${here.bandIdea()}`, parts: [hintTitle('🎲 Bandname-Generator'), key('E', 'Würfeln')] };
      case 'fridge':
        return { k: `fridge|${id}`, parts: [hintTitle(id === 'studio' ? '🧊 Mini-Kühlschrank' : '🍺 Bierkühlschrank'), key('E', id === 'studio' ? 'Mate nehmen' : 'Eins nehmen')] };
      case 'vending':
        return { k: 'vending', parts: [hintTitle('🥤 Getränkeautomat'), key('E', 'Ziehen')] };
      case 'strings':
        return { k: 'strings', parts: [hintTitle('🎸 Saitenautomat'), key('E', 'Ziehen')] };
      case 'rental':
        return { k: 'rental', parts: [hintTitle('🎛️ Backline-Verleih'), key('E', 'Leihen')] };
      case 'tip':
        return { k: 'tip', parts: [hintTitle('🪙 Trinkgeld'), key('E', 'Münze rein')] };
      case 'lockers':
        return { k: 'lockers', parts: [hintTitle('🔐 Spinde'), key('E', 'Reinschauen')] };
      case 'lava':
        return { k: 'lava', parts: [hintTitle('🫧 Lavalampe'), key('E', 'Andere Farbe')] };
      case 'kicker':
        return { k: 'kicker', parts: [hintTitle('⚽ Kicker'), key('E', 'Eine Runde')] };
    }
    return null;
  }

  return { use, hint };
}
