import { POSTCARD_MOTIFS, POSTCARD_TEXT_MAX, cleanPostcardText, type MotifId, type Postcard, type Recipient } from '../../../shared/funshops';
import { h, openModal } from '../../ui/dom';
import { motifCanvas } from './motifs';
import './ui.css';

// flrnoh fork (see FORK.md "Shops to walk into"): the Post's windows. At the counter: pick a picture
// of the city for the front, write a few lines on the back and who it's for (anyone the office knows),
// and it's in the post. A card for you comes as a toast and opens in a window of its own. ✕ or Esc
// closes either, straight back to the game.

export interface WriteOptions {
  keeper: string;
  /** Who you can send to, and how many cards you've left today: asked of the office as the window opens. */
  recipients(): Promise<{ list: Recipient[]; left: number }>;
  send(to: Recipient, motif: MotifId, text: string): void;
}

export function openPostcardWriter(o: WriteOptions) {
  let motif: MotifId = POSTCARD_MOTIFS[0].id;
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const fronts = h('div.post-motifs', {});
  const text = h('textarea.post-text', {
    maxlength: POSTCARD_TEXT_MAX,
    rows: 5,
    placeholder: 'Liebe Grüße aus der Stadt…',
  }) as HTMLTextAreaElement;
  const count = h('span.post-count', {}, `0 / ${POSTCARD_TEXT_MAX}`);
  const who = h('select.post-to', {}, h('option', { value: '' }, 'Wird geladen…')) as HTMLSelectElement;
  const left = h('span.grow', {}, `${o.keeper}: “Eine Karte? Gern!”`);
  const send = h('button.btn.primary', { disabled: true }, '📮 Abschicken');
  const el = h(
    'div.modal.post-modal',
    { role: 'dialog', 'aria-label': 'Postkarte schreiben' },
    h('header', {}, h('h2', {}, '📮 Postkarte schreiben'), close),
    h('div.body', {}, h('h3', {}, 'Vorderseite'), fronts, h('h3', {}, 'An'), who, h('h3', {}, 'Rückseite'), text, count),
    h('footer', {}, left, send),
  );
  const modal = openModal(el, { doing: '📮 writing a postcard' });
  close.addEventListener('click', () => modal.close());
  // Typing on the card shouldn't walk you about: the office's keys stay out of a modal anyway.
  for (const m of POSTCARD_MOTIFS) {
    const c = motifCanvas(m.id, 'post-thumb');
    const b = h('button.post-pick', { type: 'button', title: m.name, 'aria-pressed': String(m.id === motif) }, c);
    b.addEventListener('click', () => {
      motif = m.id;
      fronts.querySelectorAll('.post-pick').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    fronts.append(b);
  }
  let list: Recipient[] = [];
  let canSend = false;
  const ready = () => {
    send.disabled = !canSend || !who.value || !cleanPostcardText(text.value);
  };
  text.addEventListener('input', () => {
    count.textContent = `${text.value.length} / ${POSTCARD_TEXT_MAX}`;
    ready();
  });
  who.addEventListener('change', ready);
  void o.recipients().then((r) => {
    list = r.list;
    canSend = r.left > 0;
    who.replaceChildren(h('option', { value: '' }, r.list.length ? 'Wem schreibst du?' : 'Noch niemand da'), ...r.list.map((p) => h('option', { value: p.key }, `${p.online ? '🟢 ' : ''}${p.name}`)));
    left.textContent = r.left > 0 ? `Noch ${r.left} ${r.left === 1 ? 'Karte' : 'Karten'} heute · Porto zahlt das Büro` : 'Heute keine Karten mehr: morgen wieder!';
    ready();
  });
  send.addEventListener('click', () => {
    const to = list.find((p) => p.key === who.value);
    const clean = cleanPostcardText(text.value);
    if (!to || !clean) return;
    o.send(to, motif, clean);
    modal.close();
  });
  setTimeout(() => text.focus(), 40);
  return modal;
}

/** A card that came for you: the front, and the back with who it's from. */
export function openPostcard(card: Postcard) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const back = h('div.post-back', {}, h('div.post-stamp', {}, '📯'), h('p.post-msg', {}, card.text), h('p.post-from', {}, `— ${card.from}`), h('p.post-date', {}, new Date(card.at).toLocaleString()));
  const el = h(
    'div.modal.post-modal',
    { role: 'dialog', 'aria-label': 'Postkarte' },
    h('header', {}, h('h2', {}, `💌 Post von ${card.from}`), close),
    h('div.body.post-card', {}, motifCanvas(card.motif), back),
  );
  const modal = openModal(el, {
    doing: '💌 reading a postcard',
    reading: true,
  });
  close.addEventListener('click', () => modal.close());
  return modal;
}
