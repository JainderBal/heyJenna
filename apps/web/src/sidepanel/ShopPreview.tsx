/**
 * STUB: the Shopping list tab (the prototype's live preview, `.pv*` styles): one card per piece
 * with photo, seller, price and link, and the room total. Data: useLatestLayout(roomId) →
 * layout.shoppingList (+ layout.objects[].product.imageUrl), else picked useListings(roomId).
 */
import type { SidePanelBodyProps } from './types';

export function ShopPreview({ roomId }: SidePanelBodyProps) {
  return (
    <div className="sp-stub">
      <h3>Shopping list</h3>
      <p>{roomId ? 'Every piece for this room, linked to its seller, will show here.' : 'Open a room to see its shopping list.'}</p>
    </div>
  );
}
