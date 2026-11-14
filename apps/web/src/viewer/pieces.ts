/**
 * Procedural clay furniture for the room viewer, one shape per item kind. The shapes are the
 * prototype's productShot() pieces (sofa, armchair, chairs, rug, lamps, bed, stool, shelf, mirror,
 * table…) built at their native size, then stretched to the layout object's w × h × d.
 */
import * as THREE from 'three';
import { lc, roundBox, shade } from './three-kit';

const WOOD = '#B88A5F';
const DARK = '#2A2622';

/** Which prototype shape draws a layout type (types come from the layout engine). */
export function pieceKind(type: string, name = ''): string {
  const t = `${type} ${name}`.toLowerCase();
  if (/ceiling|pendant/.test(t)) return 'pendant';
  if (/floor_lamp|floor lamp/.test(t)) return 'floor_lamp';
  if (/lamp/.test(t)) return 'lamp';
  if (/sofa|couch|loveseat/.test(t)) return 'sofa';
  if (/armchair|desk_chair|task chair|office chair|lounge chair/.test(t)) return 'armchair';
  if (/chair/.test(t)) return 'chair';
  if (/rug|mat\b/.test(t)) return 'rug';
  if (/\bbed\b|bed_frame|bed frame/.test(t)) return 'bed';
  if (/stool/.test(t)) return 'stool';
  if (/mirror/.test(t)) return 'mirror';
  if (/\bart\b|picture|poster|print|frame/.test(t)) return 'art';
  if (/plant/.test(t)) return 'plant';
  if (/pouf|ottoman/.test(t)) return 'pouf';
  if (/cat_tree|cat tree/.test(t)) return 'cat_tree';
  if (/\btv\b|television/.test(t)) return 'tv';
  if (/sideboard|dresser|cabinet|console|tv_unit|media|chest/.test(t)) return 'sideboard';
  if (/shelf|bookcase|niche/.test(t)) return 'shelf';
  if (/coffee/.test(t)) return 'coffee_table';
  if (/side_table|side table|nightstand|bedside/.test(t)) return 'side_table';
  if (/desk|table/.test(t)) return 'table';
  return 'box';
}

/** Palette index the prototype uses for each kind (sofa P[1], rug P[3], wood things P[5], lamps P[2]…). */
const KIND_PAL: Record<string, number> = {
  sofa: 1, armchair: 0, chair: 0, rug: 3, floor_lamp: 2, lamp: 2, pendant: 2, bed: 5, stool: 1, mirror: 5,
  art: 5, plant: 0, pouf: 4, cat_tree: 4, tv: 5, sideboard: 5, shelf: 5, coffee_table: 5, side_table: 5, table: 5, box: 1,
};

const HEX = /^#[0-9a-f]{6}$/i;
export function pieceColour(kind: string, P: string[], colour?: string): string {
  if (colour && HEX.test(colour)) return colour;
  return P[(KIND_PAL[kind] ?? 1) % P.length];
}

