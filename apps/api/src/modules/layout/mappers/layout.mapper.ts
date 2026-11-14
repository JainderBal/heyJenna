import { Layout } from '@prisma/client';
import { LayoutResponseDto, ShoppingListDto } from '../dto/layout-response.dto';
import { LayoutData } from '../layout.types';

/** Every placed piece that came from our list (product or stand-in) belongs on the shopping list. */
export function shoppingListOf(data: LayoutData): ShoppingListDto {
  const items = data.objects
    .filter((o) => o.product || o.suggested)
    .map((o) => ({
      objectId: o.id,
      type: o.type,
      title: o.product?.title ?? (o.name.includes('.') ? `suggested ${o.type.replace('_', ' ')}` : o.name),
      url: o.product?.url ?? null,
      source: o.product?.source ?? null,
      price: o.product?.price ?? null,
      currency: o.product?.currency ?? 'CAD',
      suggested: !o.product,
    }));
  return {
    items,
    total: Math.round(items.reduce((s, i) => s + (i.price ?? 0), 0) * 100) / 100,
    currency: 'CAD',
    missing: items.filter((i) => i.suggested).map((i) => i.objectId),
  };
}

export function toLayoutResponse(layout: Layout): LayoutResponseDto {
  const data = layout.data as unknown as LayoutData;
  return {
    id: layout.id,
    roomId: layout.roomId,
    summary: data.summary,
    checks: data.checks,
    dropped: data.dropped,
    objects: data.objects,
    shoppingList: shoppingListOf(data),
    createdAt: layout.createdAt.toISOString(),
    updatedAt: layout.updatedAt.toISOString(),
  };
}
