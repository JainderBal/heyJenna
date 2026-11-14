import { NotFoundException } from '@nestjs/common';
import { ChatAction, FurnitureType, StyleDialsPatch } from '@hey-jenna/contracts';
import { LayoutService } from '../layout/layout.service';
import { SourcingService } from '../sourcing/sourcing.service';
import { SearchListingsDto } from '../sourcing/dto/search-listings.dto';
import { StyleService } from '../style/style.service';

export interface ChatDeps {
  style: StyleService;
  sourcing: SourcingService;
  layout: LayoutService;
}

/**
 * What Jenna can do in one room, on top of the existing services only.
 * Each call returns a short summary (fed to Claude or worded by the rules) and records an action for the UI.
 */
export class ChatTools {
  readonly actions: ChatAction[] = [];

  constructor(private readonly roomId: string, private readonly ownerId: string, private readonly deps: ChatDeps) {}

  async readStyle() {
    const { profile } = await this.deps.style.get(this.roomId, this.ownerId);
    this.actions.push({ type: 'style_read' });
    return { name: profile.name, palette: profile.palette, vibe: profile.vibe, keywords: profile.keywords, dials: profile.dials };
  }

  async updateDials(dials: StyleDialsPatch) {
    const { profile } = await this.deps.style.update(this.roomId, this.ownerId, { dials });
    this.actions.push({ type: 'style_updated', dials });
    const changed = Object.fromEntries(Object.keys(dials).map((k) => [k, profile.dials[k as keyof typeof profile.dials]]));
    return { updated: changed };
  }

  async searchListings(dto: SearchListingsDto) {
    const out = await this.deps.sourcing.search(this.roomId, this.ownerId, dto);
    const types = out.searched.map((s) => s.type);
    this.actions.push({ type: 'listings_searched', types, kept: out.listings.length });
    return {
      searched: out.searched,
      errors: out.errors,
      top: out.listings.slice(0, 8).map((l) => ({ type: l.type, title: l.title, price: l.price, currency: l.currency, source: l.source })),
    };
  }

  async generateLayout() {
    const l = await this.deps.layout.generate(this.roomId, this.ownerId);
    this.actions.push({ type: 'layout_generated', layoutId: l.id });
    return fitSummary(l);
  }

  /** The newest layout's fit checks, or a fresh layout if there is none yet. */
  async fitCheck() {
    const [latest] = await this.deps.layout.list(this.roomId, this.ownerId);
    if (!latest) return this.generateLayout();
    this.actions.push({ type: 'layout_read', layoutId: latest.id });
    return fitSummary(latest);
  }

  async shoppingList() {
    const [latest] = await this.deps.layout.list(this.roomId, this.ownerId);
    if (!latest) throw new NotFoundException('This room has no layout yet');
    const list = await this.deps.layout.shoppingList(this.roomId, this.ownerId, latest.id);
    this.actions.push({ type: 'shopping_list_read', layoutId: latest.id, total: list.total, currency: list.currency });
    return { ...list, items: list.items.map((i) => ({ type: i.type, title: i.title, price: i.price, source: i.source })) };
  }
}

function fitSummary(l: Awaited<ReturnType<LayoutService['generate']>>) {
  return {
    layoutId: l.id,
    summary: l.summary,
    problems: l.checks.filter((c) => c.status !== 'pass').map((c) => `${c.rule}: ${c.detail}`),
    dropped: l.dropped,
    pieces: l.objects.length,
  };
}

export const isFurnitureType = (s: string): s is FurnitureType => FurnitureType.safeParse(s).success;
