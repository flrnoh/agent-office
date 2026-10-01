import * as THREE from 'three';
import { BALL_R } from '../../shared/soccer-ball';

/**
 * The aim's drawing (flrnoh fork, the soccer hall): a translucent arrow on the floor from the ball the
 * way a pass or shot will go, and the power bar and who-it's-for by the crosshair. place.ts decides
 * what to show; this only draws it.
 */
export interface AimLook {
  /** Where the ball is, which way (yaw) and how far the arrow points; opacity 0 hides it. */
  at: { x: number; z: number };
  dir: number;
  len: number;
  color: string;
  opacity: number;
  /** By the crosshair: charging a shot (or chip), how full (0..1), and the label (SHOT, → Ann). */
  charging: boolean;
  lob: boolean;
  charge: number;
  text: string;
  third: boolean;
}

/** The floor arrow, added to `parent` (the hall's room), hidden until it's drawn. */
export function aimArrow(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  mat.toneMapped = false;
  mat.userData.outlineParameters = { visible: false };
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1), mat);
  strip.rotation.x = -Math.PI / 2;
  strip.name = 'strip';
  const tri = new THREE.Shape();
  tri.moveTo(-0.26, 0);
  tri.lineTo(0.26, 0);
  tri.lineTo(0, 0.42);
  tri.closePath();
  const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
  head.rotation.x = Math.PI / 2;
  head.name = 'head';
  g.add(strip, head);
  g.renderOrder = 5;
  g.visible = false;
  g.userData.mat = mat;
  parent.add(g);
  return g;
}

/** Draws `look` on the arrow and the crosshair's element (`.bar i` the power, `.who` the label). */
export function drawAim(arrow: THREE.Group, el: HTMLElement | null, look: AimLook) {
  arrow.visible = look.opacity > 0;
  if (arrow.visible) {
    arrow.position.set(look.at.x, 0.03, look.at.z);
    arrow.rotation.y = look.dir;
    const strip = arrow.getObjectByName('strip')!;
    strip.scale.set(1, look.len, 1);
    strip.position.set(0, 0, look.len / 2 + BALL_R);
    arrow.getObjectByName('head')!.position.set(0, 0.001, look.len + BALL_R);
    const mat = arrow.userData.mat as THREE.MeshBasicMaterial;
    mat.color.set(look.color);
    mat.opacity = look.opacity;
  }
  if (!el) return;
  el.classList.toggle('charging', look.charging);
  el.classList.toggle('lob', look.lob);
  el.classList.toggle('full', look.charging && look.charge >= 1);
  el.classList.toggle('third', look.third);
  (el.querySelector('.bar i') as HTMLElement).style.width = `${Math.round((look.charging ? look.charge : 0) * 100)}%`;
  const t = el.querySelector('.who') as HTMLElement;
  if (t.textContent !== look.text) t.textContent = look.text;
}
