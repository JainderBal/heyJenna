/**
 * The home carousel (prototype `startHome()`): cards on a curved WebGL strip. The centred card is
 * big and in colour; neighbours shrink, grey out and blur. Drag/flick, horizontal wheel, click a
 * side card to bring it in, click the centred one to open it; it drifts on by itself when idle.
 */
import * as THREE from 'three';
import { COVER_KIND, roomShot } from '../viewer/three-kit';
import { CARD_H, CARD_W, makePlus, type PlusCard } from './plusCard';

export interface CarouselCard {
  id: string;
  palette: string[];
  isNew?: boolean;
}

export interface CarouselCallbacks {
  /** The carousel moved (or is about to settle) on this card. */
  index(i: number): void;
  /** The centred card was clicked (or Enter on the focused stage). */
  open(i: number): void;
}

const VS = `uniform vec2 uSize;uniform float uCurve;varying vec2 vUv;
void main(){vUv=uv;vec3 p=position;p.xy*=uSize;vec4 w=modelMatrix*vec4(p,1.);w.z+=uCurve*w.x*w.x;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FS = `uniform sampler2D uTex;uniform vec2 uSize;uniform float uGray,uBlur,uAlpha,uR,uTexA;varying vec2 vUv;
float sd(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){vec2 uv=vUv;float a=uSize.x/uSize.y;if(a<uTexA)uv.x=(uv.x-.5)*a/uTexA+.5;else uv.y=(uv.y-.5)*uTexA/a+.5;
 vec4 c=texture2D(uTex,uv);
 if(uBlur>.01){vec2 px=uBlur/uSize;c=c*.2;for(int i=0;i<8;i++){float an=float(i)*.785398;c+=texture2D(uTex,uv+vec2(cos(an),sin(an))*px)*.1;}}
 float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=mix(c.rgb,vec3(l),uGray);
 float n=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);c.rgb+=(n-.5)*.035;
 float d=sd((vUv-.5)*uSize,uSize*.5,uR);float edge=clamp(.5-d/(1.+uBlur*.8),0.,1.);
 gl_FragColor=vec4(c.rgb,edge*uAlpha);}`;

// measured from the reference video (centre, neighbour, outer, hidden), at a 1400px wide stage
const CW = [287, 247, 172, 150];
const CH = [347, 278, 193, 170];
const F = [0, 295, 533.5, 580];
const AL = [1, 1, 0.5, 0];
const BL = [0, 0, 2.4, 6];
const li = (arr: number[], a: number) => {
  const i = Math.min(Math.floor(a), arr.length - 2);
  const f = Math.min(1, a - i);
  return arr[i] + (arr[i + 1] - arr[i]) * f;
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Mat = THREE.ShaderMaterial & {
  uniforms: {
    uTex: { value: THREE.Texture };
    uSize: { value: THREE.Vector2 };
    uCurve: { value: number };
    uGray: { value: number };
    uBlur: { value: number };
    uAlpha: { value: number };
    uR: { value: number };
    uTexA: { value: number };
  };
};

export interface Carousel {
  setCards(cards: CarouselCard[]): void;
  /** Animate to card `i` (shortest way round) unless already there or heading there. */
  goTo(i: number): void;
  dispose(): void;
}

export function createCarousel(stage: HTMLElement, cap: HTMLElement, startIndex: number, cb: CarouselCallbacks): Carousel | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.prepend(renderer.domElement);
  const plus: PlusCard = makePlus();
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 1, 6000);
  const geo = new THREE.PlaneGeometry(1, 1, 64, 1);

  let cards: CarouselCard[] = [];
  let tex: THREE.CanvasTexture[] = [];
  let meshes: THREE.Mesh<THREE.PlaneGeometry, Mat>[] = [];
  let N = 1;
  let s = 1;
  let pos = startIndex;
  let anim: { from: number; to: number; t0: number; dur: number } | null = null;
  let drag: { x: number; p: number; moved: boolean; t: number } | null = null;
  let lastUser = 0;
  let hover = false;
  let raf = 0;
  let reported = -1;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const mod = (i: number) => ((i % N) + N) % N;
  const dist = (i: number) => {
    let d = (((i - pos) % N) + N) % N;
    if (d > N / 2) d -= N;
    return d;
  };
  const report = (i: number) => {
    const m = mod(i);
    if (m !== reported) {
      reported = m;
      cb.index(m);
    }
  };

  function texture(c: CarouselCard, i: number) {
    // NoColorSpace on purpose: the raw shader samples and writes the canvas bytes as-is (r128 did too).
    const t = new THREE.CanvasTexture(c.isNew ? plus.canvas : roomShot(c.palette, COVER_KIND[(i - 1 + COVER_KIND.length) % COVER_KIND.length], CARD_W, CARD_H));
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  function setCards(next: CarouselCard[]) {
    for (const m of meshes) {
      scene.remove(m);
      m.material.dispose();
    }
    for (const t of tex) t.dispose();
    cards = next;
    N = Math.max(1, cards.length);
    tex = cards.map(texture);
    meshes = cards.map((_, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uTex: { value: tex[i] },
          uSize: { value: new THREE.Vector2(1, 1) },
          uCurve: { value: 0.00028 },
          uGray: { value: 0 },
          uBlur: { value: 0 },
          uAlpha: { value: 1 },
          uR: { value: 10 },
          uTexA: { value: CARD_W / CARD_H },
        },
      }) as Mat;
      const m = new THREE.Mesh(geo, mat);
      scene.add(m);
      return m;
    });
  }

  function size() {
    const w = stage.clientWidth;
    s = Math.max(0.62, Math.min(1.05, w / 1400));
    const sh = Math.round(CH[0] * s + 96);
    stage.style.height = sh + 'px';
    renderer.setSize(w || 1, sh, false);
    cam.aspect = (w || 1) / sh;
    cam.position.set(0, 0, sh / 2 / Math.tan((15 * Math.PI) / 180));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cap.style.top = sh / 2 - 22 + (CH[0] * s) / 2 + 12 + 'px';
    cap.style.width = CW[0] * s + 'px';
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(stage);

  function go(step: number) {
    const now = performance.now();
    const base = anim ? anim.to : Math.round(pos);
    anim = { from: pos, to: base + step, t0: now, dur: 560 };
    report(anim.to);
  }
  const user = () => {
    lastUser = performance.now();
  };

  function frame(now: number) {
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      pos = anim.from + (anim.to - anim.from) * ease(t);
      if (t >= 1) {
        pos = anim.to;
        anim = null;
      }
    }
    meshes.forEach((m, i) => {
      const d = dist(i);
      const a = Math.abs(d);
      const u = m.material.uniforms;
      u.uSize.value.set(li(CW, a) * s, li(CH, a) * s);
      m.position.set(Math.sign(d) * li(F, a) * s, 22, 0);
      u.uGray.value = Math.min(1, a);
      u.uBlur.value = li(BL, a) * s;
      u.uAlpha.value = a >= 3 ? 0 : li(AL, a);
      u.uR.value = 10 * s;
      m.renderOrder = 10 - a;
      m.visible = a < 3;
      if (cards[i].isNew && a < 2.6) {
        plus.update(now / 1000, a < 0.5 && hover);
        tex[i].needsUpdate = true;
      }
    });
    if (drag?.moved) report(Math.round(pos));
    cap.style.opacity = String(Math.max(0, 1 - Math.abs(pos - Math.round(pos)) * 6));
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const timer = setInterval(() => {
    if (!anim && !drag && !hover && performance.now() - lastUser > 5000 && !document.hidden) go(1);
  }, 2700);

  function hit(e: PointerEvent) {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2 + 22;
    let best: { i: number; d: number; a: number } | null = null;
    meshes.forEach((m, i) => {
      const d = dist(i);
      const a = Math.abs(d);
      if (a >= 2.5) return;
      const w = li(CW, a) * s * (1 + a * 0.06);
      const h = li(CH, a) * s * (1 + a * 0.12);
      if (Math.abs(x - m.position.x) < w / 2 && Math.abs(y) < h / 2 && (!best || a < best.a)) best = { i, d, a };
    });
    return best as { i: number; d: number; a: number } | null;
  }

  function openAt(i: number) {
    if (cards[i]?.isNew) {
      plus.hop();
      const t = setTimeout(() => {
        timers.delete(t);
        cb.open(i);
      }, 380);
      timers.add(t);
    } else cb.open(i);
  }

  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, p: pos, moved: false, t: performance.now() };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      stage.classList.toggle('hot', !!hit(e));
      return;
    }
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5 && !drag.moved) {
      drag.moved = true;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (drag.moved) {
      anim = null;
      pos = drag.p - dx / (F[1] * s);
    }
  };
  const onUp = (e: PointerEvent) => {
    const d = drag;
    drag = null;
    user();
    if (!d) return;
    if (d.moved) {
      const v = ((pos - d.p) / Math.max(60, performance.now() - d.t)) * 200;
      const to = Math.round(pos + Math.max(-0.6, Math.min(0.6, v)));
      anim = { from: pos, to, t0: performance.now(), dur: 420 };
      report(to);
      return;
    }
    const h = hit(e);
    if (!h) return;
    if (h.a < 0.5) openAt(h.i);
    else go(Math.round(h.d));
  };
  const onEnter = () => {
    hover = true;
  };
  const onLeave = () => {
    hover = false;
    drag = null;
    stage.classList.remove('hot');
  };
  let wl = 0;
  const onWheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (!d) return;
    e.preventDefault();
    user();
    if (anim) return;
    wl += d;
    if (Math.abs(wl) > 40) {
      go(Math.sign(wl));
      wl = 0;
    }
  };
  // Home owns ← / → on the document; the stage adds Enter when it has focus.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') user();
    if (e.key === 'Enter' && document.activeElement === stage) {
      e.preventDefault();
      openAt(mod(Math.round(pos)));
    }
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointerenter', onEnter);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('keydown', onKey);

  return {
    setCards(next) {
      setCards(next);
      reported = mod(Math.round(pos));
    },
    goTo(i) {
      if (drag?.moved) return;
      const target = anim ? anim.to : Math.round(pos);
      const cur = mod(target);
      if (cur === i) return;
      user();
      let step = i - cur;
      if (step > N / 2) step -= N;
      if (step < -N / 2) step += N;
      go(step);
    },
    dispose() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      timers.forEach(clearTimeout);
      ro.disconnect();
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointerenter', onEnter);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKey);
      for (const m of meshes) m.material.dispose();
      for (const t of tex) t.dispose();
      geo.dispose();
      plus.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      stage.style.height = '';
    },
  };
}
