import * as THREE from 'three';
import { BALL_R, NPC_NAMES, TEAMS, VOLLEY, type VolleyState } from '../../../shared/volley';
import { canvasTexture } from '../../world/texture';
import { Person } from '../../world/character';
import { noOutline } from '../../core/outline';
import { mesh, toon } from '../../world/toon';
import { G, box } from '../../world/scenic/kit';

// What the beach volleyball looks like (flrnoh fork, see FORK.md "A day at the beach"; volley.ts
// plays it): the ball and its shadow on the sand, the computer team (Kalle, Jette, Ole and Fiete), and
// the scoreboard by the net. All of it in the scenic loop's group, so it drops with the street.

/** The ball: white with yellow and blue panels, a texture drawn once. */
function ballTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 64, (g) => {
    const bands = ['#ffd166', '#f8f9fa', '#1d3fbb', '#f8f9fa', '#ffd166', '#f8f9fa'];
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * 128) / bands.length, 0, 128 / bands.length + 1, 64);
    });
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 2;
    for (let i = 0; i < bands.length; i++) {
      g.beginPath();
      g.moveTo((i * 128) / bands.length, 0);
      g.lineTo((i * 128) / bands.length, 64);
      g.stroke();
    }
  });
}

export class VolleyView {
  readonly ball: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  readonly npcs: Person[] = [];
  private readonly board: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; key: string };

  constructor(readonly group: THREE.Group) {
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.9, 18, 12), new THREE.MeshToonMaterial({ map: ballTexture() }));
    this.ball.castShadow = true;
    group.add(this.ball);
    const shade = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16).rotateX(-Math.PI / 2), shade);
    shade.userData.outlineParameters = { visible: false };
    group.add(this.shadow);
    // The computer team: two a side, in their team's shirts.
    const looks = [
      { skin: 1, hair: 2, style: 1 },
      { skin: 3, hair: 4, style: 6 },
      { skin: 2, hair: 1, style: 3 },
      { skin: 0, hair: 5, style: 7 },
    ];
    NPC_NAMES.forEach((name, i) => {
      const p = new Person(name, TEAMS[i < 2 ? 0 : 1].color, looks[i]);
      noOutline(p.root);
      // No name tag (it'd show a mic, like a person's): they say who they are as they play.
      p.showLabel(false);
      p.root.position.set(VOLLEY.x - VOLLEY.halfW - 3, G, VOLLEY.z - 3 + i * 2);
      group.add(p.root);
      this.npcs.push(p);
    });
    // The scoreboard by the net, on the road side: a board on two legs, the score on both faces.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.board = { tex, g: c.getContext('2d')!, key: '' };
    const face = new THREE.MeshBasicMaterial({ map: tex });
    const bx = VOLLEY.x + VOLLEY.halfW + VOLLEY.netOver + 2.6;
    for (const s of [-1, 1]) group.add(mesh(box(0.1, 2.4, 0.1), toon('#3d405b'), bx, G + 1.2, VOLLEY.z + s * 1.1));
    group.add(mesh(box(0.14, 1.25, 2.5), toon('#22223b'), bx, G + 2.6, VOLLEY.z));
    for (const s of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), face);
      plane.position.set(bx + s * 0.075, G + 2.6, VOLLEY.z);
      plane.rotation.y = (s * Math.PI) / 2;
      group.add(plane);
    }
  }

  /** The ball at (x, y, z) above the sand, turning as it goes. */
  setBall(x: number, y: number, z: number, spin: number) {
    this.ball.position.set(x, G + y, z);
    this.ball.rotation.set(spin, spin * 0.6, 0);
    this.shadow.position.set(x, G + 0.02, z);
    const k = Math.max(0.35, 1 - y / 8);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 * k;
  }

  /** The score on the board (drawn again only when it changes). */
  setScore(s: VolleyState, banner: string) {
    const key = `${s.score[0]}:${s.score[1]}|${banner}`;
    if (key === this.board.key) return;
    this.board.key = key;
    const g = this.board.g;
    g.fillStyle = '#14213d';
    g.fillRect(0, 0, 512, 256);
    g.textAlign = 'center';
    g.font = '800 34px Nunito, ui-rounded, system-ui, sans-serif';
    TEAMS.forEach((t, i) => {
      g.fillStyle = t.color;
      g.fillText(`${t.icon} ${t.name}`, 128 + i * 256, 54);
      g.fillStyle = '#fefae0';
      g.font = '900 120px Nunito, ui-rounded, system-ui, sans-serif';
      g.fillText(String(s.score[i]), 128 + i * 256, 180);
      g.font = '800 34px Nunito, ui-rounded, system-ui, sans-serif';
    });
    g.fillStyle = '#ffd166';
    g.fillText(':', 256, 160);
    g.font = '700 26px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText(banner || 'bis 15 · 2 Punkte Vorsprung', 256, 236);
    this.board.tex.needsUpdate = true;
  }
}
