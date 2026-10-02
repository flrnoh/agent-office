import { BALLS, type GameLine, type LeagueBoard, type MyGames } from '../../../shared/bowling-game';
import { MIN_GAMES } from '../../../shared/bowling-league';
import { h, openModal, type Modal } from '../../ui/dom';
import { isoWeek } from './monitor';
import './ui.css';

/*
 * The bowling game's windows (flrnoh fork, see FORK.md "Bowling lanes"): the house balls at the
 * return (every weight in its own colours and finish), and the league's window at its board: the
 * week's table with last week's champion, the all-time records, and your own games. Both have the ✕
 * top right; ✕ or Esc goes straight back to looking around.
 */

/** A ball's look for the window: its two colours as a glossy sphere. */
const swatch = (id: number) => {
  const b = BALLS[id];
  return h('span.bowl-swatch', { style: `background: radial-gradient(circle at 32% 28%, #fff8 0 8%, ${b.colors[1]} 22%, ${b.colors[0]} 62%, #0008 100%)` });
};

/** The house balls: pick one, it's yours for every ball you bowl until you pick another. */
export function openBalls(current: number, pick: (id: number) => void) {
  const list = h(
    'ul.bowl-balls',
    {},
    ...BALLS.map((b) => {
      const li = h(
        'li',
        { tabindex: 0, role: 'button', class: b.id === current ? 'on' : '', title: `${b.name}, ${b.lbs} lbs` },
        swatch(b.id),
        h('div', {}, h('div.bowl-ball-name', {}, b.name), h('div.bowl-ball-meta', {}, `${b.lbs} lbs · ${({ glitter: 'Glitzer', marble: 'Marmor', pearl: 'Perlmutt', swirl: 'Wirbel' } as const)[b.finish]}`)),
      );
      const choose = () => {
        modal.close();
        pick(b.id);
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          choose();
        }
      });
      return li;
    }),
  );
  const el = h(
    'div.modal.bowl-modal',
    { role: 'dialog', 'aria-label': 'Kugel wählen' },
    h('header', {}, h('h2', {}, '🎳 Kugel wählen')),
    h('div.body', {}, list),
    h('footer', {}, h('span.grow', {}, 'Faustregel: etwa ein Zehntel deines Gewichts. Leichter rollt schneller, schwerer räumt mehr ab.')),
  );
  const modal = openModal(el, { doing: '🎳 sucht eine Kugel aus' });
  setTimeout(() => (list.querySelector('li.on') as HTMLElement | null)?.focus(), 30);
}

