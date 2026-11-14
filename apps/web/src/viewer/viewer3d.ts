/**
 * The live 360° room viewer (prototype `viewerFor` / `mountViewers`): a dollhouse room you orbit
 * with a drag, zoom with the wheel, that spins by itself until touched. Walls between the camera and
 * the room hide (cutaway). The room comes from the floor plan (width × depth, wall height, windows,
 * doors); each layout object is drawn where the layout engine put it, as the real product model
 * when it has one, else as a procedural clay piece in the palette.
 *
 * It can also show a finished Blender render's room (`room.glb`) in the same orbit: `setRender()`
 * loads it, `setMode('render' | 'live')` picks which room is on screen. Both share the prototype's soft,
 * bright light rig (see LOOK and `rig()`).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FloorPlan, Layout, PlacedObject } from '../api/types';
import { ModelCache, loadRenderModel } from './models';
import { clayPiece, pieceColour, pieceKind, stretchTo } from './pieces';
import { LI, disposeTree, lc, lightest, pal6, reduceMotion } from './three-kit';

type Wall = 'back' | 'front' | 'left' | 'right';
export type ViewKey = 'auto' | 'iso' | 'top' | 'reset';
export type ViewMode = 'live' | 'render';
/** A finished render job's room model: the job id (cache key) and its API path (`modelUrl`). */
export interface RenderModel {
  jobId: string;
  path: string;
}

export interface ViewerScene {
  roomId: string;
  plan: Pick<FloorPlan, 'width' | 'depth'> & Partial<FloorPlan>;
  layout: Layout | null;
  palette: string[];
}

export interface Viewer {
  build(s: ViewerScene): void;
  /** Load (or drop, with null) the render's room; resolves once it is ready to show. */
  setRender(r: RenderModel | null): Promise<void>;
  setMode(m: ViewMode): void;
  view(k: ViewKey): void;
  dispose(): void;
}

/** One room the viewer can show: its content, the walls the cutaway may hide, and how to frame it. */
interface Stage {
  group: THREE.Group;
  /** wall groups, each with userData.n = its outward normal */
  walls: THREE.Object3D[];
  /** default camera distance */
  base: number;
  /** half-size of the shadow camera */
  half: number;
}

const FLOORS: Record<string, string> = {
  wood: '#B88A5F', oak: '#B88A5F', parquet: '#A87A50', tile: '#D9D2C7', stone: '#C9C2B6', concrete: '#A9A49C',
  carpet: '#C8B9A6', vinyl: '#BFA585', laminate: '#B88A5F',
};
const DOOR_H = 2.05;

/**
 * The prototype's viewer look (viewerFor in saas-ui/hey-jenna-app.html), for both rooms:
 * - background: the frame's pale #F3F0EB (as .viewer in CSS, so the canvas edge disappears);
 * - key: its warm sun from the front left, (-4, 6, 5), #FFE7C8 at 1.05;
 * - fill: hemisphere #FFF4E6 / #8A7462 at 0.6;
 * - ACES Filmic at exposure 0.95.
 * Colours and intensities are the r128 ones, read the way r128 did (see three-kit `lc` / `LI`).
 * The render's room is PBR-textured (no r128 colour boost), so it also gets a soft RoomEnvironment
 * bounce (`envRender`) to read as bright and airy as the clay room; the live room gets none, as in the prototype.
 */
const LOOK = {
  background: new THREE.Color('#F3F0EB'),
  exposure: 0.95,
  key: { dir: new THREE.Vector3(-4, 6, 5).normalize(), colour: lc(0xffe7c8), intensity: 1.05 * LI },
  fill: { sky: lc(0xfff4e6), ground: lc(0x8a7462), intensity: 0.6 * LI },
  envLive: 0,
  envRender: 0.7,
};

