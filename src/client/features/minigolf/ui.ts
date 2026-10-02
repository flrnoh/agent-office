import { COURSE_PAR, HOLES } from '../../../shared/minigolf-holes';
import { MAX_STROKES, MG_COLORS, cardHoles, cardText, cardTotal, toPar, type MgMine, type MgPlayer, type MgView } from '../../../shared/minigolf';
import { isTyping } from '../../player';
import { $, h } from '../../ui/dom';
import './ui.css';

/*
 * The mini golf on the page (flrnoh fork, see FORK.md "Black-light mini golf"): the bar at the top
 * while you have a putter (the hole, its par, your stroke, whose turn it is, the power meter), and
 * the scorecard (Tab in the room, or E at the board): every card being played, the best rounds ever
 * and this week, and your own records. Never takes the mouse: ✕, Tab or Esc close it.
 */

export class MinigolfUi {
  private readonly bar: HTMLElement;
  private readonly title: HTMLElement;
  private readonly info: HTMLElement;
  private readonly turn: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly card: HTMLElement;
  private cardOpen = false;
  private shown = '';
  private cardKey = '';

  constructor() {
    this.title = h('div.mg-title');
    this.info = h('div.mg-info');
    this.turn = h('div.mg-turn');
    this.fill = h('span.mg-fill');
    this.mark = h('span.mg-last');
    this.meter = h('div.mg-meter', {}, this.fill, this.mark);
    this.bar = h('div.mg-bar.hidden', { 'aria-label': 'Minigolf' }, this.title, this.info, this.turn, this.meter);
    this.card = h('div.mg-card', { hidden: '' });
    $('hud').append(this.bar, this.card);
  }

  /** The bar: `me` with a putter (null: hidden), the power (0–1, or -1 with the meter hidden) and the last putt's. */
  renderBar(me: MgPlayer | null, turn: { mine: boolean; whose: string | null }, power: number, last: number) {
    this.bar.classList.toggle('hidden', !me);
    if (!me) return;
    const def = HOLES[me.hole - 1];
    const color = MG_COLORS[me.color % MG_COLORS.length][0];
    const text = def
      ? `${def.n}|${def.name}|${def.par}|${me.strokes}|${cardTotal(me.card)}|${toPar(me.card)}|${turn.mine}|${turn.whose}|${color}`
      : `done|${cardTotal(me.card)}|${toPar(me.card)}|${color}`;
    if (text !== this.shown) {
      this.shown = text;
      this.bar.style.setProperty('--ball', color);
      if (def) {
        this.title.textContent = `⛳ Bahn ${def.n} · ${def.name} · Par ${def.par}`;
        this.info.textContent = `Schlag ${me.strokes + 1} von ${MAX_STROKES} · Gesamt ${cardTotal(me.card)} (${toPar(me.card)})`;
        this.turn.textContent = turn.mine ? (turn.whose === null ? 'Frei spielen' : 'Du bist dran') : `${turn.whose ?? '…'} ist dran`;
        this.turn.className = `mg-turn${turn.mine ? ' mine' : ''}`;
      } else {
        this.title.textContent = '⛳ Runde fertig!';
        this.info.textContent = `${cardTotal(me.card)} Schläge (${toPar(me.card)}) · Tab: Scorekarte`;
        this.turn.textContent = 'Am ersten Abschlag: neue Runde';
        this.turn.className = 'mg-turn';
      }
    }
    this.meter.classList.toggle('hidden', power < 0);
    if (power >= 0) {
      this.fill.style.width = `${Math.max(0, power) * 100}%`;
      this.mark.style.left = `${last * 100}%`;
      this.mark.classList.toggle('hidden', last < 0);
    }
  }

  get open(): boolean {
    return this.cardOpen;
  }

