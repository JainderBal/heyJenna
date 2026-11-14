/**
 * Project-wide views over the room data the editor already loads: the chosen products of every room
 * (Share, Sellers), grouped by seller, money totals per currency and the shopping list as CSV.
 */
import type { Layout, Listing, Room } from '../api/types';
import { sellerOf, shortTitle } from '../editor/model';

export interface RoomBundle {
  room: Room;
  layout: Layout | null | undefined;
  listings: Listing[] | undefined;
}

/** One chosen product (or a piece with no product yet) on a room's shopping list. */
export interface ProjectItem {
  id: string;
  roomId: string;
  roomName: string;
  type: string;
  title: string;
  seller: string;
  /** The seller group on the Sellers page. */
  group: SellerGroup;
  url: string | null;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  suggested: boolean;
}

export type SellerGroup = 'ikea' | 'links' | 'none';

export const GROUPS: { id: SellerGroup; name: string; blurb: string }[] = [
  { id: 'ikea', name: 'IKEA', blurb: 'new, with real 3D models' },
  { id: 'links', name: 'Links', blurb: 'pasted links and pieces from shops we no longer search' },
  { id: 'none', name: 'No product yet', blurb: 'pieces jenna still needs to find' },
];

export function groupOf(source: string | null | undefined, url: string | null | undefined, suggested = false): SellerGroup {
  if (suggested || (!source && !url)) return 'none';
  if (source === 'ikea') return 'ikea';
  if (/(^|\.)ikea\./.test(hostOf(url))) return 'ikea';
  return 'links';
}

function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A room's shopping list rows: the newest layout's list, else the picked listings (as the Shopping list frame). */
export function roomItems({ room, layout, listings }: RoomBundle): ProjectItem[] {
  if (layout) {
    const img = new Map(layout.objects.map((o) => [o.id, o.product?.imageUrl ?? null]));
    return layout.shoppingList.items.map((i) => ({
      id: `${room.id}:${i.objectId}`,
      roomId: room.id,
      roomName: room.name,
      type: i.type,
      title: i.title,
      seller: i.suggested ? 'no product yet' : sellerOf(i.source, i.url),
      group: groupOf(i.source, i.url, i.suggested),
      url: i.url,
      price: i.price,
      currency: i.currency,
      imageUrl: img.get(i.objectId) ?? null,
      suggested: i.suggested,
    }));
  }
  return (listings ?? [])
    .filter((l) => l.picked)
    .map((l) => ({
      id: `${room.id}:${l.id}`,
      roomId: room.id,
      roomName: room.name,
      type: l.type,
      title: l.title,
      seller: sellerOf(l.source, l.url),
      group: groupOf(l.source, l.url),
      url: l.url,
      price: l.price,
      currency: l.currency,
      imageUrl: l.imageUrl,
      suggested: false,
    }));
}

/** Sum of the priced items, per currency ("CAD" → 1240). */
export function totals(items: ProjectItem[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const i of items) if (i.price != null) t[i.currency] = (t[i.currency] ?? 0) + i.price;
  return t;
}

/** $180 / $34.50; a currency code Intl doesn't know falls back to "180 XYZ". */
export function money(v: number | null, currency = 'CAD'): string {
  if (v == null) return '–';
  const digits = v % 1 ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}

/** "$1,240" or "$1,240 + €80"; "$0" when nothing is priced. */
export function totalText(t: Record<string, number>): string {
  const parts = Object.entries(t).map(([c, v]) => money(Math.round(v * 100) / 100, c));
  return parts.length ? parts.join(' + ') : money(0);
}

export interface SellerSummary {
  id: SellerGroup;
  name: string;
  blurb: string;
  items: ProjectItem[];
  total: Record<string, number>;
}

/** The Sellers page: one group per seller kind with items, in GROUPS order, empty groups left out. */
export function bySeller(items: ProjectItem[]): SellerSummary[] {
  return GROUPS.map((g) => {
    const its = items.filter((i) => i.group === g.id);
    return { ...g, items: its, total: totals(its) };
  }).filter((g) => g.items.length);
}

const cell = (v: string | number | null) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The project's shopping list as CSV (one row per piece, Excel-friendly). */
export function shoppingCsv(items: ProjectItem[]): string {
  const head = ['Room', 'Piece', 'Product', 'Seller', 'Price', 'Currency', 'Link'];
  const rows = items.map((i) => [i.roomName, i.type.replace(/_/g, ' '), shortTitle(i.title), i.seller, i.price, i.currency, i.url]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "my-flat" from "My flat!" for file names. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
