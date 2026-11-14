/**
 * Shared three.js pieces ported from the studio prototype (saas-ui/hey-jenna-app.html, three r128):
 * terrazzo texture, rounded boxes, the studio environment, the room "furnish" set and roomShot().
 *
 * r128 → 0.169 notes, so the port looks the same as the prototype:
 * - r128 had no colour management: hex colours went into the shaders as-is and were then
 *   sRGB-encoded on output. `lc()` reproduces that (hex read as linear values).
 * - r155+ dropped the legacy light units: direct and hemisphere lights need × π (`LI`).
 * - `encoding = sRGBEncoding` is now `colorSpace = SRGBColorSpace`; `outputEncoding` is
 *   `outputColorSpace` (sRGB is the default).
 */
import * as THREE from 'three';
import { shade } from '../editor/colour';

/** Legacy light-unit factor (r128 → r155+). */
export const LI = Math.PI;

/** A colour as r128 read it: the hex digits taken as linear values. */
export function lc(c: THREE.ColorRepresentation): THREE.Color {
  if (c instanceof THREE.Color) return c.clone();
  const out = new THREE.Color();
  if (typeof c === 'number') return out.setHex(c, THREE.LinearSRGBColorSpace);
  return out.setStyle(c, THREE.LinearSRGBColorSpace);
}

export const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TERRAZZO_CHIPS = ['#2E8B7A', '#3E7D55', '#E8A0B8', '#B9A4D9', '#E8955A', '#7FB7C9', '#C9B48A', '#D96C6C'];

/** Terrazzo canvas texture: a base colour with random stone chips. `speckle` adds jenna's fine grain. */
export function terrazzo(base = '#F4EEE7', cols = TERRAZZO_CHIPS, speckle = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  if (speckle)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,85' : '255,255,255'},${Math.random() * 0.07})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  for (let i = 0; i < 120; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 512;
    const r = 7 + Math.random() * 20;
    const n = speckle ? 3 + Math.floor(Math.random() * 3) : 3 + (i % 3);
    const a0 = Math.random() * 6.28;
    g.fillStyle = cols[i % cols.length];
    if (speckle) g.globalAlpha = 0.85 + Math.random() * 0.15;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * 6.28) / n + Math.random() * 0.7;
      const rr = r * (0.55 + Math.random() * 0.7);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Rounded box: box vertices pushed onto a rounded shell, normals from the inner core. */
export function roundBox(sx: number, sy: number, sz: number, r: number, seg: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(sx, sy, sz, seg, seg, seg);
  const P = geo.attributes.position as THREE.BufferAttribute;
  const N = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const h = [sx / 2 - r, sy / 2 - r, sz / 2 - r];
  const { clamp } = THREE.MathUtils;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    c.set(clamp(v.x, -h[0], h[0]), clamp(v.y, -h[1], h[1]), clamp(v.z, -h[2], h[2]));
    d.copy(v).sub(c).normalize();
    v.copy(c).addScaledVector(d, r);
    P.setXYZ(i, v.x, v.y, v.z);
    N.setXYZ(i, d.x, d.y, d.z);
  }
  return geo;
}

/** Soft studio reflections (a warm grey box with a few light panels), prefiltered with PMREM. */
export function studioEnv(renderer: THREE.WebGLRenderer, floorPanel = false): THREE.Texture {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: lc(0x9a8f86), side: THREE.BackSide })));
  const panels: number[][] = [
    [0, 5, 3, 6, 2, 2.6],
    [-5, 1, 2, 2, 5, 1.4],
    [5, 2, -1, 2, 4, 1.1],
  ];
  if (floorPanel) panels.push([0, -4, 4, 8, 1, 0.5]);
  for (const [x, y, z, w, h, i] of panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i) }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const t = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  disposeTree(env);
  return t;
}

/** Free every geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** A palette padded to at least 6 colours (the prototype indexes P[0..5]). */
export function pal6(P: string[] | undefined): string[] {
  const src = P && P.length ? P : ['#2B5391', '#D6483C', '#F6F0E4', '#E4B04A', '#7FB7C9', '#27231D'];
  return Array.from({ length: Math.max(6, src.length) }, (_, i) => src[i % src.length]);
}

const lum = (c: string) => {
  const k = lc(c);
  return k.r * 0.3 + k.g * 0.59 + k.b * 0.11;
};
/** The lightest colour in a palette. */
export const lightest = (P: string[]) => [...P].sort((a, b) => lum(b) - lum(a))[0];

type MatFn = (c: THREE.ColorRepresentation) => THREE.Material;

