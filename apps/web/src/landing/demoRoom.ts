/**
 * The living room on the landing page: a hand-placed layout drawn with the studio's live 3D viewer
 * (clay pieces, no products, so it needs no API).
 */
import type { Layout, PlacedObject, Room } from '../api/types';
import { floorPlanOf, PALS } from '../editor/plans';

export const DEMO_PALETTE = PALS.warm;

const plan = {
  ...floorPlanOf(4.4, 3.8),
  windows: [{ id: 'w1', wall: 'left' as const, position: 1.9, width: 1.4, sill: 0.7, head: 2.2, view: 'garden' as const }],
  doors: [{ id: 'd1', wall: 'right' as const, position: 3.0, width: 0.85, swing: 'in' as const }],
};

export const DEMO_ROOM: Room = {
  id: 'landing-demo',
  name: 'Living room',
  floorPlan: plan,
  needs: [],
  kind: 'living',
  furnish: true,
  budgetCad: null,
  planPosition: null,
  projectId: null,
  areaM2: 4.4 * 3.8,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

type P = [id: string, type: string, x: number, y: number, w: number, d: number, h: number, rot?: number, mount?: string, z?: number];
const PIECES: P[] = [
  ['sofa', 'sofa', 2.2, 0.55, 2.1, 0.9, 0.8],
  ['rug', 'rug', 2.2, 1.75, 2.4, 1.7, 0.02],
  ['coffee', 'coffee_table', 2.2, 1.75, 1.0, 0.55, 0.4],
  ['chair', 'armchair', 3.55, 2.35, 0.8, 0.8, 0.8, -120],
  ['lamp', 'floor_lamp', 0.45, 0.4, 0.4, 0.4, 1.6],
  ['plant', 'plant', 3.95, 0.45, 0.55, 0.55, 1.15],
  ['side', 'sideboard', 2.2, 3.5, 1.6, 0.45, 0.7, 180],
  ['art', 'art', 2.2, 0.03, 1.0, 0.04, 0.7, 0, 'wall', 1.7],
  ['pendant', 'pendant', 2.2, 1.75, 0.45, 0.45, 0.4, 0, 'ceiling', 2.0],
  ['pouf', 'pouf', 1.05, 2.4, 0.5, 0.5, 0.4],
];

const objects: PlacedObject[] = PIECES.map(([id, type, x, y, w, d, h, rot = 0, mount = 'floor', z = 0]) => ({
  id,
  type,
  name: type.replace(/_/g, ' '),
  layer: 'furniture',
  zone: 'living',
  mount,
  position: { x, y, z },
  rotation_deg: rot,
  size: { w, d, h },
}));

export const DEMO_LAYOUT: Layout = {
  id: 'landing-demo',
  roomId: DEMO_ROOM.id,
  summary: { pass: 0, warn: 0, fail: 0 },
  checks: [],
  dropped: [],
  variant: {},
  variantsTried: 1,
  objects,
  shoppingList: { items: [], total: 0, currency: 'CAD', missing: [] },
  createdAt: DEMO_ROOM.createdAt,
  updatedAt: DEMO_ROOM.updatedAt,
};
