import { FloorPlan, FurnitureType, Size, StyleProfile } from '@hey-jenna/contracts';
import { Listing } from '@prisma/client';
import { TYPICAL } from '../../sourcing/matching/dimensions';
import { ChosenSlot } from '../../sourcing/sourcing.service';
import { wallsWithAccent } from './accent-wall';
import { engineStyleFromDials } from './style-dials';
import { EngineItem, EngineSpec } from './layout-engine';

const NEUTRAL_STYLE: Pick<StyleProfile, 'palette' | 'shapeFamily' | 'materials'> = {
  palette: { dominant: ['#F1E7DA', '#CBC3B7'], secondary: ['#8A7B6A'], accent: ['#C8643C'] },
  shapeFamily: 'modern',
  materials: {},
};

/** Which object came from which product: engine object id → listing. */
export type ListingIndex = Map<string, Listing>;

/** Room + style + chosen products → the engine's input, and an index to map results back to products. */
export function buildEngineSpec(name: string, plan: FloorPlan, needs: string[], style: StyleProfile | null, chosen: ChosenSlot[]) {
  const furniture: EngineItem[] = [];
  const index: ListingIndex = new Map();
  const counter: Partial<Record<FurnitureType, number>> = {};
  const hasDesk = chosen.some((c) => c.slot.type === 'desk');

  for (const { slot, listings } of chosen) {
    for (let n = 0; n < slot.count; n++) {
      const listing = listings[n];
      const k = (counter[slot.type] = (counter[slot.type] ?? 0) + 1);
      const id = `${slot.type}_${k}`;
      const size = listing ? (listing.size as unknown as Size) : TYPICAL[slot.type];
      const item: EngineItem = {
        id,
        type: slot.type,
        name: listing?.title ?? `suggested ${slot.type.replace('_', ' ')}`,
        size,
        colour: 'auto',
        ...extrasFor(slot.type, k, size, listing?.title ?? '', hasDesk),
      };
      if (!listing) item.suggested = true; // nothing found or picked yet: a placeholder
      furniture.push(item);
      if (listing) index.set(id, listing);
    }
  }

  const s = style ?? NEUTRAL_STYLE;
  const fromDials = style?.dials ? engineStyleFromDials(style.dials, plan, style.materials) : null;
  const spec: EngineSpec = {
    room: {
      name,
      width: plan.width,
      depth: plan.depth,
      wall_height: plan.wallHeight,
      floor: plan.floor,
      walls: wallsWithAccent(plan, style), // accent wall coloured from the moodboard
      windows: plan.windows,
      doors: plan.doors,
      features: plan.features,
      open_walls_in_render: ['front', 'right'],
    },
    needs,
    style_profile: {
      name: style?.name ?? 'neutral',
      source: style?.source ?? 'no moodboard yet',
      palette: s.palette,
      shape_family: s.shapeFamily,
      materials: {
        wood: s.materials.wood ?? '#B9733A', metal: s.materials.metal ?? 'chrome', fabric: s.materials.fabric ?? 'wool',
        ...(fromDials?.wood ?? {}), // wood colours from the wood_tone dial when the board named none
      },
      ...(style?.stylingDensity ? { styling_density: style.stylingDensity } : {}),
      ...(fromDials?.profile ?? {}), // dials win: density, plants, art, light, features, fillers
    },
    furniture,
  };
  return { spec, index };
}

/** Small hints the engine uses to place things well. */
function extrasFor(type: FurnitureType, n: number, size: Size, title: string, hasDesk: boolean): Partial<EngineItem> {
  switch (type) {
    case 'armchair':
      return { tags: n === 1 || /lounge|club|recliner|wingback/i.test(title) ? ['lounge', 'upholstered'] : ['accent'] };
    case 'plant':
      return { kind: size.h >= 1.1 ? 'tall' : size.h <= 0.6 ? 'bush' : /cactus|snake/i.test(title) ? 'cactus' : 'bush' };
    case 'table_lamp':
      return hasDesk ? { on: 'desk_1' } : {};
    case 'art':
      return n === 1 ? { placement: 'over_sofa' } : {}; // the rest dress the other walls
    case 'ceiling_light':
      return { hang_height: 2.15 };
    case 'side_table':
      return n === 2 ? { tags: ['reading'] } : {};
    default:
      return {};
  }
}
