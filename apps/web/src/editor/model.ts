/**
 * Pages and frames, like the prototype's model(): a project has a Floor plan page plus one page per
 * room; each page has frames at page-local coordinates (px), and each frame has child layers.
 */
import type { Layout, Listing, Project, Room, StyleResponse } from '../api/types';
import type { PageId } from '../app/useEditorStore';
import { DEFAULT_PALETTE, dims } from './plans';

export type LayerIcon = 'frame' | 'img' | 'vec' | 'text' | 'plan' | 'rect';

export interface Layer {
  id: string;
  name: string;
  icon: LayerIcon;
  color?: string;
}

export type FrameType = 'drop' | 'plan' | 'add' | 'found' | 'mood' | 'pal' | 'room3d' | 'list';

export interface Frame {
  id: string;
  name: string;
  type: FrameType;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Layer[];
}

export interface Page {
  id: PageId;
  name: string;
  meta?: string;
  color?: string;
  room?: Room;
}

export const projectPalette = (p: Project | undefined) => (p?.palette.length ? p.palette : DEFAULT_PALETTE);

export function pagesOf(project: Project | undefined, rooms: Room[]): Page[] {
  const pal = projectPalette(project);
  return [
    { id: 'plan', name: 'Floor plan' },
    ...rooms.map((r, k) => ({ id: r.id, name: r.name, meta: dims(r), color: pal[k % pal.length], room: r })),
  ];
}

/** What a room page's frames need to size themselves and list their layers. */
export interface RoomData {
  style: StyleResponse | null | undefined;
  layout: Layout | null | undefined;
  listings: Listing[] | undefined;
  previews: string[];
  hasRender: boolean;
}

/** The palette shown for a room: the moodboard's, else the project's. */
export function roomPalette(style: StyleResponse | null | undefined, fallback: string[]): string[] {
  if (!style) return fallback;
  const p = style.profile.palette;
  return [...p.dominant, ...p.secondary, ...p.accent].slice(0, 8);
}

/** Rows on the shopping list: the layout's list, else the picked listings. */
export function listRows(d: Pick<RoomData, 'layout' | 'listings'>) {
  if (d.layout) {
    const img = new Map(d.layout.objects.map((o) => [o.id, o.product?.imageUrl ?? null]));
    return d.layout.shoppingList.items.map((i) => ({
      id: i.objectId,
      title: i.title,
      sub: i.suggested ? 'no product yet' : (i.source ?? ''),
      price: i.price,
      currency: i.currency,
      url: i.url,
      imageUrl: img.get(i.objectId) ?? null,
    }));
  }
  return (d.listings ?? [])
    .filter((l) => l.picked)
    .map((l) => ({ id: l.id, title: l.title, sub: l.source, price: l.price, currency: l.currency, url: l.url, imageUrl: l.imageUrl }));
}

export function planFrames(rooms: Room[], uploaded: boolean): Frame[] {
  if (!rooms.length) return [{ id: 'drop', name: 'Drop your floor plan', type: 'drop', x: 0, y: 0, w: 520, h: 400, children: [] }];
  return [
    {
      id: 'plan',
      name: 'Plan',
      type: 'plan',
      x: 0,
      y: 0,
      w: 520,
      h: 420,
      children: [
        ...(uploaded ? [{ id: 'plan/src', name: 'your-upload.jpg', icon: 'img' as const }] : []),
        ...rooms.map((r) => ({ id: `plan/${r.id}`, name: `${r.name} outline`, icon: 'vec' as const })),
      ],
    },
    { id: 'add', name: 'Add rooms', type: 'add', x: 560, y: 0, w: 520, h: 420, children: [] },
    { id: 'found', name: 'Rooms found', type: 'found', x: 1120, y: 0, w: 300, h: 420, children: rooms.map((r) => ({ id: `found/${r.id}`, name: r.name, icon: 'text' })) },
  ];
}

export function roomFrames(room: Room, d: RoomData, palette: string[]): Frame[] {
  const rows = listRows(d);
  const moodKids: Layer[] = d.previews.length
    ? d.previews.map((_, i) => ({ id: `mood/${i}`, name: `image-${i + 1}.jpg`, icon: 'img' }))
    : Array.from({ length: d.style?.imageCount ?? 0 }, (_, i) => ({ id: `mood/${i}`, name: `moodboard-${i + 1}.jpg`, icon: 'img' }));
  return [
    { id: 'mood', name: 'Moodboard', type: 'mood', x: 0, y: 0, w: 520, h: 440, children: moodKids },
    { id: 'pal', name: 'Palette', type: 'pal', x: 0, y: 480, w: 520, h: 90, children: palette.map((c, i) => ({ id: `pal/${i}`, name: c, icon: 'rect', color: c })) },
    {
      id: 'room3d',
      name: '3D room',
      type: 'room3d',
      x: 560,
      y: 0,
      w: 520,
      h: 570,
      children: [
        { id: 'room3d/model', name: '3D model (live)', icon: 'vec' },
        { id: 'room3d/dims', name: dims(room), icon: 'text' },
        ...(d.hasRender ? [{ id: 'room3d/render', name: 'render.png', icon: 'img' as const }] : []),
      ],
    },
    {
      id: 'list',
      name: 'Shopping list',
      type: 'list',
      x: 1120,
      y: 0,
      w: 320,
      h: Math.max(340, 190 + rows.length * 58),
      children: rows.map((r) => ({ id: `list/${r.id}`, name: r.title, icon: 'img' })),
    },
  ];
}
