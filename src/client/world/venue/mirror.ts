import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/*
 * A real mirror for the Schallwerk's green room (flrnoh fork, see FORK.md "The Schallwerk"): a
 * Reflector that draws the room as seen in it, you included. In first person your own body is
 * hidden (you're the camera), so for the mirror's own render it's shown and hidden again. It only
 * renders while the camera's in front of it (`sees`), so the hall pays nothing for it.
 */

let self: (() => THREE.Object3D | null) | null = null;
/** Who you are in the scene (your avatar's root), for the mirrors to show. Set once by the places. */
export const setMirrorSelf = (fn: () => THREE.Object3D | null) => {
  self = fn;
};

/** A mirror `w` × `h` facing +z, rendering only while `sees(camera)`. */
export function makeMirror(w: number, h: number, sees: (camera: THREE.Camera) => boolean): THREE.Mesh {
  const px = 640;
  const mirror = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: px, textureHeight: Math.round((px * h) / w), color: 0xc8ccd2, clipBias: 0.003 });
  mirror.userData.outlineParameters = { visible: false };
  const render = mirror.onBeforeRender;
  mirror.onBeforeRender = function (renderer, scene, camera, ...rest) {
    if (!sees(camera)) return;
    const me = self?.() ?? null;
    const was = me?.visible ?? false;
    if (me) me.visible = true;
    render.call(this, renderer, scene, camera, ...rest);
    if (me) me.visible = was;
  };
  return mirror;
}
