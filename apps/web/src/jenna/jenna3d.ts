/** The jenna cube scene (prototype `jenna3d` / `mountJenna`), framework-free. */
import * as THREE from 'three';
import { LI, lc, reduceMotion, roundBox, studioEnv, terrazzo } from '../viewer/three-kit';

export interface JennaHandle {
  play(name: string): void;
  /** True when the last press was a drag (> 6 px), not a tap. */
  wasDrag(): boolean;
  dispose(): void;
}

interface Pose {
  y: number;
  sx: number;
  sy: number;
  spin?: number;
  roll?: number;
}
interface Action {
  d: number;
  f(t: number): Pose;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function actions(studio: boolean): Record<string, Action> {
  // studio jenna lands with a squash; the home one is the simpler hop
  const hop = (t: number): Pose => {
    if (t < 0.18) {
      const k = t / 0.18;
      return { y: 0, sx: 1 + 0.14 * k, sy: 1 - 0.18 * k };
    }
    const u = (t - 0.18) / 0.82;
    if (!studio) return { y: Math.sin(Math.PI * u) * 0.5, sx: 1 - 0.06 * Math.sin(Math.PI * u), sy: 1 + 0.1 * Math.sin(Math.PI * u) };
    const land = u > 0.85 ? (u - 0.85) / 0.15 : 0;
    return {
      y: Math.sin(Math.PI * u) * 0.55,
      sx: 1 - 0.06 * Math.sin(Math.PI * u) + 0.1 * Math.sin(Math.PI * land),
      sy: 1 + 0.1 * Math.sin(Math.PI * u) - 0.12 * Math.sin(Math.PI * land),
    };
  };
  return {
    hop: { d: 0.95, f: hop },
    flip: {
      d: 1.25,
      f(t) {
        const r = hop(Math.min(1, t * 1.05));
        r.y *= studio ? 1.35 : 1.3;
        r.spin = ease(Math.min(1, Math.max(0, (t - 0.15) / 0.7))) * Math.PI * 2;
        return r;
      },
    },
    turn: { d: 1.6, f: (t) => ({ y: Math.sin(Math.PI * t) * 0.06, sx: 1, sy: 1, spin: ease(t) * Math.PI * 2 }) },
    wiggle: { d: 0.7, f: (t) => ({ y: 0, sx: 1, sy: 1, roll: Math.sin(t * Math.PI * 4) * 0.18 * (1 - t) }) },
  };
}

export function createJenna(host: HTMLElement, W: number, H: number, studio: boolean): JennaHandle {
  const noop: JennaHandle = { play() {}, wasDrag: () => false, dispose() {} };
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    host.textContent = 'jenna';
    return noop;
  }
  const cv = renderer.domElement;
  cv.style.width = '100%';
  cv.style.height = '100%';
  cv.style.display = 'block';
  host.appendChild(cv);
  const reduce = reduceMotion();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (studio) renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
  cam.position.set(0, 0.35, 5.2);
  cam.lookAt(0, 0.05, 0);
  scene.environment = studioEnv(renderer, studio);
  scene.add(new THREE.HemisphereLight(lc(0xfff6ec), lc(0x8a7a6e), 0.55 * LI));
  const key = new THREE.DirectionalLight(lc(0xfff1e2), (studio ? 1.25 : 1.2) * LI);
  key.position.set(-2.5, 3.5, 4);
  scene.add(key);
  if (studio) {
    const rim = new THREE.DirectionalLight(lc(0xdfe9ff), 0.6 * LI);
    rim.position.set(3, 1.5, -3);
    scene.add(rim);
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  const spin = new THREE.Group();
  scene.add(root);
  root.add(body);
  body.add(spin);
  const tex = terrazzo('#F4EEE7', undefined, studio);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (studio) tex.anisotropy = 8;
  const cubeMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: studio ? 0.9 : 1 });
  spin.add(new THREE.Mesh(roundBox(1.25, 1.25, 1.25, 0.36, 10), cubeMat));
  const face = new THREE.Group();
  face.position.z = 0.626;
  spin.add(face);
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: lc(0x050505), roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.25 });
  const eyeGeo = new THREE.SphereGeometry(0.5, studio ? 32 : 24, studio ? 24 : 18);
  const eyes = [-0.16, 0.16].map((x) => {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.scale.set(0.085, 0.19, 0.04);
    e.position.set(x, 0.03, 0);
    face.add(e);
    return e;
  });

  // contact shadow (studio only)
  let shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  if (studio) {
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sg = sc.getContext('2d')!;
    const gr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(60,40,30,.5)');
    gr.addColorStop(1, 'rgba(60,40,30,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 128, 128);
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace;
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.72;
    root.add(shadow);
  }

  // state
  const A = actions(studio);
  let act: Action | null = null;
  let actT = 0;
  let yaw = 0;
  let yawVel = 0;
  const look = { x: 0, y: 0 };
  const lt = { x: 0, y: 0 };
  let blink = 2;
  let idle = studio ? 4 : 3;
  let drag = false;
  let dx0 = 0;
  let moved = 0;
  let raf = 0;
  const play = (n: string) => {
    const a = A[n];
    if (!a) return;
    act = a;
    actT = 0;
  };

  const onMove = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    lt.x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 400));
    lt.y = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 400));
    if (drag) {
      const m = e.clientX - dx0;
      dx0 = e.clientX;
      moved += Math.abs(m);
      yawVel = m * 0.012;
      yaw += m * 0.02;
    }
  };
  const onDown = (e: PointerEvent) => {
    drag = true;
    dx0 = e.clientX;
    moved = 0;
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
  };
  const onUp = () => {
    if (!drag) return;
    drag = false;
    if (moved < 6) play('flip');
  };
  const onEnter = () => {
    if (!act) play('wiggle');
  };
  document.addEventListener('pointermove', onMove);
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerenter', onEnter);

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const p: Pose = { y: 0, sx: 1, sy: 1, spin: 0, roll: 0 };
    if (act) {
      actT += dt / act.d;
      Object.assign(p, act.f(Math.min(1, actT)));
      if (actT >= 1) act = null;
    } else if (!reduce) {
      idle -= dt;
      if (idle <= 0) {
        if (studio) play(Math.random() < 0.45 ? 'turn' : Math.random() < 0.6 ? 'hop' : 'wiggle');
        else play(['turn', 'hop', 'wiggle'][Math.floor(Math.random() * 3)]);
        idle = 5 + Math.random() * 5;
      }
    }
    if (!drag) {
      yaw += yawVel;
      yawVel *= 0.92;
      yaw *= 0.94;
    }
    look.x += (lt.x - look.x) * 0.12;
    look.y += (lt.y - look.y) * 0.12;
    root.position.y = p.y + (reduce ? 0 : Math.sin(t * 2.1) * 0.035);
    body.scale.set(p.sx, p.sy, p.sx);
    body.position.y = (p.sy - 1) * 0.62;
    const wob = studio && !reduce;
    spin.rotation.set(
      look.y * 0.22 + (wob ? Math.sin(t * 1.3) * 0.03 : 0),
      (p.spin ?? 0) + yaw + look.x * 0.45,
      (p.roll ?? 0) + (wob ? Math.sin(t * 1.7) * 0.04 : 0),
    );
    face.position.x = look.x * 0.07;
    face.position.y = -look.y * 0.05;
    blink -= dt;
    let bl = 1;
    if (blink < 0) {
      bl = Math.max(0.08, Math.abs(blink * 12 - 1));
      if (blink < -0.17) blink = 2.5 + Math.random() * 3;
    }
    for (const e of eyes) e.scale.y = 0.19 * bl;
    if (shadow) {
      const hgt = Math.max(0, root.position.y);
      shadow.position.y = -0.72 - root.position.y;
      shadow.scale.setScalar(1 - hgt * 0.5);
      shadow.material.opacity = 1 - hgt * 0.9;
    }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    play,
    wasDrag: () => moved > 6,
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerenter', onEnter);
      scene.environment?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      tex.dispose();
      cubeMat.dispose();
      eyeMat.dispose();
      if (shadow) {
        shadow.material.map?.dispose();
        shadow.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
    },
  };
}