/** The piece at its native (prototype) size; base on y = 0, front facing +z. */
function native(kind: string, color: string, P: string[]): THREE.Group {
  const g = new THREE.Group();
  const M = (c: string) => new THREE.MeshStandardMaterial({ color: lc(c), roughness: 0.82 });
  const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, rad?: number) => {
    const geo = rad ? roundBox(w, h, d, Math.min(rad, w / 2.1, h / 2.1, d / 2.1), 6) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, M(c));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  };
  const cyl = (rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 32) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(c));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  };
  const legs = (w: number, d: number, h: number, c: string, t = 0.05) => {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(t, h, t, c, a * (w / 2 - 0.06), 0, b * (d / 2 - 0.06));
  };

  switch (kind) {
    case 'sofa':
      box(2, 0.42, 0.9, color, 0, 0.12, 0, 0.08);
      box(2, 0.5, 0.22, color, 0, 0.5, -0.34, 0.08);
      box(0.22, 0.6, 0.9, color, -1, 0.12, 0, 0.08);
      box(0.22, 0.6, 0.9, color, 1, 0.12, 0, 0.08);
      legs(1.9, 0.8, 0.12, DARK);
      break;
    case 'armchair':
      box(0.85, 0.4, 0.8, color, 0, 0.14, 0, 0.08);
      box(0.85, 0.5, 0.18, color, 0, 0.5, -0.31, 0.08);
      box(0.16, 0.55, 0.8, color, -0.42, 0.14, 0, 0.06);
      box(0.16, 0.55, 0.8, color, 0.42, 0.14, 0, 0.06);
      legs(0.8, 0.75, 0.14, WOOD);
      break;
    case 'chair':
      box(0.45, 0.05, 0.45, color, 0, 0.45, 0);
      box(0.45, 0.5, 0.05, color, 0, 0.5, -0.2);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.04, 0.45, 0.04, WOOD, a * 0.19, 0, b * 0.19);
      break;
    case 'rug':
      box(1.8, 0.03, 1.2, color, 0, 0, 0);
      box(1.8 * 0.7, 0.032, 1.2 * 0.12, shade(color, 0.35), 0, 0, -1.2 * 0.2);
      box(1.8 * 0.7, 0.032, 1.2 * 0.12, shade(color, 0.35), 0, 0, 1.2 * 0.2);
      break;
    case 'floor_lamp':
      cyl(0.2, 0.24, 0.04, DARK, 0, 0, 0);
      cyl(0.015, 0.015, 1.5, DARK, 0, 0.04, 0, 12);
      cyl(0.17, 0.24, 0.32, color, 0, 1.45, 0);
      break;
    case 'pendant':
      cyl(0.06, 0.3, 0.28, color, 0, 0, 0);
      break;
    case 'lamp':
      cyl(0.12, 0.14, 0.04, DARK, 0, 0, 0);
      cyl(0.09, 0.11, 0.32, color, 0, 0.04, 0);
      cyl(0.012, 0.012, 0.14, DARK, 0, 0.36, 0, 8);
      cyl(0.13, 0.19, 0.22, '#F6F0E4', 0, 0.48, 0);
      break;
    case 'bed':
      box(1.6, 0.32, 2, color, 0, 0.08, 0, 0.04);
      box(1.55, 0.18, 1.8, '#F6F0E4', 0, 0.4, 0.08, 0.06);
      box(1.6, 0.85, 0.1, color, 0, 0.08, -0.98, 0.04);
      box(0.5, 0.12, 0.32, '#FFFFFF', -0.38, 0.58, -0.7, 0.06);
      box(0.5, 0.12, 0.32, '#FFFFFF', 0.38, 0.58, -0.7, 0.06);
      legs(1.6, 2, 0.08, DARK);
      break;
    case 'stool':
      cyl(0.18, 0.18, 0.06, color, 0, 0.7, 0);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.03, 0.7, 0.03, WOOD, a * 0.1, 0, b * 0.1);
      break;
    case 'shelf':
      for (const y of [0, 0.35, 0.7]) box(1, 0.04, 0.28, color, 0, y + 0.2, 0);
      box(0.03, 1, 0.28, DARK, -0.48, 0.1, 0);
      box(0.03, 1, 0.28, DARK, 0.48, 0.1, 0);
      break;
    case 'mirror': {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 16, 48), M(color));
      m.position.set(0, 0.45, 0.05);
      g.add(m);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(0.4, 48), new THREE.MeshStandardMaterial({ color: lc('#DDE7EA'), roughness: 0.05, metalness: 0.6 }));
      gl.position.set(0, 0.45, 0.04);
      g.add(gl);
      break;
    }
    case 'art':
      // the prototype's wall art: a frame with a smaller panel in front
      box(0.95, 1.15, 0.04, color, 0, 0, 0);
      box(0.8, 1, 0.05, P[3] === color ? shade(color, 0.3) : P[3], 0, 0.075, 0.01);
      break;
    case 'plant':
      cyl(0.16, 0.12, 0.3, color, 0, 0, 0);
      for (const [x, y, z, r] of [[0, 0.62, 0, 0.28], [-0.12, 0.5, 0.08, 0.2], [0.13, 0.52, -0.05, 0.2], [0.02, 0.8, -0.04, 0.18]]) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M('#3E7D55'));
        m.position.set(x, y, z);
        g.add(m);
      }
      break;
    case 'pouf':
      box(0.5, 0.42, 0.5, color, 0, 0, 0, 0.16);
      break;
    case 'cat_tree':
      box(0.6, 0.06, 0.5, color, 0, 0, 0);
      cyl(0.06, 0.06, 1.2, '#C9B48A', -0.15, 0.06, 0, 12);
      cyl(0.06, 0.06, 0.8, '#C9B48A', 0.17, 0.06, 0.05, 12);
      box(0.45, 0.05, 0.4, color, -0.1, 1.26, 0, 0.02);
      box(0.4, 0.05, 0.35, color, 0.12, 0.86, 0.05, 0.02);
      break;
    case 'tv':
      box(1.2, 0.7, 0.05, DARK, 0, 0, 0, 0.01);
      break;
    case 'sideboard':
      box(1.6, 0.62, 0.45, color, 0, 0.14, 0, 0.02);
      box(0.76, 0.5, 0.01, shade(color, -0.08), -0.39, 0.2, 0.225);
      box(0.76, 0.5, 0.01, shade(color, -0.08), 0.39, 0.2, 0.225);
      legs(1.55, 0.4, 0.14, DARK, 0.04);
      break;
    case 'coffee_table':
    case 'side_table':
    case 'table': {
      const low = kind !== 'table';
      const h = low ? 0.4 : 0.74;
      const w = kind === 'side_table' ? 0.5 : low ? 1 : 1.4;
      const d = kind === 'side_table' ? 0.5 : low ? 0.6 : 0.7;
      box(w, 0.05, d, color, 0, h - 0.05, 0, 0.015);
      legs(w, d, h - 0.05, low ? shade(color, -0.15) : WOOD, 0.06);
      break;
    }
    default:
      box(0.8, 0.6, 0.5, color, 0, 0, 0, 0.06);
  }
  return g;
}

/** Scale `obj` (any orientation-agnostic model) so its bounding box is w × h × d; base on y = 0, centred. */
export function stretchTo(obj: THREE.Object3D, w: number, h: number, d: number): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(obj);
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  obj.scale.set(s.x > 1e-4 ? w / s.x : 1, s.y > 1e-4 ? h / s.y : 1, s.z > 1e-4 ? d / s.z : 1);
  const c = b.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * obj.scale.x, -b.min.y * obj.scale.y, -c.z * obj.scale.z);
  return wrap;
}

/** A procedural clay piece for a layout object: w × h × d metres, base on y = 0, front facing +z. */
export function clayPiece(kind: string, w: number, h: number, d: number, color: string, P: string[]): THREE.Group {
  const g = stretchTo(native(kind, color, P), Math.max(0.02, w), Math.max(0.01, h), Math.max(0.01, d));
  g.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    o.castShadow = kind !== 'rug';
    o.receiveShadow = true;
  });
  return g;
}
