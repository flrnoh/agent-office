import * as THREE from 'three';
import { SHOP_ITEM_BY_ID, type ShopItemId } from '../../shared/shopwares';
import { RECORD_BY_ID } from '../../shared/records';
import type { Drink } from '../../shared/rooftop';
import { sleeveTexture } from './sleeves';
import { mesh, toon } from './toon';
import { foodItem, isFoodGlass } from './shopitems-food'; // food round 2

// What the city's shops hand you (flrnoh fork, see FORK.md "Shops to walk into"), held like a glass
// from the bar: fridgeitems.ts hands the shops' shapes over to here. Each is a handful of simple
// shapes standing on y = 0 in your fist, sized like the bar's glasses (a pint is 0.15 tall); a
// bouquet, a teddy, a book or a record a little bigger, as they are.

const PAPER = '#fbfaf6';
const STEM = '#3f7f3a';

/** A Semmel, a slice of pizza, a bouquet, a book, a toy…, `S` times its size. */
export function shopItem(d: Drink, S = 1): THREE.Group {
  if (isFoodGlass(d.glass)) return foodItem(d, S); // ice cream, sushi, the butcher's
  const g = new THREE.Group();
  const item = SHOP_ITEM_BY_ID.get(d.id as ShopItemId);
  const body = toon(d.color);
  const label = toon(item?.label ?? '#ffffff');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = mesh(geo, mat, x * S, y * S, z * S, false);
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0) => add(new THREE.BoxGeometry(w * S, h * S, d * S), mat, x, y, z);
  const cyl = (rTop: number, rBottom: number, h: number, mat: THREE.Material, y: number, segs = 12, x = 0, z = 0) => add(new THREE.CylinderGeometry(rTop * S, rBottom * S, h * S, segs), mat, x, y, z);
  const ball = (r: number, mat: THREE.Material, x: number, y: number, z = 0) => add(new THREE.SphereGeometry(r * S, 10, 8), mat, x, y, z);
  const flowers = (colors: string[], n: number, spread: number, top: number, r: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i;
      const rr = spread * (0.35 + ((i * 37) % 10) / 15);
      ball(r, toon(colors[i % colors.length]), Math.cos(a) * rr, top + ((i * 13) % 5) * 0.008, Math.sin(a) * rr);
    }
  };
  switch (d.glass) {
    case 'semmel': {
      const bun = ball(0.045, body, 0, 0.035);
      bun.scale.set(1, 0.7, 1);
      box(0.06, 0.004, 0.006, label, 0, 0.066).rotation.y = 0.4;
      break;
    }
    case 'krapfen': {
      const k = ball(0.045, body, 0, 0.035);
      k.scale.set(1, 0.65, 1);
      cyl(0.04, 0.042, 0.012, label, 0.035, 14);
      if (d.id === 'nussschnecke') add(new THREE.TorusGeometry(0.025 * S, 0.006 * S, 6, 14), label, 0, 0.065).rotation.x = Math.PI / 2;
      break;
    }
    case 'pizzaslice': {
      // A slice held up by its crust: the tip down, cheese, a few slices of topping.
      const slice = add(new THREE.ConeGeometry(0.07 * S, 0.16 * S, 3), body, 0, 0.08);
      slice.scale.set(1, 1, 0.12);
      slice.rotation.z = Math.PI;
      box(0.13, 0.02, 0.022, toon('#c8813c'), 0, 0.155);
      for (const [x, y] of [
        [-0.02, 0.12],
        [0.02, 0.11],
        [0, 0.075],
      ])
        cyl(0.012, 0.012, 0.004, label, y, 10, x, 0.008).rotation.x = Math.PI / 2;
      break;
    }
    case 'newspaper': {
      // Folded in half, the front page out: a headline, columns, a photo.
      box(0.14, 0.2, 0.012, body, 0, 0.1);
      box(0.12, 0.022, 0.013, label, 0, 0.175);
      box(0.05, 0.05, 0.013, toon('#8d99ae'), -0.03, 0.12);
      for (let i = 0; i < 4; i++) box(0.05, 0.006, 0.013, toon('#adb5bd'), 0.03, 0.14 - i * 0.015);
      break;
    }
    case 'gummies': {
      box(0.07, 0.1, 0.03, label, 0, 0.05);
      for (let i = 0; i < 5; i++) ball(0.011, toon(['#ff595e', '#8ac926', '#ffca3a', '#1982c4', '#ffffff'][i]), -0.022 + i * 0.011, 0.105 + (i % 2) * 0.008);
      break;
    }
    case 'pill': {
      // A blister strip, one pill popped out on top.
      box(0.06, 0.004, 0.035, toon('#c0c4cc'), 0, 0.03);
      const p = add(new THREE.CapsuleGeometry(0.008 * S, 0.014 * S, 4, 8), body, 0, 0.045);
      p.rotation.z = Math.PI / 2;
      box(0.06, 0.002, 0.008, label, 0, 0.033, 0.012);
      break;
    }
    case 'lozenge':
      ball(0.014, body, 0, 0.02).scale.set(1, 0.6, 1);
      box(0.04, 0.004, 0.04, toon(PAPER), 0, 0.006);
      break;
    case 'bouquet':
    case 'tulips': {
      // Paper round the stems, flowers on top.
      cyl(0.06, 0.018, 0.16, toon(PAPER), 0.08, 10);
      for (let i = 0; i < 6; i++) cyl(0.003, 0.003, 0.12, toon(STEM), 0.1, 5, Math.cos(i) * 0.02, Math.sin(i) * 0.02);
      flowers(d.glass === 'tulips' ? [d.color, item?.label ?? '#ffd166'] : [d.color], d.glass === 'tulips' ? 7 : 9, 0.045, 0.18, d.glass === 'tulips' ? 0.018 : 0.02);
      for (let i = 0; i < 4; i++) ball(0.015, toon(STEM), Math.cos(i * 1.7) * 0.05, 0.16, Math.sin(i * 1.7) * 0.05).scale.set(1, 0.4, 1.6);
      break;
    }
    case 'sunflower': {
      cyl(0.005, 0.005, 0.3, toon(STEM), 0.15, 6);
      const head = new THREE.Group();
      head.position.set(0, 0.32 * S, 0.01 * S);
      head.rotation.x = -0.4;
      g.add(head);
      for (let i = 0; i < 12; i++) {
        const petal = mesh(new THREE.SphereGeometry(0.016 * S, 6, 5), body, Math.cos((i / 12) * Math.PI * 2) * 0.04 * S, Math.sin((i / 12) * Math.PI * 2) * 0.04 * S, 0, false);
        petal.scale.set(1, 1.8, 0.3);
        petal.rotation.z = (i / 12) * Math.PI * 2 - Math.PI / 2;
        head.add(petal);
      }
      head.add(mesh(new THREE.CylinderGeometry(0.028 * S, 0.028 * S, 0.012 * S, 14).rotateX(Math.PI / 2), toon('#5b3a29'), 0, 0, 0.004 * S, false));
      ball(0.018, toon(STEM), 0.02, 0.18).scale.set(1.6, 0.4, 1);
      break;
    }
    case 'book': {
      // A hardback, held upright: the cover, the pages' edge, a band on the spine.
      box(0.13, 0.18, 0.03, body, 0, 0.09);
      box(0.122, 0.17, 0.031, toon(PAPER), 0.006, 0.09);
      box(0.004, 0.18, 0.032, label, -0.064, 0.09);
      box(0.08, 0.03, 0.032, label, 0.01, 0.13);
      break;
    }
    case 'doener': {
      // Half a flatbread, stuffed: meat, salad, onion, sauce dripping over the top.
      const bread = add(new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 0.05 * S, 16, 1, false, 0, Math.PI), toon('#e9c46a'), 0, 0.06);
      bread.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      box(0.08, 0.025, 0.035, toon('#8b5a2b'), 0, 0.085);
      box(0.08, 0.015, 0.03, toon('#7cb518'), 0, 0.1);
      box(0.07, 0.008, 0.03, toon('#f1f1f1'), 0, 0.108);
      if (d.id === 'doenerscharf') for (let i = 0; i < 5; i++) box(0.006, 0.006, 0.006, label, -0.03 + i * 0.015, 0.114, (i % 2) * 0.01);
      box(0.13, 0.05, 0.004, toon(PAPER), 0, 0.03, 0.03);
      break;
    }
    case 'duerum':
      // A roll in thin bread, wrapped in foil at the bottom.
      cyl(0.026, 0.026, 0.18, body, 0.09, 12);
      cyl(0.0265, 0.0265, 0.07, toon('#c0c4cc'), 0.035, 12);
      ball(0.02, label, 0, 0.18).scale.set(1, 0.4, 1);
      break;
    case 'lahmacun':
      cyl(0.024, 0.024, 0.16, toon('#f1d3a1'), 0.08, 12);
      cyl(0.0245, 0.0245, 0.12, body, 0.1, 12, 0.003);
      ball(0.012, toon('#ffd60a'), 0.02, 0.17);
      break;
    case 'ayran':
      cyl(0.03, 0.028, 0.1, toon(PAPER), 0.05, 14);
      cyl(0.0305, 0.0305, 0.03, label, 0.06, 14);
      cyl(0.03, 0.03, 0.006, toon('#c0c4cc'), 0.103, 14);
      break;
    case 'yoyo': {
      // The yo-yo hangs off its string from your finger (features/shops/toys.ts runs it up and down).
      const yo = new THREE.Group();
      yo.name = 'yoyo';
      yo.position.y = 0.05 * S;
      for (const z of [-0.008, 0.008]) yo.add(mesh(new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 0.012 * S, 16).rotateX(Math.PI / 2), body, 0, 0, z * S, false));
      yo.add(mesh(new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.006 * S, 8).rotateX(Math.PI / 2), label, 0, 0, 0, false));
      g.add(yo);
      cyl(0.0015, 0.0015, 0.05, toon('#ffffff'), 0.075, 4);
      break;
    }
    case 'bubbles':
      cyl(0.02, 0.02, 0.1, body, 0.05, 12);
      cyl(0.021, 0.021, 0.02, label, 0.105, 12);
      cyl(0.002, 0.002, 0.08, label, 0.15, 4, 0.03);
      add(new THREE.TorusGeometry(0.015 * S, 0.003 * S, 6, 12), label, 0.03, 0.195);
      break;
    case 'duck': {
      const b = ball(0.04, body, 0, 0.04);
      b.scale.set(1, 0.8, 1.3);
      ball(0.026, body, 0, 0.085, 0.03);
      const beak = ball(0.012, label, 0, 0.082, 0.058);
      beak.scale.set(1.3, 0.5, 1.2);
      for (const x of [-0.012, 0.012]) ball(0.005, toon('#1d1d1d'), x, 0.092, 0.05);
      break;
    }
    case 'plane': {
      // Folded paper: two wings off a keel, nose forward (+z).
      const wing = (side: number) => {
        const w = add(new THREE.ConeGeometry(0.05 * S, 0.16 * S, 3), body, side * 0.022, 0.09);
        w.rotation.set(Math.PI / 2, 0, side * 0.2);
        w.scale.set(1, 1, 0.08);
      };
      wing(-1);
      wing(1);
      box(0.004, 0.02, 0.15, label, 0, 0.08);
      break;
    }
    case 'watergun':
      box(0.03, 0.04, 0.11, body, 0, 0.09, 0.02);
      box(0.026, 0.07, 0.03, body, 0, 0.04, -0.015);
      cyl(0.008, 0.008, 0.04, label, 0.09, 8, 0, 0.09).rotation.x = Math.PI / 2;
      cyl(0.02, 0.02, 0.04, toon('#8ecae6'), 0.12, 10, 0, 0.01);
      break;
    case 'teddy': {
      // Sitting in the crook of your arm: a round body, a head, ears, a muzzle and a bow.
      ball(0.06, body, 0, 0.06).scale.set(1, 1.1, 0.9);
      ball(0.045, body, 0, 0.15);
      for (const x of [-0.035, 0.035]) ball(0.016, body, x, 0.19);
      ball(0.018, toon('#deb887'), 0, 0.14, 0.035);
      ball(0.006, toon('#1d1d1d'), 0, 0.148, 0.052);
      for (const x of [-0.016, 0.016]) ball(0.006, toon('#1d1d1d'), x, 0.165, 0.038);
      for (const x of [-0.05, 0.05]) ball(0.022, body, x, 0.07, 0.02);
      box(0.05, 0.015, 0.015, label, 0, 0.11, 0.04);
      break;
    }
    case 'record': {
      // A sleeve, the record peeking out of the top.
      const rec = RECORD_BY_ID.get(d.id);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2 * S, 0.2 * S, 0.008 * S), [toon(d.color), toon(d.color), toon(d.color), toon(d.color), new THREE.MeshToonMaterial({ map: rec ? sleeveTexture(rec) : null, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }), toon(label.color)]);
      sleeve.position.y = 0.1 * S;
      g.add(sleeve);
      cyl(0.095, 0.095, 0.004, toon('#111111'), 0.16, 24, 0, -0.002).rotation.x = Math.PI / 2;
      break;
    }
    case 'plush': {
      // The claw machine's prize (the Spielhalle): a round body, a big head, ears in its second color.
      ball(0.055, body, 0, 0.055).scale.set(1, 1.05, 0.9);
      ball(0.05, body, 0, 0.14);
      for (const x of [-0.035, 0.035]) ball(0.02, label, x, 0.185);
      for (const x of [-0.016, 0.016]) ball(0.007, toon('#1d1d1d'), x, 0.15, 0.045);
      break;
    }
    case 'photostrip': {
      // The photo booth's strip: white card, four grey photos down it.
      box(0.055, 0.2, 0.004, body, 0, 0.1);
      for (let i = 0; i < 4; i++) box(0.042, 0.04, 0.002, toon(['#6c757d', '#868e96', '#5c636a', '#7d848b'][i]), 0, 0.03 + i * 0.047, 0.003);
      break;
    }
    case 'fishbag': {
      // A knotted plastic bag of water hanging from your fingers, a goldfish going round in it, the
      // water sloshing as you go (it moves itself, wherever it's drawn).
      cyl(0.006, 0.012, 0.03, label, 0.01, 8);
      const bag = new THREE.Group();
      g.add(bag);
      const water = mesh(new THREE.SphereGeometry(0.07 * S, 14, 10), WATER, 0, -0.07 * S, 0, false);
      water.scale.set(1, 1.15, 1);
      bag.add(water);
      const fish = new THREE.Group();
      fish.position.y = -0.07 * S;
      bag.add(fish);
      const f = mesh(new THREE.SphereGeometry(0.018 * S, 8, 6), body, 0.03 * S, 0, 0, false);
      f.scale.set(1.5, 1, 0.6);
      fish.add(f);
      fish.add(mesh(new THREE.ConeGeometry(0.012 * S, 0.02 * S, 4).rotateZ(Math.PI / 2), body, 0.055 * S, 0, 0, false));
      water.onBeforeRender = () => {
        const t = performance.now() / 1000;
        bag.rotation.z = Math.sin(t * 3.1) * 0.18;
        bag.rotation.x = Math.sin(t * 2.3 + 1) * 0.12;
        fish.rotation.y = t * 1.8;
      };
      break;
    }
    case 'budgie':
      // It sits on your shoulder (features/ride/riders.ts), not in your hand.
      break;
    case 'detergent':
      box(0.08, 0.1, 0.05, body, 0, 0.05);
      box(0.082, 0.03, 0.052, label, 0, 0.06);
      break;
    case 'sock': {
      const leg = box(0.035, 0.12, 0.02, body, 0, 0.06);
      leg.rotation.z = 0.1;
      box(0.07, 0.03, 0.02, body, 0.025, 0.0);
      box(0.036, 0.02, 0.022, label, 0, 0.11);
      break;
    }
    default:
      cyl(0.03, 0.03, 0.1, body, 0.05);
  }
  return g;
}

/** The goldfish bag's water: clear, a little blue (one for every bag). */
const WATER = Object.assign(new THREE.MeshBasicMaterial({ color: '#bde0fe', transparent: true, opacity: 0.45, depthWrite: false }), { userData: { outlineParameters: { visible: false } } });