/** The prototype's room set by room kind (bed, kitchen, dining, bath, desk, else a living room). */
function furnish(g: THREE.Group, kind: string, x: number, z: number, w: number, d: number, P: string[], mat: MatFn) {
  const box = (bw: number, bh: number, bd: number, c: string, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat(c));
    m.position.set(x + px, py + bh / 2, z + pz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (r: number, h: number, c: string, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat(c));
    m.position.set(x + px, py + h / 2, z + pz);
    m.castShadow = true;
    g.add(m);
  };
  const rug = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.02, d * 0.45), mat(P[3]));
  rug.position.set(x + w * 0.5, 0.01, z + d * 0.55);
  rug.receiveShadow = true;
  g.add(rug);
  if (kind === 'bed') {
    box(1.6, 0.35, 2.0, P[5], w * 0.45, 0, 1.2);
    box(1.6, 0.22, 1.6, P[4], w * 0.45, 0.35, 1.4);
    box(1.6, 0.6, 0.12, P[1], w * 0.45, 0, 0.2);
    box(0.45, 0.45, 0.4, P[0], w * 0.45 + 1.1, 0, 0.4);
    cyl(0.12, 0.3, P[2], w * 0.45 + 1.1, 0.45, 0.4);
  } else if (kind === 'kitchen') {
    box(w * 0.9, 0.9, 0.6, P[5], w * 0.5, 0, 0.35);
    box(w * 0.9, 0.04, 0.62, P[4], w * 0.5, 0.9, 0.35);
    box(1.2, 0.9, 0.7, P[0], w * 0.5, 0, d * 0.6);
    cyl(0.18, 0.65, P[1], w * 0.5 - 0.4, 0, d * 0.6 + 0.6);
    cyl(0.18, 0.65, P[1], w * 0.5 + 0.4, 0, d * 0.6 + 0.6);
  } else if (kind === 'dining') {
    box(1.6, 0.06, 0.9, P[5], w * 0.5, 0.72, d * 0.5);
    for (const [a, b] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) box(0.06, 0.72, 0.06, P[5], w * 0.5 + a, 0, d * 0.5 + b);
    for (const a of [-0.5, 0.5]) {
      box(0.42, 0.45, 0.42, P[0], w * 0.5 + a, 0, d * 0.5 - 0.8);
      box(0.42, 0.45, 0.42, P[0], w * 0.5 + a, 0, d * 0.5 + 0.8);
    }
  } else if (kind === 'bath') {
    box(0.7, 0.55, 1.6, '#FFFFFF', 0.45, 0, d * 0.5);
    box(0.6, 0.8, 0.45, P[5], w - 0.45, 0, 0.3);
    box(0.5, 0.02, 0.8, P[3], w * 0.55, 0, d * 0.55);
  } else if (kind === 'desk') {
    box(1.2, 0.04, 0.6, P[5], w * 0.5, 0.72, 0.4);
    box(0.05, 0.72, 0.55, P[5], w * 0.5 - 0.55, 0, 0.4);
    box(0.05, 0.72, 0.55, P[5], w * 0.5 + 0.55, 0, 0.4);
    box(0.48, 0.48, 0.48, P[1], w * 0.5, 0, 1.1);
    cyl(0.03, 0.4, P[2], w * 0.5 + 0.4, 0.76, 0.3);
  } else {
    box(2.1, 0.42, 0.9, P[1], w * 0.5, 0, 0.6);
    box(2.1, 0.45, 0.2, P[1], w * 0.5, 0.42, 0.2);
    box(0.2, 0.62, 0.9, P[1], w * 0.5 - 1.05, 0, 0.6);
    box(0.2, 0.62, 0.9, P[1], w * 0.5 + 1.05, 0, 0.6);
    box(1, 0.38, 0.6, P[5], w * 0.5, 0, d * 0.58);
    box(0.8, 0.5, 0.8, P[2], w * 0.5 + 1.6, 0, d * 0.6);
    cyl(0.02, 1.5, P[5], 0.45, 0, 0.45);
    cyl(0.2, 0.25, P[2], 0.45, 1.5, 0.45);
  }
}

/* ---------- 3D snapshots: one offscreen renderer makes every cover ---------- */
let shotR: THREE.WebGLRenderer | null = null;
const SHOTS = new Map<string, HTMLCanvasElement>();

function shotRenderer(W: number, H: number) {
  if (!shotR) {
    shotR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    shotR.outputColorSpace = THREE.SRGBColorSpace;
    shotR.toneMapping = THREE.ACESFilmicToneMapping;
    shotR.toneMappingExposure = 0.92;
    shotR.shadowMap.enabled = true;
    shotR.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  shotR.setPixelRatio(1);
  shotR.setSize(W, H, false);
  return shotR;
}

function grabShot(r: THREE.WebGLRenderer, W: number, H: number) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.drawImage(r.domElement, 0, 0);
  return c;
}