  /** Tab toggles the card, Esc closes it (in the room). True when it was ours. */
  key(e: KeyboardEvent, inRoom: boolean): boolean {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.code === 'Tab' && inRoom && !document.querySelector('.backdrop')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.toggle();
      return true;
    }
    if (e.code === 'Escape' && this.cardOpen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.toggle(false);
      return true;
    }
    return false;
  }

  toggle(open = !this.cardOpen) {
    this.cardOpen = open;
    this.card.hidden = !open;
    this.cardKey = '';
  }

  /** The scorecard: `view` as it stands, `you` (your id), your records. */
  renderCard(view: MgView | null, you: string, mine: MgMine | null) {
    if (!this.cardOpen) return;
    const key = JSON.stringify([view?.players, view?.groups, view?.best, view?.week, mine]);
    if (key === this.cardKey) return;
    this.cardKey = key;
    const players = [...(view?.players ?? [])];
    // You first, then your group, then everyone else by how far they've got.
    const myGroup = players.find((p) => p.id === you)?.group;
    players.sort((a, b) => Number(b.id === you) - Number(a.id === you) || Number(!!b.group && b.group === myGroup) - Number(!!a.group && a.group === myGroup) || cardHoles(b.card) - cardHoles(a.card));
    const row = (p: MgPlayer) =>
      h(
        `tr${p.id === you ? '.you' : ''}`,
        {},
        h('td.name', {}, h('i.dot', { style: `background:${MG_COLORS[p.color % MG_COLORS.length][0]}` }), p.name, p.group ? h('small', {}, ' 👥') : ''),
        ...p.card.map((n, i) => h(`td${p.hole === i + 1 ? '.now' : ''}${n !== null && n === 1 ? '.ace' : ''}${n !== null && n < HOLES[i].par ? '.under' : ''}`, {}, cardText(n))),
        h('td.sum', {}, String(cardTotal(p.card))),
        h('td.par', {}, toPar(p.card)),
      );
    const leaders = (list: MgView['best'], empty: string) =>
      h('ol.mg-leaders', {}, ...(list.length ? list.map((l) => h('li', {}, h('span', {}, l.name), h('b', {}, String(l.total)), h('small', {}, new Date(l.at).toLocaleDateString('de-DE')))) : [h('li.empty', {}, empty)]));
    this.card.replaceChildren(
      h('button.close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Tab oder Esc)', onclick: () => this.toggle(false) }, '✕'),
      h('h2', {}, '⛳ Scorekarte · Schwarzlicht-Minigolf'),
      h(
        'table.mg-table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Bahn'), ...HOLES.map((d) => h('th', { title: d.name }, String(d.n))), h('th', {}, 'Σ'), h('th', {}, '±')), h('tr.pars', {}, h('th', {}, 'Par'), ...HOLES.map((d) => h('th', {}, String(d.par))), h('th', {}, String(COURSE_PAR)), h('th', {}, ''))),
        h('tbody', {}, ...(players.length ? players.map(row) : [h('tr', {}, h('td.empty', { colspan: String(HOLES.length + 3) }, 'Noch niemand am Spielen: Schläger & Bälle gibt’s am Eingang'))])),
      ),
      h(
        'div.mg-boards',
        {},
        h('section', {}, h('h3', {}, '🏆 Bestenliste'), leaders(view?.best ?? [], 'Noch keine Runde')),
        h('section', {}, h('h3', {}, '📅 Diese Woche'), leaders(view?.week ?? [], 'Diese Woche noch keine')),
        h(
          'section.mine',
          {},
          h('h3', {}, '⭐ Du'),
          h('p', {}, mine ? `${mine.rounds} Runde${mine.rounds === 1 ? '' : 'n'} · Beste ${mine.best ?? '–'} · Woche ${mine.weekBest ?? '–'}` : '–'),
          h('p', {}, mine ? `${mine.aces} Hole-in-One${mine.aces === 1 ? '' : 's'}` : ''),
          h('p.small', {}, `${view?.aces ?? 0} Hole-in-Ones im ganzen Haus`),
        ),
      ),
      h('p.foot', {}, h('kbd', {}, 'Tab'), ' / ', h('kbd', {}, 'Esc'), ' schließt · max. ', String(MAX_STROKES), ' Schläge pro Bahn, sonst „+“ (zählt 8)'),
    );
  }
}
