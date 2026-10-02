import * as THREE from 'three';
import { WING_SPOTS, type WingSpot } from '../../../shared/proberaum-layout';
import type { ProbeView } from '../../../shared/proberaum';
import { REHEARSAL_ROOMS, type RehearsalRoomId } from '../../../shared/venue';
import type { Collider, Interactable } from '../../world/types';
import { drawBandname, drawBookingBoard, drawPanel, drawPins, drawPolaroids, drawRecorder, drawSetlist, drawTips } from './boards';
import { buildDoor, type DoorView } from './doors';
import { buildLobby, type LobbyBuilt } from './lobby';
import { buildRoom, type RoomBuilt } from './rooms';
import { buildShell } from './shell';
import { buildStudio, type StudioBuilt } from './studio';

/*
 * The rehearsal wing put together (flrnoh fork, see FORK.md "The rehearsal wing"): the shell, the
 * lobby, the three rooms, the studio and the four doors, in the Schallwerk's interior coordinates;
 * what you walk into, what you use (each thing's interactable on the meshes the crosshair finds),
 * and drawing the boards again when the wing changes.
 */

declare module '../../world/types' {
  interface Interactable {
    /** Fork: what it is in the Schallwerk's rehearsal wing (features/proberaum). */
    probe?: WingSpot;
  }
}

export interface Wing {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  doors: Map<RehearsalRoomId, DoorView>;
  lobby: LobbyBuilt;
  rooms: Map<RehearsalRoomId, RoomBuilt>;
  studio: StudioBuilt;
  /** Draws the boards and the doors' screens from the wing as it is (when it's changed, and once a minute for the clocks). */
  redraw(v: ProbeView | null, now: number, bandIdea: string): void;
  /** The recorders' displays (twice a second while one runs). */
  recorders(v: ProbeView | null, now: number, takeName: (id: string) => string | null): void;
  /** Every frame: the doors swing, the lava lamp and the fairy lights. */
  update(t: number, dt: number): void;
}

export function buildWing(kind: Interactable['kind']): Wing {
  const group = new THREE.Group();
  group.name = 'proberaum';
  const shell = buildShell();
  const lobby = buildLobby();
  const studio = buildStudio();
  const rooms = new Map<RehearsalRoomId, RoomBuilt>();
  const doors = new Map<RehearsalRoomId, DoorView>();
  group.add(shell.group, lobby.group, studio.group);
  const colliders = [...shell.colliders, ...lobby.colliders, ...studio.colliders];
  for (const r of REHEARSAL_ROOMS) {
    if (r.id !== 'studio') {
      const built = buildRoom(r);
      rooms.set(r.id, built);
      group.add(built.group);
      colliders.push(...built.colliders);
    }
    const door = buildDoor(r, group);
    doors.set(r.id, door);
    colliders.push(...door.colliders);
  }

  // What you use, and the meshes the crosshair finds for each.
  const interactables: Interactable[] = WING_SPOTS.map((s) => ({ kind, probe: s, x: s.x, z: s.z, radius: s.radius }));
  const find = (what: WingSpot['what'], room?: RehearsalRoomId) => interactables.find((it) => it.probe!.what === what && it.probe!.room === room);
  const tag = (o: THREE.Object3D | undefined, it: Interactable | undefined) => o && it && o.traverse((x) => (x.userData.interact = it));
  for (const [what, o] of Object.entries(lobby.tags)) tag(o, find(what as WingSpot['what']));
  for (const [id, r] of rooms) for (const [what, o] of Object.entries(r.tags)) tag(o, find(what as WingSpot['what'], id));
  for (const [what, o] of Object.entries(studio.tags)) tag(o, find(what as WingSpot['what'], 'studio'));
  for (const [id, d] of doors) {
    tag(d.leaf, find('door', id));
    tag(d.screen, find('panel', id));
  }

  let lastKey = '';
  return {
    group,
    colliders,
    interactables,
    doors,
    lobby,
    rooms,
    studio,
    redraw(v, now, idea) {
      // Cheap enough on every change; the minute on the clocks redraws them once a minute too.
      const key = `${JSON.stringify(v?.rooms)}|${v?.pins.map((p) => p.id).join()}|${v?.polaroids.length}|${v?.tips}|${idea}|${Math.floor(now / 60_000)}`;
      if (key === lastKey) return;
      lastKey = key;
      drawBookingBoard(lobby.boards.booking, v, now);
      drawPins(lobby.boards.notes, v?.pins ?? []);
      drawPolaroids(lobby.boards.polaroids, v?.polaroids ?? []);
      drawBandname(lobby.boards.bandname, idea);
      drawTips(lobby.boards.tips, v?.tips ?? 0);
      for (const r of REHEARSAL_ROOMS) {
        const room = v?.rooms.find((x) => x.id === r.id);
        const door = doors.get(r.id)!;
        if (room) drawPanel(door.panel, room, now);
        const built = rooms.get(r.id);
        if (built) drawSetlist(built.setlist, room?.setlist ?? '', room?.setlistBy ?? '', r.id);
      }
    },
    recorders(v, now, takeName) {
      for (const r of REHEARSAL_ROOMS) {
        const room = v?.rooms.find((x) => x.id === r.id);
        drawRecorder(rooms.get(r.id)?.recorder ?? studio.recorder, room, room?.playing ? takeName(room.playing.take) : null, now);
      }
    },
    update(t, dt) {
      for (const d of doors.values()) d.update(dt);
      for (const r of rooms.values()) r.update(t);
      studio.update(t);
    },
  };
}
