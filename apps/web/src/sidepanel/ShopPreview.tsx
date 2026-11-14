/**
 * The Shopping list tab (prototype: preview(), `.pv*` styles): one card per piece with photo, seller,
 * price, where it is and a link to the seller, then the room total. Data: the newest layout's
 * shopping list (photos and 3D models from layout.objects[].product); before there is a layout, the
 * room's picked listings.
 */
import { useMemo } from 'react';
import { useLatestLayout, useListings, useProjectRooms } from '../api/hooks';
import type { Listing } from '../api/types';
import { Bag, ExternalLink } from '../editor/icons';
import type { SidePanelBodyProps } from './types';

interface Card {
  key: string;
  title: string;
  seller: string;
  url: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  note: string;
  has3d: boolean;
  suggested: boolean;
}

const SELLERS: Record<string, string> = {
  ebay: 'eBay',
  kijiji: 'Kijiji',
  facebook: 'Facebook Marketplace',
  ikea: 'IKEA',
  etsy: 'Etsy',
  mock: 'Example shop',
};

/** "eBay", "IKEA", or the link's host for web finds and pasted links. */
function sellerOf(source: string | null | undefined, url: string | null | undefined): string {
  if (source && SELLERS[source]) return SELLERS[source];
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return source ? source[0].toUpperCase() + source.slice(1) : 'Seller';
}

const money = (n: number | null, currency: string) => {
  if (n == null) return 'price on site';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
};

const noteOf = (l: Listing | undefined, type: string) => {
  const bits = [l?.condition && l.condition !== 'unknown' ? l.condition : null, l?.location ? `pick up in ${l.location}` : null].filter(Boolean);
  return bits.length ? bits.join(' · ') : type.replace(/_/g, ' ');
};

export function ShopPreview({ roomId, projectId }: SidePanelBodyProps) {
  const rooms = useProjectRooms(projectId).data;
  const room = rooms?.find((r) => r.id === roomId);
  const layoutQ = useLatestLayout(roomId);
  const listingsQ = useListings(roomId);
  const layout = layoutQ.data;
  const listings = listingsQ.data;

  const { cards, total, currency, missing, fromLayout } = useMemo(() => {
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));
    if (layout && layout.shoppingList.items.length) {
      const objs = new Map(layout.objects.map((o) => [o.id, o]));
      const cards: Card[] = layout.shoppingList.items.map((it) => {
        const prod = objs.get(it.objectId)?.product;
        const l = prod ? byId.get(prod.listingId) : undefined;
        return {
          key: it.objectId,
          title: it.title,
          seller: sellerOf(it.source, it.url),
          url: it.url,
          imageUrl: prod?.imageUrl ?? l?.imageUrl ?? null,
          price: it.price,
          currency: it.currency,
          note: noteOf(l, it.type),
          has3d: !!(prod?.modelUrl ?? l?.modelUrl),
          suggested: it.suggested,
        };
      });
      return { cards, total: layout.shoppingList.total, currency: layout.shoppingList.currency, missing: layout.shoppingList.missing, fromLayout: true };
    }
    const picked = (listings ?? []).filter((l) => l.picked);
    const cards: Card[] = picked.map((l) => ({
      key: l.id,
      title: l.title,
      seller: sellerOf(l.source, l.url),
      url: l.url,
      imageUrl: l.imageUrl,
      price: l.price,
      currency: l.currency,
      note: noteOf(l, l.type),
      has3d: !!l.modelUrl,
      suggested: false,
    }));
    return {
      cards,
      total: picked.reduce((s, l) => s + (l.price ?? 0), 0),
      currency: picked[0]?.currency ?? 'CAD',
      missing: [] as string[],
      fromLayout: false,
    };
  }, [layout, listings]);

  // pieces the 3D room shows that aren't on the list: built-ins that are part of the room, and styling props
  const extras = useMemo(() => {
    if (!layout) return [] as string[];
    const listed = new Set(layout.shoppingList.items.map((i) => i.objectId));
    const SHELL = new Set(['floor', 'wall', 'ceiling', 'zone', 'window', 'door', 'opening']);
    const names = layout.objects
      .filter((o) => !SHELL.has(o.type) && !listed.has(o.id))
      .map((o) => (o.type.startsWith('built_in_') ? `${o.type.slice(9).replace(/_/g, ' ')} (built in)` : o.type === 'cup' ? 'vase' : o.type.replace(/_/g, ' ')));
    const counts = new Map<string, number>();
    names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    return [...counts].map(([n, c]) => (c > 1 ? `${c} ${n}s` : n));
  }, [layout]);

  const loading = !!roomId && (layoutQ.isLoading || listingsQ.isLoading);
  const error = layoutQ.error ?? listingsQ.error;

  return (
    <div className="pv">
      <header>
        <span className="pv-ic">
          <Bag />
        </span>
        <div>
          <b>Shopping list</b>
          <small>{room ? `${room.name} · ${cards.length} ${cards.length === 1 ? 'piece' : 'pieces'}` : roomId ? `${cards.length} pieces` : 'no room open'}</small>
        </div>
        {roomId && (
          <span className="live">
            <i />
            live
          </span>
        )}
      </header>
      <div className="pv-body">
        {!roomId ? (
          <p className="pv-empty">open a room (pick one from Pages on the left) to see every piece for it, linked to its seller.</p>
        ) : loading ? (
          <p className="pv-empty">loading the list…</p>
        ) : error && !cards.length ? (
          <p className="pv-empty">couldn't load the list: {error.message}</p>
        ) : !cards.length ? (
          <p className="pv-empty">nothing picked yet. search listings or generate a layout for the {room?.name.toLowerCase() ?? 'room'}, and the pieces show up here with links to buy them.</p>
        ) : (
          cards.map((c) => (
            <article className="pcard" key={c.key}>
              <div className="pimg">
                {c.imageUrl ? <img alt={c.title} src={c.imageUrl} loading="lazy" referrerPolicy="no-referrer" /> : <div className="pv-noimg" aria-hidden="true"><Bag /></div>}
                <span className="seller">{c.seller}</span>
                {c.has3d && (
                  <span className="p3d" title="Has a 3D model">
                    3D
                  </span>
                )}
              </div>
              <div className="pinfo">
                <div className="pt">
                  <b>{c.title}</b>
                  <span className="price">{money(c.price, c.currency)}</span>
                </div>
                <small>
                  {c.note}
                  {c.suggested ? ' · suggested' : ''}
                </small>
                {c.url && (
                  <a className="plink" href={c.url} target="_blank" rel="noopener noreferrer">
                    View on {c.seller} <ExternalLink />
                  </a>
                )}
              </div>
            </article>
          ))
        )}
        {fromLayout && extras.length > 0 && (
          <p className="pv-extras">
            <b>Also in the 3D room, not for sale:</b> {extras.join(', ')}.
          </p>
        )}
      </div>
      {roomId && cards.length > 0 && (
        <footer>
          <div className="pt">
            <span>Room total</span>
            <b>{money(total, currency)}</b>
          </div>
          <small>
            {fromLayout ? 'from the latest layout' : 'your picked listings (no layout yet)'}. prices are the sellers' own; each link opens the listing in a new tab.
            {missing.length ? ` still to find: ${missing.join(', ').replace(/_/g, ' ')}.` : ''}
          </small>
        </footer>
      )}
    </div>
  );
}