const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** The league's window: Woche, Allzeit, Meine Spiele. `refresh` asks the office again (it answers with `fill`). */
export function openLeague(ask: () => void, closed: () => void): { fill(board: LeagueBoard, mine: MyGames): void; modal: Modal } {
  const tabs = ['Woche', 'Allzeit', 'Meine Spiele'] as const;
  type Tab = (typeof tabs)[number];
  let tab: Tab = 'Woche';
  let data: { board: LeagueBoard; mine: MyGames } | null = null;
  const body = h('div.body.bowl-league', {}, h('p.bowl-empty', {}, 'Lädt …'));
  const nav = h('nav.bowl-tabs', { role: 'tablist', 'aria-label': 'Liga' });
  const buttons = tabs.map((t) => {
    const b = h('button.bowl-tab', { type: 'button', role: 'tab', onclick: () => show(t) }, t) as HTMLButtonElement;
    nav.append(b);
    return b;
  });
  const row = (cells: (string | number)[], cls = '') => h('tr', { class: cls }, ...cells.map((c) => h('td', {}, String(c))));
  const table = (head: string[], rows: HTMLElement[]) => h('table.bowl-table', {}, h('thead', {}, h('tr', {}, ...head.map((x) => h('th', {}, x)))), h('tbody', {}, ...rows));
  const games = (list: GameLine[], withName: boolean) => table(withName ? ['', 'Name', 'Pins', 'X', '/', 'Datum'] : ['', 'Pins', 'X', '/', 'Datum'], list.map((g, i) => row(withName ? [`${i + 1}.`, g.name, g.score, g.strikes, g.spares, date(g.at)] : [`${i + 1}.`, g.score, g.strikes, g.spares, date(g.at)], g.score === 300 ? 'perfect' : '')));
  const empty = (text: string) => h('p.bowl-empty', {}, text);
  function show(t: Tab) {
    tab = t;
    buttons.forEach((b, i) => {
      b.classList.toggle('on', tabs[i] === t);
      b.setAttribute('aria-selected', String(tabs[i] === t));
    });
    if (!data) return;
    const { board: b, mine } = data;
    const parts: HTMLElement[] = [];
    if (t === 'Woche') {
      parts.push(h('h3', {}, `🏆 Wochenliga · KW ${isoWeek(b.week)}`), h('p.bowl-note', {}, 'Montag bis Sonntag. Es zählt der Schnitt deiner besten 3 Spiele der Woche (ein fehlendes Spiel zählt 0).'));
      parts.push(b.table.length ? table(['', 'Name', 'Schnitt', 'Spiele', 'Bestes'], b.table.map((r, i) => row([i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`, r.name, r.avg.toFixed(1), r.games, r.best]))) : empty('Diese Woche hat noch keiner gespielt. Ran an die Kugel!'));
      parts.push(h('h3', {}, '👑 Champion letzte Woche'), b.champion ? h('p.bowl-champ', {}, `${b.champion.name} mit ${b.champion.avg.toFixed(1)} Schnitt – trägt diese Woche die Krone.`) : empty('Letzte Woche hat niemand gespielt.'));
    } else if (t === 'Allzeit') {
      parts.push(h('h3', {}, '🔝 Höchste Spiele'), b.high.length ? games(b.high, true) : empty('Noch keine Spiele.'));
      parts.push(h('h3', {}, `📈 Bester Schnitt (ab ${MIN_GAMES} Spielen)`), b.average.length ? table(['', 'Name', 'Schnitt', 'Spiele', 'Bestes'], b.average.map((r, i) => row([`${i + 1}.`, r.name, r.avg.toFixed(1), r.games, r.best]))) : empty(`Noch keiner mit ${MIN_GAMES} Spielen.`));
      parts.push(h('h3', {}, '💥 Meiste Strikes'), b.strikes.length ? table(['', 'Name', 'Strikes'], b.strikes.map((r, i) => row([`${i + 1}.`, r.name, r.strikes]))) : empty('Noch kein Strike.'));
      parts.push(h('h3', {}, '💯 Perfekte Spiele'), b.perfect.length ? table(['Name', '300er'], b.perfect.map((r) => row([r.name, r.count]))) : empty('Noch keins – die 300 wartet.'));
    } else {
      parts.push(h('h3', {}, `🎳 ${mine.name}`));
      parts.push(h('div.bowl-mine', {}, ...[['Spiele', mine.count], ['Schnitt', mine.count ? mine.average.toFixed(1) : '–'], ['Bestes', mine.high || '–'], ['Strikes', mine.strikes], ['Spares', mine.spares]].map(([k, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, String(k))))));
      parts.push(mine.games.length ? games(mine.games, false) : empty('Du hast noch kein Spiel zu Ende gespielt.'));
    }
    body.replaceChildren(...parts);
  }
  const el = h('div.modal.bowl-modal.wide', { role: 'dialog', 'aria-label': 'Liga & Bestenliste' }, h('header', {}, h('h2', {}, '🎳 Liga & Bestenliste')), nav, body);
  const modal = openModal(el, { doing: '🏆 schaut sich die Bowling-Liga an', onClose: closed });
  show(tab);
  ask();
  return {
    modal,
    fill(board, mine) {
      data = { board, mine };
      show(tab);
    },
  };
}
