import { DRINK_BY_ID, type Drink, type DrinkId } from '../../../shared/rooftop';
import { SHOP_ITEM_BY_ID, type ShopItemId } from '../../../shared/shopwares';
import type { ShopKind } from '../../../shared/shops';
import { RECORD_BY_ID, crateDig, type RecordDef } from '../../../shared/records';
import { h, openModal } from '../../ui/dom';
import { sleeveUrl } from '../../world/sleeves';

// The city's shops' windows (flrnoh fork, see FORK.md "Shops to walk into"): the menu at a counter,
// the döner man's question, digging through a crate of records, a book open in your hands, and the
// headphones at the record shop. Each has its ✕ top right; ✕ or Esc goes straight back to the game.

export interface MenuOptions {
  kind: ShopKind;
  keeper: string;
  items: readonly DrinkId[];
  /** Had enough: nothing with alcohol in it. */
  cutOff: boolean;
  order(item: Drink): void;
}

/** What it does for you, on the menu. */
function effect(d: Drink): string {
  const s = SHOP_ITEM_BY_ID.get(d.id as ShopItemId);
  if (d.strength > 0) return '🌀 goes to your head';
  if (s?.treat === 'sober') return '🧠 clears your head, quick';
  if (s?.treat === 'spicy') return '🌶️ scharf';
  if (s?.treat === 'toy') return '🖱️ click to play';
  if (s?.treat === 'read') return '📖 to read';
  if (s?.treat === 'listen') return '🎧 listen at the station';
  if (d.strength < 0) return '🥨 soaks up a beer';
  return s && !s.bite && s.glass !== 'ayran' ? 'yours to hold' : 'lecker';
}

const item = (d: Drink, refused: boolean, pick: () => void, label?: string) => {
  const li = h(
    'li',
    { tabindex: refused ? -1 : 0, role: 'button', 'aria-disabled': String(refused), title: refused ? "You've had enough" : `${d.name}`, style: refused ? 'opacity:.45;cursor:not-allowed' : '' },
    h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
    h('div.svc-main', {}, h('div.svc-title', {}, label ?? d.name), h('div.svc-meta', {}, `${d.blurb} · ${effect(d)}`)),
  );
  const go = () => !refused && pick();
  li.addEventListener('click', go);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // (or the office's own Enter, with the window gone, would open the chat)
      e.stopPropagation();
      go();
    }
  });
  return li;
};

const focusFirst = (el: HTMLElement) => setTimeout(() => (el.querySelector('li[tabindex="0"], button.primary') as HTMLElement | null)?.focus(), 30);

/** The menu at a shop's counter: everything's free. */
export function openShopMenu(o: MenuOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const body = h('div.body', {});
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': o.kind.name }, h('header', {}, h('h2', {}, `${o.kind.emoji} ${o.kind.name}`), close), body, h('footer', {}, h('span.grow', {}, `Alles aufs Haus. ${o.keeper} freut sich.`)));
  const modal = openModal(el, { doing: `${o.kind.emoji} in the ${o.kind.name}` });
  close.addEventListener('click', () => modal.close());
  const pick = (d: Drink) => {
    modal.close();
    o.order(d);
  };
  const sections = new Map<string, Drink[]>();
  for (const id of o.items) {
    const d = DRINK_BY_ID.get(id);
    if (!d || id === 'doenerscharf') continue;
    const sec = SHOP_ITEM_BY_ID.get(id as ShopItemId)?.section ?? (d.strength > 0 ? 'Bier' : 'Dazu');
    sections.set(sec, [...(sections.get(sec) ?? []), d]);
  }
  const menu = () => {
    body.replaceChildren(
      o.cutOff ? h('p.setting-note', { style: 'margin:0 0 12px;font-weight:800' }, `🙅 ${o.keeper} says you've had enough for now. Something to eat?`) : '',
      ...[...sections].flatMap(([sec, list], i) => [
        h('h3', { style: `margin:${i ? 16 : 0}px 0 8px;font-size:15px` }, sec),
        h('ul.svc-list', {}, ...list.map((d) => item(d, o.cutOff && d.strength > 0, () => (d.id === 'doener' ? ask() : pick(d)), d.id === 'doener' ? 'Döner' : undefined))),
      ]),
    );
    focusFirst(body);
  };
  // The döner man's question.
  const ask = () => {
    const plain = DRINK_BY_ID.get('doener')!;
    const hot = DRINK_BY_ID.get('doenerscharf')!;
    const back = h('button.btn', { type: 'button' }, '← Zurück');
    back.addEventListener('click', menu);
    body.replaceChildren(
      h('p', { style: 'font-size:18px;font-weight:800;margin:0 0 12px' }, `🥙 ${o.keeper}: „Mit alles? Scharf?“`),
      h('ul.svc-list', {}, item(plain, false, () => pick(plain), 'Mit alles, ohne scharf'), item(hot, false, () => pick(hot), 'Mit alles und scharf! 🌶️')),
      h('div', { style: 'margin-top:12px' }, back),
    );
    focusFirst(body);
  };
  menu();
}

export interface CrateOptions {
  shop: number;
  crate: number;
  pick(r: RecordDef): void;
}

