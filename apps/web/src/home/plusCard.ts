/** The "+" card: a terrazzo plus (same material as jenna) floating over plan paper (prototype `makePlus`). */
import * as THREE from 'three';
import { LI, lc, roundBox, studioEnv, terrazzo } from '../viewer/three-kit';

export interface PlusCard {
  canvas: HTMLCanvasElement;
  update(t: number, hot: boolean): void;
  hop(): void;
  dispose(): void;
}

export const CARD_W = 560;
export const CARD_H = 680;

export function makePlus(): PlusCard {
  const W = CARD_W;
  const H = CARD_H;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d')!;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(420, 420, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = studioEnv(r);
  scene.add(new THREE.HemisphereLight(lc(0xfff6ec), lc(0x8a7a6e), 0.55 * LI));
  const key = new THREE.DirectionalLight(lc(0xfff1e2), 1.2 * LI);
  key.position.set(-2.5, 3.5, 4);
  scene.add(key);
  const tex = terrazzo('#2B5391', ['#F6F0E4', '#F6E878', '#E8A0B8', '#7FB7C9', '#F6F0E4', '#E8955A']);
  const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const grp = new THREE.Group();
  scene.add(grp);
  for (const [a, b, c] of [
    [1.9, 0.6, 0.6],
    [0.6, 1.9, 0.6],
  ])
    grp.add(new THREE.Mesh(roundBox(a, b, c, 0.15, 12), m));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  cam.position.set(0, 0.2, 5.6);
  cam.lookAt(0, 0, 0);
  let hop = 0;
  let spin = 0;
  let sv = 0;

  function paper() {
    g.fillStyle = '#F3EEE6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(43,83,145,.10)';
    g.lineWidth = 1;
    for (let x = 20; x < W; x += 28) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
      g.stroke();
    }
    for (let y = 12; y < H; y += 28) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(43,83,145,.38)';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.strokeRect(64, 96, W - 128, H - 250);
    g.beginPath();
    g.moveTo(W * 0.56, 96);
    g.lineTo(W * 0.56, H * 0.46);
    g.lineTo(W - 64, H * 0.46);
    g.moveTo(64, H * 0.58);
    g.lineTo(W * 0.36, H * 0.58);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#161514';
    g.font = '500 19px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('drop a floor plan', W / 2, H - 86);
    g.fillStyle = 'rgba(22,21,20,.45)';
    g.font = '500 14px "JetBrains Mono", monospace';
    g.fillText('JENNA FINDS EVERY ROOM', W / 2, H - 58);
  }

  function update(t: number, hot: boolean) {
    hop = Math.max(0, hop - 0.035);
    sv += ((hot ? 1.4 : 0.35) - sv) * 0.05;
    spin += sv * 0.016;
    const k = hop > 0 ? Math.sin((1 - hop) * Math.PI) : 0;
    grp.position.y = 0.08 + Math.sin(t * 1.8) * 0.06 + k * 0.55;
    grp.rotation.set(0.28 + Math.sin(t * 0.9) * 0.08, spin, Math.sin(t * 0.7) * 0.06);
    grp.scale.set(1 + (hop > 0.85 ? 0.12 : 0), 1 - (hop > 0.85 ? 0.12 : 0), 1);
    r.render(scene, cam);
    paper();
    const s = 1 - k * 0.4;
    g.fillStyle = `rgba(60,40,20,${0.16 * s})`;
    g.beginPath();
    g.ellipse(W / 2, H * 0.47 + 92, 120 * s, 16 * s, 0, 0, 6.29);
    g.fill();
    g.drawImage(r.domElement, (W - 420) / 2, H * 0.47 - 210);
  }

  update(0, false);
  return {
    canvas: out,
    update,
    hop: () => {
      hop = 1;
    },
    dispose: () => {
      scene.environment?.dispose();
      grp.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      m.dispose();
      tex.dispose();
      r.dispose();
      r.forceContextLoss();
    },
  };
}
