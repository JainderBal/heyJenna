import { Size } from '@hey-jenna/contracts';

type Vec3 = [number, number, number];
type Mat4 = number[]; // column-major, like glTF

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: Vec3;
  rotation?: [number, number, number, number];
  scale?: Vec3;
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function trs(n: GltfNode): Mat4 {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const apply = (m: Mat4, [x, y, z]: Vec3): Vec3 => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/**
 * A GLB's real-world size from the bounding boxes glTF stores for every mesh (POSITION min/max),
 * placed through the node tree. No geometry decoding needed, so Draco-compressed files work too.
 * glTF is Y-up: width/depth come from x/z, height from y. Returns w ≥ d.
 */
export function glbSize(glb: Buffer): Size | null {
  if (glb.length < 20 || glb.toString('ascii', 0, 4) !== 'glTF') return null;
  const jsonLength = glb.readUInt32LE(12);
  if (glb.toString('ascii', 16, 20) !== 'JSON') return null;
  const gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength)) as {
    scene?: number; scenes?: { nodes?: number[] }[]; nodes?: GltfNode[];
    meshes?: { primitives: { attributes: { POSITION?: number } }[] }[];
    accessors?: { min?: number[]; max?: number[] }[];
  };
  const nodes = gltf.nodes ?? [];
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (i: number, parent: Mat4, depth: number) => {
    const node = nodes[i];
    if (!node || depth > 64) return;
    const m = multiply(parent, trs(node));
    for (const prim of node.mesh !== undefined ? gltf.meshes?.[node.mesh]?.primitives ?? [] : []) {
      const acc = prim.attributes.POSITION !== undefined ? gltf.accessors?.[prim.attributes.POSITION] : undefined;
      if (!acc?.min || !acc.max) continue;
      for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]]) for (const cz of [acc.min[2], acc.max[2]]) {
        const p = apply(m, [cx, cy, cz]);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      }
    }
    for (const c of node.children ?? []) visit(c, m, depth + 1);
  };
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  for (const r of roots) visit(r, IDENTITY, 0);
  if (!Number.isFinite(lo[0])) return null;
  const x = hi[0] - lo[0], y = hi[1] - lo[1], z = hi[2] - lo[2];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { w: r(Math.max(x, z)), d: r(Math.min(x, z)), h: r(y) };
}