/** Digging through a crate of records: four on top at a time, and dig deeper for the next. */
export function openCrate(o: CrateOptions) {
  let dig = 0;
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px' });
  const deeper = h('button.btn', { type: 'button' }, '🔎 Weiter wühlen');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Plattenkiste' },
    h('header', {}, h('h2', {}, '💿 Plattenkiste'), close),
    h('div.body', {}, grid),
    h('footer', {}, h('span.grow', {}, 'Nimm eine mit, und hör an der Hörstation rein.'), deeper),
  );
  const modal = openModal(el, { doing: '💿 digging through records' });
  close.addEventListener('click', () => modal.close());
  const show = () => {
    grid.replaceChildren(
      ...crateDig(o.shop, o.crate, dig).map((r) => {
        const b = h(
          'button.btn',
          { type: 'button', style: 'display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:8px;text-align:left', title: `${r.band}: ${r.title}` },
          h('img', { src: sleeveUrl(r), alt: '', style: 'width:100%;aspect-ratio:1;border-radius:4px' }),
          h('strong', { style: 'font-size:13px' }, r.band),
          h('span', { style: 'font-size:12px;opacity:.8' }, `${r.title} · ${r.genre}, ${r.year}`),
        );
        b.addEventListener('click', () => {
          modal.close();
          o.pick(r);
        });
        return b;
      }),
    );
    setTimeout(() => (grid.querySelector('button') as HTMLElement | null)?.focus(), 30);
  };
  deeper.addEventListener('click', () => {
    dig++;
    show();
  });
  show();
}

/** What a book or the paper says on its first page: a few lines, made up for the office. */
const PAGES: Record<string, string[]> = {
  zeitung: ['WETTER: Föhn über dem Bayerwald, nachmittags 24 Grad.', 'SPORT: FCV-Damen gewinnen 3:1. Die Bannerfahne war größer als das Tor.', 'LOKALES: Neue Stadt rund ums Büro, alle Läden haben offen. Der Döner ist mit alles.', 'RÄTSEL: Waagrecht 7: „Zweite Halbzeit“ (9 Buchstaben).'],
  krimi: ['Kapitel 1', 'Der Regen fiel, wie er nur in Viechtach fällt: schräg, kalt und mit Absicht.', 'Kommissarin Brandl stellte den Kragen auf und sah auf den Fluss. Da trieb etwas, das kein Ast war.', '„Ruf den Doktor“, sagte sie. „Und bring Brezn mit. Es wird eine lange Nacht.“'],
  roman: ['Erstes Kapitel', 'Auf dem Hügel stand ein Sendemast, und unter ihm saß jeden Abend jemand, der zuhörte.', 'Nicht der Musik, nicht den Nachrichten, sondern dem Rauschen dazwischen, wo die Stille wohnt.'],
  kochbuch: ['Semmelknödel (für 4)', '6 alte Semmeln, ¼ l Milch, 2 Eier, 1 Zwiebel, Petersilie, Salz.', 'Semmeln würfeln, warme Milch drüber, ziehen lassen. Zwiebel anschwitzen, alles mischen, Knödel formen.', '20 Minuten sieden lassen, nicht kochen! Oma sagt: Wer kocht, hat schon verloren.'],
  reisefuehrer: ['Der Große Arber, 1456 m', 'Der König des Bayerwalds. Mit der Gondel bequem, zu Fuß ehrlicher.', 'Tipp: Oben einkehren, Kaiserschmarrn bestellen, Aussicht bis zu den Alpen bei Föhn.'],
  comic: ['💬 „Montag. Die Roboter haben wieder alle Tests rot gemacht.“', '🐈 *schiebt die Kaffeetasse vom Tisch*', '💬 „…Danke, Chefin. Jetzt sind sie grün.“'],
};

/** A book (or the paper) open in your hands: everyone sees you reading. */
export function openReading(d: Drink, onClose?: () => void) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const lines = PAGES[d.id] ?? ['…'];
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': d.name, style: 'max-width:520px' },
    h('header', {}, h('h2', {}, `${d.emoji} ${d.name}`), close),
    h('div.body', { style: 'font-family:Georgia,serif;font-size:16px;line-height:1.55' }, ...lines.map((l, i) => h(i === 0 ? 'h3' : 'p', { style: 'margin:0 0 10px' }, l))),
    h('footer', {}, h('span.grow', {}, 'Esc legt es weg. Du behältst es in der Hand.')),
  );
  const modal = openModal(el, { doing: `📖 reading ${d.name}`, reading: true, onClose });
  close.addEventListener('click', () => modal.close());
}

/** The headphones at the record shop: what's playing, until ✕, Esc or E. */
export function openHeadphones(r: RecordDef, onClose: () => void) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const stop = h('button.btn.primary', { type: 'button' }, '⏹ Absetzen (E)');
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': 'Hörstation', style: 'max-width:420px' },
    h('header', {}, h('h2', {}, '🎧 Hörstation'), close),
    h('div.body', { style: 'display:flex;gap:14px;align-items:center' }, h('img', { src: sleeveUrl(r), alt: '', style: 'width:110px;height:110px;border-radius:4px' }), h('div', {}, h('strong', {}, r.band), h('p', { style: 'margin:4px 0' }, r.title), h('p.setting-note', { style: 'margin:0' }, `${r.genre}, ${r.year} · nur du hörst es`))),
    h('footer', {}, h('span.grow'), stop),
  );
  const modal = openModal(el, { doing: `🎧 listening to ${r.band}`, onClose });
  close.addEventListener('click', () => modal.close());
  stop.addEventListener('click', () => modal.close());
  el.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      e.stopPropagation();
      modal.close();
    }
  });
  setTimeout(() => stop.focus(), 30);
}

export { RECORD_BY_ID };