/** The prototype's light wall and floor tones, which the render's dark shell is lightened toward. */
const LIGHT_WALL = lc('#F6F0E4');
const LIGHT_FLOOR = lc('#B88A5F');

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
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement;
  cv.className = 'vcanvas';
  host.prepend(cv);

  const V = { az: 0.75, el: 0.5, dist: 8, taz: 0.75, tel: 0.5, tdist: 8, base: 8, auto: true };
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  pmrem.dispose();
  roomEnv.dispose();
  const sun = rig(scene, envTex);

  let live: Stage | null = null;
  let rendered: Stage | null = null;
  let renderJob = '';
  let renderLoad: Promise<void> = Promise.resolve();
  let mode: ViewMode = 'live';
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
    const st = active();
    if (!w || !h || !st) return;
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
    for (const wl of st.walls) wl.visible = V.el > 1.2 || (wl.userData.n as THREE.Vector3).dot(dir) < 0.25;
    renderer.render(scene, cam);
  };
  loop();

  /** The room on screen: the render when asked for and loaded, else the live room. */
  function active(): Stage | null {
    return mode === 'render' && rendered ? rendered : live;
  }

  /** Show the active stage, hide the other, and fit the camera and shadows to it (keeping the angle). */
  function frame(reset = false) {
    const st = active();
    if (live) live.group.visible = st === live;
    if (rendered) rendered.group.visible = st === rendered;
    scene.environmentIntensity = st && st === rendered ? LOOK.envRender : LOOK.envLive;
    if (!st) return;
    Object.assign(sun.shadow.camera, { left: -st.half, right: st.half, top: st.half, bottom: -st.half, near: 0.5, far: 40 });
    sun.shadow.camera.updateProjectionMatrix();
    if (reset) {
      V.dist = V.tdist = st.base;
      V.az = V.taz = 0.75;
      V.el = V.tel = 0.5;
      setAuto(true);
    } else if (st.base !== V.base) {
      V.tdist *= st.base / V.base;
    }
    V.base = st.base;
  }

  function clearLive() {
    if (!live) return;
    scene.remove(live.group);
    // procedural meshes are ours to free; product models share the cache's geometry
    live.group.traverse((o) => {
      if (o.userData.owned) disposeTree(o);
    });
    live = null;
  }

  function clearRendered() {
    if (!rendered) return;
    scene.remove(rendered.group);
    disposeTree(rendered.group);
    rendered = null;
  }

  function setRender(r: RenderModel | null): Promise<void> {
    if ((r?.jobId ?? '') === renderJob) return renderLoad;
    renderJob = r?.jobId ?? '';
    clearRendered();
    frame();
    if (!r) return (renderLoad = Promise.resolve());
    const job = r.jobId;
    renderLoad = loadRenderModel(r.jobId, r.path).then((root) => {
      if (job !== renderJob || disposed) {
        disposeTree(root);
        return;
      }
      rendered = renderStage(root);
      scene.add(rendered.group);
      frame();
    });
    renderLoad.catch(() => {
      if (job === renderJob) renderJob = ''; // let the next setRender retry
    });
    return renderLoad;
  }

  function build({ roomId, plan, layout, palette }: ViewerScene) {
    gen++;
    const my = gen;
    clearLive();
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
    const root = new THREE.Group();
    root.add(g);
    const stage: Stage = { group: root, walls: [], base: Math.max(w, d) * 1.8 + 2.2, half: Math.max(w, d) / 2 + 1.5 };
    live = stage;
    scene.add(root);
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
    stage.walls = specs.map(([wall, len, n]) => {
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
        // walls take shadows but cast none, so the near walls never put the room in shade (bright and airy)
        mesh.receiveShadow = true;
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

    // furniture: the layout also lists the room shell (floor, walls) and planning zones, which this viewer
    // already builds from the floor plan or which aren't physical, so skip them
    const SHELL = new Set(['floor', 'wall', 'ceiling', 'zone', 'window', 'door', 'opening']);
    for (const o of layout?.objects ?? []) if (!SHELL.has(o.type)) placeObject(g, o, P, H, my);

    // light and camera for this room size (a new room starts from the default view)
    const key = `${roomId}|${w}|${d}`;
    const fresh = key !== roomKey;
    roomKey = key;
    frame(fresh && active() === live);
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

  let disposed = false;
  return {
    build,
    setRender,
    setMode(m) {
      if (m === mode) return;
      mode = m;
      frame();
    },
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
      disposed = true;
      cancelAnimationFrame(raf);
      gen++;
      renderJob = '';
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('wheel', onWheel);
      clearLive();
      clearRendered();
      models?.dispose();
      sun.dispose();
      envTex.dispose();
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

/** The shared light rig (see LOOK); returns the shadow-casting key. */
function rig(scene: THREE.Scene, env: THREE.Texture): THREE.DirectionalLight {
  scene.background = LOOK.background;
  scene.environment = env;
  scene.environmentIntensity = LOOK.envLive;
  scene.add(new THREE.HemisphereLight(LOOK.fill.sky, LOOK.fill.ground, LOOK.fill.intensity));
  const sun = new THREE.DirectionalLight(LOOK.key.colour, LOOK.key.intensity);
  sun.position.copy(LOOK.key.dir).multiplyScalar(14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  return sun;
}

const WHITE = new THREE.Color(1, 1, 1);
const CONCRETE = '#BCB4A8';

/**
 * The render's shell (`architecture.*`) comes in the palette's dark wall colours, so the room reads
 * dark beside the prototype's light clay room. Lighten each shell material toward the prototype's
 * light wall (or floor) tone, keeping a light tint of the original so the palette still shows.
 * Materials are cloned: GLTFLoader shares them with furniture that uses the same colour.
 */
function lightenShell(m: THREE.Material, floor: boolean): THREE.Material {
  const std = m as THREE.MeshStandardMaterial;
  if (!std.color) return m;
  const c = std.color;
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; // linear
  const target = floor ? LIGHT_FLOOR : LIGHT_WALL;
  // already light: a touch toward the tone; dark: most of the way, so only a tint of it is left
  const t = lum > 0.55 ? 0.25 : floor ? 0.6 : 0.82;
  const out = std.clone();
  out.color.copy(c).lerp(target, t);
  if (std.map) out.color.lerp(WHITE, 0.3); // a texture keeps its pattern; lift what multiplies it
  return out;
}

const WALL_N: Record<string, THREE.Vector3> = {
  back: new THREE.Vector3(0, 0, -1),
  front: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
};

/**
 * Stage a render's room.glb. Blender is Z-up, but the glTF exporter writes Y-up (Blender (x, y, z) →
 * glTF (x, z, -y)), and render_layout.py builds in three.js coordinates through T(), so the file comes
 * back in the live viewer's frame: Y up, back wall at -z, left wall at -x, room centred on the origin.
 * To be safe it is still re-centred on its floor (x/z) and dropped so the floor's top is at y = 0.
 * Objects are named `<layer>.<zone>.<thing>` (GLTFLoader keeps the original in userData.name):
 * `architecture.<side>.wall*` become cutaway walls, the shell only receives shadows and is lightened
 * toward the prototype's light walls and floor (`lightenShell`).
 */
function renderStage(model: THREE.Group): Stage {
  const walls: THREE.Object3D[] = [];
  let floor: THREE.Box3 | null = null;
  model.updateMatrixWorld(true);
  for (const top of model.children) {
    const name = String(top.userData.name ?? top.name);
    const wall = /^architecture\.(back|front|left|right)\.wall/.exec(name);
    const shell = name.startsWith('architecture.');
    if (wall) {
      top.userData.n = WALL_N[wall[1]];
      walls.push(top);
    }
    const isFloor = /^architecture\.[^.]+\.floor/.test(name);
    if (isFloor) floor = (floor ?? new THREE.Box3()).union(new THREE.Box3().setFromObject(top));
    top.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !shell;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // the exporter can't carry Blender's procedural concrete (noise + voronoi into Base Color), so the
      // floor arrives plain white: give it the concrete's mid tone (between its #ADA498 and #CBC3B7 ramp)
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.name === 'concrete' && !std.map && std.color?.equals(WHITE)) std.color.set(CONCRETE);
      }
      if (shell) mesh.material = Array.isArray(mesh.material) ? mats.map((m) => lightenShell(m, isFloor)) : lightenShell(mats[0], isFloor);
    });
  }
  const box = floor ?? new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -(floor ? box.max.y : box.min.y), -c.z);
  const size = box.getSize(new THREE.Vector3());
  const group = new THREE.Group();
  group.add(model);
  const m = Math.max(size.x, size.z, 1);
  return { group, walls, base: m * 1.8 + 2.2, half: m / 2 + 1.5 };
}
