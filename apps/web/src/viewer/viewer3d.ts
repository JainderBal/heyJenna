/**
 * The live 360° room viewer (prototype `viewerFor` / `mountViewers`): a dollhouse room you orbit
 * with a drag, zoom with the wheel, that spins by itself until touched. Walls between the camera and
 * the room hide (cutaway). The room comes from the floor plan (width × depth, wall height, windows,
 * doors); each layout object is drawn where the layout engine put it, as the real product model
 * when it has one, else as a procedural clay piece in the palette.
 */
import * as THREE from 'three';
import type { FloorPlan, Layout, PlacedObject } from '../api/types';
import { ModelCache } from './models';
import { clayPiece, pieceColour, pieceKind, stretchTo } from './pieces';
import { LI, disposeTree, lc, lightest, pal6, reduceMotion } from './three-kit';

type Wall = 'back' | 'front' | 'left' | 'right';
export type ViewKey = 'auto' | 'iso' | 'top' | 'reset';

export interface ViewerScene {
  roomId: string;
  plan: Pick<FloorPlan, 'width' | 'depth'> & Partial<FloorPlan>;
  layout: Layout | null;
  palette: string[];
}

export interface Viewer {
  build(s: ViewerScene): void;
  view(k: ViewKey): void;
  dispose(): void;
}

const FLOORS: Record<string, string> = {
  wood: '#B88A5F', oak: '#B88A5F', parquet: '#A87A50', tile: '#D9D2C7', stone: '#C9C2B6', concrete: '#A9A49C',
  carpet: '#C8B9A6', vinyl: '#BFA585', laminate: '#B88A5F',
};
const DOOR_H = 2.05;

