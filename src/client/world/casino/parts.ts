import * as THREE from 'three';

// Bits the casino's outside and inside share (flrnoh fork, see FORK.md): canvases, the neon sign,
// the carpet, and chaser bulbs that run round a sign.

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Glows by itself, day and night: neon, screens, signs. Kept out of the outline pass. */
export function glow(map: THREE.Texture | null, color: THREE.ColorRepresentation = '#ffffff', opts: { transparent?: boolean } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, map, transparent: !!opts.transparent, alphaTest: opts.transparent ? 0.05 : 0 });
  m.toneMapped = false;
  m.userData.outlineParameters = { visible: false };
  return m;
}

export const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

/** A neon word on a dark board: `color` tubes with a soft glow of the same, in a gold frame. */
export function neonSign(text: string, color: string, w = 1024, h = 256, bg = '#1a0610'): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d4a24c';
    g.lineWidth = h * 0.05;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    let px = h * 0.62;
    g.font = `900 ${px}px ${FONT}`;
    while (g.measureText(text).width > w * 0.86 && px > 10) g.font = `900 ${(px -= 4)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [blur, alpha] of [
      [h * 0.18, 0.9],
      [h * 0.08, 1],
    ] as const) {
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillText(text, w / 2, h * 0.54);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    // The tube's hot white core.
    g.lineWidth = Math.max(2, px * 0.03);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.strokeText(text, w / 2, h * 0.54);
  });
}

/** Casino carpet: deep red with gold diamonds and little stars, repeating every `tile` meters. */
export function carpetTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#6b1224';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#c9983f';
    g.lineWidth = 5;
    for (const [x, y] of [
      [0, 0],
      [256, 0],
      [0, 256],
      [256, 256],
      [128, 128],
    ]) {
      g.beginPath();
      g.moveTo(x, y - 60);
      g.lineTo(x + 60, y);
      g.lineTo(x, y + 60);
      g.lineTo(x - 60, y);
      g.closePath();
      g.stroke();
    }
    g.fillStyle = '#1f5f5b';
    for (const [x, y] of [
      [128, 0],
      [0, 128],
      [256, 128],
      [128, 256],
    ]) {
      g.beginPath();
      g.arc(x, y, 18, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e8c36a';
    for (const [x, y] of [
      [128, 128],
      [0, 0],
      [256, 256],
      [0, 256],
      [256, 0],
    ]) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Bulbs round a `w` × `h` frame (centered on 0, in the xy plane), in three sets that light up in
 * turn: `update(t)` runs the chase. Returns the group to place, three draw calls in all.
 */
export function chaser(w: number, h: number, spacing = 0.32, r = 0.07, colors = ['#fff2c2', '#ffd36b', '#fff2c2']): { group: THREE.Group; update(t: number): void } {
  const mats = colors.map((c) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    m.toneMapped = false;
    m.userData.outlineParameters = { visible: false };
    return m;
  });
  const dim = new THREE.Color('#6a4a2a');
  const lit = colors.map((c) => new THREE.Color(c));
  const spots: [number, number][] = [];
  const nx = Math.max(2, Math.round(w / spacing));
  const ny = Math.max(2, Math.round(h / spacing));
  for (let i = 0; i < nx; i++) spots.push([-w / 2 + (i * w) / nx, h / 2]);
  for (let i = 0; i < ny; i++) spots.push([w / 2, h / 2 - (i * h) / ny]);
  for (let i = 0; i < nx; i++) spots.push([w / 2 - (i * w) / nx, -h / 2]);
  for (let i = 0; i < ny; i++) spots.push([-w / 2, -h / 2 + (i * h) / ny]);
  const geo = new THREE.SphereGeometry(r, 8, 6);
  const group = new THREE.Group();
  mats.forEach((mat, k) => {
    const mine = spots.filter((_, i) => i % 3 === k);
    const inst = new THREE.InstancedMesh(geo, mat, mine.length);
    const m = new THREE.Matrix4();
    mine.forEach(([x, y], i) => inst.setMatrixAt(i, m.makeTranslation(x, y, 0)));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    group.add(inst);
  });
  let step = -1;
  return {
    group,
    update(t) {
      const s = Math.floor(t * 7) % 3;
      if (s === step) return;
      step = s;
      mats.forEach((m, k) => m.color.copy(k === s ? lit[k] : dim));
    },
  };
}
