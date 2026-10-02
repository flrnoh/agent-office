import * as THREE from 'three';
import type { ToyId, ToyServerMsg } from '../../../shared/shopwares';
import type { Ctx } from '../../core/context';
import { groundAt } from '../../player/collide';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import { mesh, toon } from '../../world/toon';

// Playing with a toy from the toy shop (flrnoh fork, see FORK.md "Shops to walk into"): with one in
// your hand, a click (or E with nothing else to use) plays with it, and everyone on your floor sees
// and hears it (the toy.use message, passed on as toy.used): the yo-yo runs down its string and back,
// bubbles float off and pop, the duck squeaks, the paper plane glides off and lands, the water pistol
// squirts (whoever it hits gets a little splash, nothing more), and the teddy gets a hug.

interface Fx {
  /** False once it's done (and gone). */
  step(dt: number): boolean;
}

const BUBBLE = new THREE.MeshBasicMaterial({ color: '#cdeffd', transparent: true, opacity: 0.45, depthWrite: false });
BUBBLE.userData.outlineParameters = { visible: false };
const DROP = new THREE.MeshBasicMaterial({ color: '#8ecae6', transparent: true, opacity: 0.8, depthWrite: false });
DROP.userData.outlineParameters = { visible: false };
let heartMat: THREE.SpriteMaterial | null = null;
const heart = () => {
  if (heartMat) return heartMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('❤️', 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (heartMat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
};

export interface ToyDeps {
  /** Someone else's character, by id. */
  personOf(id: string): Person | undefined;
  nameOf(id: string): string;
}

export function toyBox(ctx: Ctx, deps: ToyDeps) {
  const group = new THREE.Group();
  ctx.scene.add(group);
  const fxs: Fx[] = [];
  const geo = { bubble: new THREE.SphereGeometry(0.07, 10, 8), drop: new THREE.SphereGeometry(0.025, 6, 5) };

  /** Where someone's hand is: out in front and to the side of (x, y, z), facing `yaw`. */
  const hand = (x: number, y: number, z: number, yaw: number) => new THREE.Vector3(x + Math.sin(yaw) * 0.35 - Math.cos(yaw) * 0.3, y + 0.95, z + Math.cos(yaw) * 0.35 + Math.sin(yaw) * 0.3);

  function play(m: Omit<ToyServerMsg, 't'>, mine: boolean) {
    const from = hand(m.x, m.y, m.z, m.yaw);
    const dir = new THREE.Vector3(Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), Math.cos(m.yaw) * Math.cos(m.pitch));
    const who = mine ? ctx.me : deps.personOf(m.id);
    const sound = (k: Parameters<Ctx['sound']['shop']>[0]) => ctx.sound.shop(k, { x: from.x, y: from.y, z: from.z });
    who?.reach();
    switch (m.toy as ToyId) {
      case 'yoyo': {
        sound('yoyo');
        const yo = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2), toon('#e63946'), from.x, from.y, from.z, false);
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4), toon('#ffffff'));
        group.add(yo, line);
        let t = 0;
        fxs.push({
          step(dt) {
            t += dt;
            const k = Math.sin(Math.min(1, t / 1.1) * Math.PI);
            yo.position.set(from.x, from.y - 0.75 * k, from.z);
            yo.rotation.y += dt * 30;
            line.scale.y = Math.max(0.01, 0.75 * k);
            line.position.set(from.x, from.y - 0.375 * k, from.z);
            if (t < 1.1) return true;
            group.remove(yo, line);
            yo.geometry.dispose();
            line.geometry.dispose();
            return false;
          },
        });
        return;
      }
      case 'seifenblasen':
        for (let i = 0; i < 14; i++) {
          const b = new THREE.Mesh(geo.bubble, BUBBLE);
          const s = 0.5 + Math.random();
          b.scale.setScalar(s);
          b.position.copy(from).addScaledVector(dir, 0.3);
          group.add(b);
          const v = dir.clone().multiplyScalar(0.5 + Math.random() * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
          let life = 2.5 + Math.random() * 3;
          let t = 0;
          fxs.push({
            step(dt) {
              t += dt;
              b.position.addScaledVector(v, dt);
              b.position.x += Math.sin(t * 3 + i) * dt * 0.2;
              if ((life -= dt) > 0) return true;
              sound('pop');
              group.remove(b);
              return false;
            },
          });
        }
        return;
      case 'quietscheente':
        sound('squeak');
        who?.say('Quietsch! 🦆', 1.6);
        return;
      case 'papierflieger': {
        sound('whoosh');
        const plane = new THREE.Group();
        for (const side of [-1, 1]) {
          const w = mesh(new THREE.ConeGeometry(0.09, 0.3, 3), toon('#f8f9fa'), side * 0.04, 0, 0, false);
          w.rotation.set(Math.PI / 2, 0, side * 0.25);
          w.scale.set(1, 1, 0.08);
          plane.add(w);
        }
        plane.position.copy(from);
        plane.rotation.y = m.yaw;
        group.add(plane);
        const v = dir.clone().setY(Math.max(0.05, dir.y + 0.1)).normalize().multiplyScalar(6);
        let landed = -1;
        fxs.push({
          step(dt) {
            if (landed >= 0) {
              landed += dt;
              if (landed < 12) return true;
              group.remove(plane);
              plane.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
              return false;
            }
            // It glides: a little lift while it's quick, slowing, sinking, nose following its way.
            v.y -= dt * 1.4;
            v.multiplyScalar(1 - dt * 0.18);
            const next = plane.position.clone().addScaledVector(v, dt);
            const ground = groundAt(ctx.player.colliders, next.x, next.z, plane.position.y);
            const wall = ctx.player.colliders.some((c) => next.x > c.minX && next.x < c.maxX && next.z > c.minZ && next.z < c.maxZ && next.y < c.top - 0.05 && next.y > (c.bottom ?? -Infinity));
            if (wall) v.set(-v.x * 0.2, Math.min(0, v.y), -v.z * 0.2);
            else plane.position.copy(next);
            plane.rotation.set(Math.atan2(-v.y, Math.hypot(v.x, v.z)) * 0.6, Math.atan2(v.x, v.z), 0, 'YXZ');
            if (plane.position.y <= Math.max(ground, ctx.player.street) + 0.03) {
              plane.position.y = Math.max(ground, ctx.player.street) + 0.03;
              plane.rotation.x = 0;
              landed = 0;
            }
            return true;
          },
        });
        return;
      }
      case 'wasserpistole': {
        sound('squirt');
        for (let i = 0; i < 16; i++) {
          const d = new THREE.Mesh(geo.drop, DROP);
          d.position.copy(from).addScaledVector(dir, 0.3);
          group.add(d);
          const v = dir.clone().multiplyScalar(7 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
          let t = -i * 0.03;
          fxs.push({
            step(dt) {
              t += dt;
              if (t < 0) return true;
              v.y -= 9.8 * dt;
              d.position.addScaledVector(v, dt);
              if (t < 1.2 && d.position.y > ctx.player.street) return true;
              group.remove(d);
              return false;
            },
          });
        }
        // Someone else's squirt that gets you: a little splash, nothing more.
        if (!mine) {
          const me = ctx.player.pos.clone().setY(ctx.player.pos.y + 1.2);
          const to = me.clone().sub(from);
          const along = to.dot(dir);
          if (along > 0 && along < 7 && to.clone().addScaledVector(dir, -along).length() < 0.7) {
            setTimeout(() => {
              ctx.sound.shop('splash', { x: me.x, y: me.y, z: me.z });
              ctx.shake(0.18);
              ctx.me.say('💦', 1.5);
              toast(`💦 ${deps.nameOf(m.id)} got you with the water pistol!`);
            }, along * 120);
          }
        }
        return;
      }
      case 'teddy':
        sound('hug');
        for (let i = 0; i < 4; i++) {
          const s = new THREE.Sprite(heart());
          s.scale.setScalar(0.22);
          s.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4));
          group.add(s);
          let t = -i * 0.2;
          fxs.push({
            step(dt) {
              t += dt;
              if (t < 0) return true;
              s.position.y += dt * 0.5;
              s.material.opacity = Math.max(0, 1 - t / 1.6);
              if (t < 1.6) return true;
              group.remove(s);
              return false;
            },
          });
        }
        who?.say('🧸 *drück*', 1.6);
        return;
    }
  }

  ctx.messages.on('toy.used', (msg) => play(msg, false));
  ctx.ticks.add('world', ({ dt }) => {
    for (let i = fxs.length - 1; i >= 0; i--) if (!fxs[i].step(Math.min(dt, 0.1))) fxs.splice(i, 1);
  });

  return {
    /** Plays with `toy` where you are, and tells your floor. */
    use(toy: ToyId) {
      const p = ctx.player;
      const yaw = p.view === 'first' ? p.camYaw + Math.PI : p.facing;
      const pitch = p.view === 'first' ? Math.max(-0.6, Math.min(0.8, p.lookPitch)) : 0.1;
      const m = { id: '', toy, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw, pitch };
      play(m, true);
      ctx.net.send({ t: 'toy.use', toy, x: m.x, y: m.y, z: m.z, yaw, pitch });
    },
  };
}