export function createViewer(host: HTMLElement, onAuto: (on: boolean) => void): Viewer | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement;
  cv.className = 'vcanvas';
  host.prepend(cv);

  const V = { az: 0.75, el: 0.5, dist: 8, taz: 0.75, tel: 0.5, tdist: 8, base: 8, auto: true };
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#F3F0EB');
  scene.add(new THREE.HemisphereLight(lc(0xfff4e6), lc(0x8a7462), 0.6 * LI));
  const sun = new THREE.DirectionalLight(lc(0xffe7c8), 1.05 * LI);
  sun.position.set(-4, 6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  scene.add(sun);

  let content: THREE.Group | null = null;
  let walls: THREE.Group[] = [];
  let roomKey = '';
  let gen = 0;
  let models: ModelCache | null = null;
  let modelsRoom = '';
  const setAuto = (on: boolean) => {
    V.auto = on;
    onAuto(on);
  };

  // orbit: drag to turn, wheel to zoom
  let drag: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    drag = { x: e.clientX, y: e.clientY };
    setAuto(false);
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    cv.classList.add('grab');
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    V.taz -= (e.clientX - drag.x) * 0.01;
    V.tel = Math.max(0.08, Math.min(1.45, V.tel + (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    drag = null;
    cv.classList.remove('grab');
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    V.tdist = Math.max(V.base * 0.45, Math.min(V.base * 1.7, V.tdist * Math.exp(e.deltaY * 0.0015)));
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });

  const dir = new THREE.Vector3();
  let raf = 0;
  const reduce = reduceMotion();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h || !content) return;
    const pr = renderer.getPixelRatio();
    if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    if (V.auto && !reduce) V.taz += 0.0035;
    V.az += (V.taz - V.az) * 0.12;
    V.el += (V.tel - V.el) * 0.12;
    V.dist += (V.tdist - V.dist) * 0.12;
    const ce = Math.cos(V.el);
    cam.position.set(Math.sin(V.az) * ce * V.dist, 1 + Math.sin(V.el) * V.dist, Math.cos(V.az) * ce * V.dist);
    cam.lookAt(0, 0.75, 0);
    // dollhouse cutaway: hide the walls between the camera and the room
    dir.set(cam.position.x, 0, cam.position.z).normalize();
    for (const wl of walls) wl.visible = V.el > 1.2 || (wl.userData.n as THREE.Vector3).dot(dir) < 0.25;
    renderer.render(scene, cam);
  };
  loop();

  function clearContent() {
    if (!content) return;
    scene.remove(content);
    // procedural meshes are ours to free; product models share the cache's geometry
    content.traverse((o) => {
      if (o.userData.owned) disposeTree(o);
    });
    content = null;
    walls = [];
  }

  function build({ roomId, plan, layout, palette }: ViewerScene) {
    gen++;
    const my = gen;
    clearContent();
    if (modelsRoom !== roomId) {
      models?.dispose();
      models = new ModelCache(roomId);
      modelsRoom = roomId;
    }
    const P = pal6(palette);
    const light = lightest(P);
    const w = plan.width;
    const d = plan.depth;
    const H = plan.wallHeight ?? 2.6;
    const TH = 0.1;
    const g = new THREE.Group();
    g.position.set(-w / 2, 0, -d / 2);
    content = g;
    scene.add(g);
    const mat = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: lc(c), roughness: 0.82 });

    // floor
    const shell = new THREE.Group();
    shell.userData.owned = true;
    g.add(shell);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w + TH * 2, 0.08, d + TH * 2), mat(FLOORS[(plan.floor ?? 'wood').toLowerCase()] ?? '#B88A5F'));
    fl.position.set(w / 2, -0.04, d / 2);
    fl.receiveShadow = true;
    shell.add(fl);

    // walls, cut around windows and doors
    const finish = (wall: Wall) => plan.walls?.[wall]?.colour;
    const backC = lc(P[0]).lerp(lc(light), 0.4);
    const glassM = new THREE.MeshBasicMaterial({ color: lc('#FFF6E2'), side: THREE.DoubleSide });
    const specs: [Wall, number, THREE.Vector3][] = [
      ['back', w + TH * 2, new THREE.Vector3(0, 0, -1)],
      ['front', w + TH * 2, new THREE.Vector3(0, 0, 1)],
      ['left', d, new THREE.Vector3(-1, 0, 0)],
      ['right', d, new THREE.Vector3(1, 0, 0)],
    ];
    walls = specs.map(([wall, len, n]) => {
      const wg = new THREE.Group();
      wg.userData.n = n;
      wg.userData.owned = true;
      const fc = finish(wall);
      const m = mat(fc && /^#[0-9a-f]{6}$/i.test(fc) ? fc : wall === 'back' ? backC : light);
      // u runs along the wall in plan metres (back/front: from the left wall; left/right: from the back wall)
      const along = wall === 'back' || wall === 'front';
      const u0 = along ? -TH : 0;
      const holes = [
        ...(plan.windows ?? []).filter((o) => o.wall === wall).map((o) => ({ c: o.position, half: o.width / 2, lo: Math.min(o.sill ?? 0.8, H - 0.2), hi: Math.min(o.head ?? 2.1, H - 0.05), glass: true })),
        ...(plan.doors ?? []).filter((o) => o.wall === wall).map((o) => ({ c: o.position, half: o.width / 2, lo: 0, hi: Math.min(DOOR_H, H - 0.1), glass: false })),
      ]
        .map((o) => ({ ...o, a: Math.max(0, o.c - o.half), b: Math.min(along ? w : d, o.c + o.half) }))
        .filter((o) => o.b - o.a > 0.05)
        .sort((x, y) => x.a - y.a);
      const piece = (a: number, b: number, lo: number, hi: number) => {
        if (b - a < 0.005 || hi - lo < 0.005) return;
        const mesh = new THREE.Mesh(along ? new THREE.BoxGeometry(b - a, hi - lo, TH) : new THREE.BoxGeometry(TH, hi - lo, b - a), m);
        const mid = (a + b) / 2;
        const off = wall === 'back' || wall === 'left' ? -TH / 2 : (along ? d : w) + TH / 2;
        if (along) mesh.position.set(mid, (lo + hi) / 2, off);
        else mesh.position.set(off, (lo + hi) / 2, mid);
        mesh.castShadow = mesh.receiveShadow = true;
        wg.add(mesh);
      };
      let u = u0;
      for (const o of holes) {
        const a = Math.max(o.a, u);
        piece(u, a, 0, H);
        piece(a, o.b, 0, o.lo);
        piece(a, o.b, o.hi, H);
        if (o.glass && o.hi > o.lo) {
          const gl = new THREE.Mesh(new THREE.PlaneGeometry(o.b - a, o.hi - o.lo), glassM);
          const mid = (a + o.b) / 2;
          const off = wall === 'back' || wall === 'left' ? -TH / 2 : (along ? d : w) + TH / 2;
          if (along) gl.position.set(mid, (o.lo + o.hi) / 2, off);
          else {
            gl.position.set(off, (o.lo + o.hi) / 2, mid);
            gl.rotation.y = Math.PI / 2;
          }
          wg.add(gl);
        }
        u = Math.max(u, o.b);
      }
      piece(u, len + u0, 0, H);
      g.add(wg);
      return wg;
    });

    // furniture
    for (const o of layout?.objects ?? []) placeObject(g, o, P, H, my);

    // light and camera for this room size
    const half = Math.max(w, d) / 2 + 1.5;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    const key = `${roomId}|${w}|${d}`;
    if (key !== roomKey) {
      roomKey = key;
      V.base = Math.max(w, d) * 1.8 + 2.2;
      V.dist = V.tdist = V.base;
      V.az = V.taz = 0.75;
      V.el = V.tel = 0.5;
      setAuto(true);
    }
  }

  function placeObject(g: THREE.Group, o: PlacedObject, P: string[], H: number, my: number) {
    const kind = pieceKind(o.type, o.name);
    const { w, d, h } = o.size;
    const mount = o.mount ?? 'floor';
    const base = mount === 'wall' ? (o.position.z ?? 1.45) - h / 2 : o.position.z ?? 0;
    const slot = new THREE.Group();
    slot.position.set(o.position.x, Math.max(0, base), o.position.y);
    slot.rotation.y = THREE.MathUtils.degToRad(o.rotation_deg ?? 0);
    g.add(slot);
    const clay = clayPiece(kind, w, h, d, pieceColour(kind, P, o.colour), P);
    clay.userData.owned = true;
    slot.add(clay);
    if (mount === 'ceiling' || kind === 'pendant') {
      const top = base + h;
      if (H - top > 0.02) {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, H - top, 8), new THREE.MeshStandardMaterial({ color: lc('#2A2622'), roughness: 0.82 }));
        cord.position.y = h + (H - top) / 2;
        cord.userData.owned = true;
        slot.add(cord);
      }
    }
    const listingId = o.product?.listingId;
    if (!listingId || !o.product?.modelUrl || !models) return;
    models
      .get(listingId)
      .then((model) => {
        if (my !== gen || !slot.parent) return;
        const fitted = fitModel(model, w, h, d, mount === 'wall');
        slot.remove(clay);
        disposeTree(clay);
        slot.add(fitted);
      })
      .catch(() => {
        /* keep the clay piece */
      });
  }

  return {
    build,
    view(k) {
      if (k === 'auto') setAuto(!V.auto);
      if (k === 'top') {
        V.tel = 1.38;
        setAuto(false);
      }
      if (k === 'iso') {
        V.tel = 0.5;
        V.taz = Math.round(V.taz / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
        setAuto(false);
      }
      if (k === 'reset') {
        V.tel = 0.5;
        V.taz = 0.75;
        V.tdist = V.base;
        setAuto(true);
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      gen++;
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('wheel', onWheel);
      clearContent();
      models?.dispose();
      sun.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
    },
  };
}

/**
 * Fit a product model to the object's footprint: one uniform scale so it fits w × d (wall pieces:
 * w × h), centred on the spot and sat on the floor (or its mount height).
 */
function fitModel(model: THREE.Object3D, w: number, h: number, d: number, wall: boolean): THREE.Group {
  const b = new THREE.Box3().setFromObject(model);
  const s = b.getSize(new THREE.Vector3());
  const k = wall
    ? Math.min(s.x > 1e-4 ? w / s.x : Infinity, s.y > 1e-4 ? h / s.y : Infinity)
    : Math.min(s.x > 1e-4 ? w / s.x : Infinity, s.z > 1e-4 ? d / s.z : Infinity);
  const sc = Number.isFinite(k) && k > 0 ? k : 1;
  const out = stretchTo(model, s.x * sc, s.y * sc, s.z * sc);
  if (wall) out.position.z = -d / 2 + (s.z * sc) / 2; // flush with the wall behind it
  return out;
}