/** Cover kinds the prototype cycles through for project cards. */
export const COVER_KIND = ['sofa', 'bed', 'sofa', 'dining', 'bed', 'sofa'];

/** A corner-of-the-room render in a palette (the project card covers). Cached. */
export function roomShot(palette: string[], kind: string, W: number, H: number): HTMLCanvasElement {
  const P = pal6(palette);
  const key = ['room', P.join(''), kind, W, H].join('|');
  const hit = SHOTS.get(key);
  if (hit) return hit;
  const r = shotRenderer(W, H);
  const light = lightest(P);
  const scene = new THREE.Scene();
  scene.background = lc(light);
  const g = new THREE.Group();
  scene.add(g);
  const mat = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: lc(c), roughness: 0.82 });
  const w = 4.2;
  const d = 3.6;
  const h = 2.8;
  const add = (m: THREE.Mesh, x: number, y: number, z: number, cast?: boolean) => {
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = !!cast;
    g.add(m);
    return m;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.06, d + 3), mat('#B88A5F')), w / 2 + 1, -0.03, d / 2 + 1);
  add(new THREE.Mesh(new THREE.BoxGeometry(w + 3, h, 0.1), mat(lc(P[0]).lerp(lc(light), 0.35))), w / 2 + 1, h / 2, -0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d + 3), mat(light)), -0.05, h / 2, d / 2 + 1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.04), mat(P[5])), w * 0.62, 1.85, 0.02);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.05), mat(P[3])), w * 0.62, 1.85, 0.03);
  const win = add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshBasicMaterial({ color: lc('#FFF6E2') })), 0.01, 1.6, d * 0.62);
  win.rotation.y = Math.PI / 2;
  furnish(g, kind, 0, 0, w, d, P, mat);
  scene.add(new THREE.HemisphereLight(lc(0xfff4e6), lc(0x8a7462), 0.5 * LI));
  const sun = new THREE.DirectionalLight(lc(0xffe7c8), 1.15 * LI);
  sun.position.set(-3, 4.5, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 50);
  const wide = W / H > 1;
  cam.position.set(w * (wide ? 0.95 : 0.86), 1.5, d * (wide ? 1.45 : 1.62));
  cam.lookAt(w * 0.42, 0.95, d * 0.25);
  r.render(scene, cam);
  const out = grabShot(r, W, H);
  disposeTree(scene);
  sun.shadow.map?.dispose();
  SHOTS.set(key, out);
  return out;
}

export { shade };

/** One room on the 3D floor plan: name, plan position and size (metres), furniture kind. */
export interface PlanShotRoom {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  kind: string;
  /** Walls left out because the room opens onto its neighbour. */
  open?: string[];
}

const SHOT_KINDS: Record<string, string> = { bedroom: 'bed', kitchen: 'kitchen', dining: 'dining', bathroom: 'bath', office: 'desk', living: 'sofa' };

/** The furniture set for a room: none for plan-only rooms, else from its kind, else guessed from its name. */
export function shotKind(room: { name: string; kind?: string | null; furnish?: boolean }): string {
  if (room.furnish === false) return 'empty';
  return (room.kind && SHOT_KINDS[room.kind]) || roomKind(room.name);
}

/** The furniture set for a room, from its name (the prototype's PLANS kinds). */
export function roomKind(name: string): string {
  const n = name.toLowerCase();
  if (/bed|sleep|guest|nursery|kid/.test(n)) return 'bed';
  if (/kitchen/.test(n)) return 'kitchen';
  if (/dining/.test(n)) return 'dining';
  if (/bath|shower|toilet|wc|powder|laundry/.test(n)) return 'bath';
  if (/office|study|desk|work/.test(n)) return 'desk';
  return 'sofa';
}

/**
 * The prototype's planShot(): the whole floor plan as an isometric clay model (each room's floor in
 * a light tint of the palette, low white walls with a door gap, the room's furniture set), with a
 * label pill over each room. Cached by palette, rooms and size.
 */
/**
 * The isometric camera over the whole plan. `turn` (0–3) walks it round the plan in quarter turns.
 * Shared by planShot and planShotMap so the picture and its click map line up.
 */
function planCamera(R: PlanShotRoom[], W: number, H: number, turn: number) {
  const minX = Math.min(...R.map((p) => p.x));
  const minZ = Math.min(...R.map((p) => p.z));
  const maxX = Math.max(...R.map((p) => p.x + p.w));
  const maxZ = Math.max(...R.map((p) => p.z + p.d));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const a = W / H;
  const v = span * 0.6;
  const cam = new THREE.OrthographicCamera(-v * a, v * a, v, -v, 0.1, 100);
  const ang = Math.PI / 4 + (((turn % 4) + 4) % 4) * (Math.PI / 2);
  const el = 0.8;
  cam.position.set(Math.sin(ang) * Math.cos(el) * 30, Math.sin(el) * 30, Math.cos(ang) * Math.cos(el) * 30);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return { cam, cx, cz, span };
}

/** Where each room lands in a planShot picture (pixels): its floor outline and its centre, for clicks and labels. */
export function planShotMap(R: PlanShotRoom[], W: number, H: number, turn = 0): { floor: [number, number][]; centre: [number, number] }[] {
  if (!R.length) return [];
  const { cam, cx, cz } = planCamera(R, W, H, turn);
  const px = (x: number, z: number): [number, number] => {
    const p = new THREE.Vector3(x - cx, 0.03, z - cz).project(cam);
    return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
  };
  return R.map(({ x, z, w, d }) => ({ floor: [px(x, z), px(x + w, z), px(x + w, z + d), px(x, z + d)], centre: px(x + w / 2, z + d / 2) }));
}

export function planShot(R: PlanShotRoom[], palette: string[], W: number, H: number, turn = 0, labels = true): HTMLCanvasElement {
  const P = pal6(palette);
  const key = ['plan', P.join(''), R.map((r) => [r.name, r.x, r.z, r.w, r.d, r.kind, (r.open ?? []).join('+')].join(':')).join(','), W, H, turn, labels].join('|');
  const hit = SHOTS.get(key);
  if (hit) return hit;
  const r = shotRenderer(W, H);
  const scene = new THREE.Scene();
  scene.background = lc('#F7F5F2');
  const g = new THREE.Group();
  scene.add(g);
  const mat = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: lc(c), roughness: 0.85 });
  const minX = Math.min(...R.map((p) => p.x));
  const minZ = Math.min(...R.map((p) => p.z));
  const maxX = Math.max(...R.map((p) => p.x + p.w));
  const maxZ = Math.max(...R.map((p) => p.z + p.d));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ);
  g.position.set(-cx, 0, -cz);
  const wallM = mat('#FBF8F3');
  const WH = 1.15;
  const TH = 0.1;
  R.forEach(({ x, z, w, d, kind, open = [] }, i) => {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat(lc(P[i % 6]).lerp(lc('#fff'), 0.35)));
    fl.position.set(x + w / 2, -0.03, z + d / 2);
    fl.receiveShadow = true;
    g.add(fl);
    const add = (gx: number, gz: number, gw: number, gd: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, WH, gd), wallM);
      m.position.set(gx, WH / 2, gz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    const door = Math.min(0.9, w * 0.5);
    if (!open.includes('back')) add(x + w / 2, z, w, TH);
    if (!open.includes('left')) add(x, z + d / 2, TH, d);
    if (!open.includes('front')) {
      add(x + w - (w - door) / 4, z + d, (w - door) / 2, TH);
      add(x + (w - door) / 4, z + d, (w - door) / 2, TH);
    }
    if (!open.includes('right')) add(x + w, z + d / 2, TH, d);
    if (kind !== 'empty' && w >= 2.4 && d >= 2.4) furnish(g, kind, x, z, w, d, P, mat);
  });
  scene.add(new THREE.HemisphereLight(lc(0xffffff), lc(0xbfb4a8), 0.75 * LI));
  const sun = new THREE.DirectionalLight(lc(0xfff0dc), 0.85 * LI);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  const sh = Math.max(12, span);
  Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh });
  scene.add(sun);
  const { cam } = planCamera(R, W, H, turn);
  r.render(scene, cam);
  const out = grabShot(r, W, H);
  // room labels: a white pill over each room's centre
  const c2 = out.getContext('2d')!;
  const sc = W / 520;
  if (!labels) R = [];
  c2.font = `600 ${Math.round(12 * sc)}px Inter, system-ui, sans-serif`;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  for (const rm of R) {
    const p = new THREE.Vector3(rm.x + rm.w / 2 - cx, 0.1, rm.z + rm.d / 2 - cz).project(cam);
    const x = ((p.x + 1) / 2) * W;
    const y = ((1 - p.y) / 2) * H;
    const tw = c2.measureText(rm.name).width + 18 * sc;
    const th = 22 * sc;
    c2.fillStyle = 'rgba(255,255,255,.94)';
    c2.strokeStyle = '#E6E6E6';
    c2.lineWidth = 1;
    c2.beginPath();
    if (c2.roundRect) c2.roundRect(x - tw / 2, y - th / 2, tw, th, th / 2);
    else c2.rect(x - tw / 2, y - th / 2, tw, th);
    c2.fill();
    c2.stroke();
    c2.fillStyle = '#1E1E1E';
    c2.fillText(rm.name, x, y + 0.5);
  }
  disposeTree(scene);
  sun.shadow.map?.dispose();
  SHOTS.set(key, out);
  return out;
}
