/**
 * "Swap" for one shopping-list piece: the room's other listings of the same type (best match first),
 * and a box to paste a product link as one more candidate. Picking one puts that product in the
 * piece's spot (PATCH …/objects/:objectId {listingId}); the 3D room and the list follow the new layout.
 * Used by the Shopping list frame and the side panel's live preview.
 */
import { useState } from 'react';
import type { FurnitureType } from '@hey-jenna/contracts';
import { errorText } from '../api/client';
import { useAddListingLink, useListings, usePatchLayoutObject } from '../api/hooks';
import { toast } from '../app/useEditorStore';
import { money, sellerOf, shortTitle } from './model';

export interface SwapTarget {
  roomId: string;
  layoutId: string;
  objectId: string;
  type: string;
  /** The product in the spot now (left out of the choices). */
  listingId?: string;
}

const MAX = 6;

export function SwapPicker({ roomId, layoutId, objectId, type, listingId, onClose }: SwapTarget & { onClose: () => void }) {
  const listings = useListings(roomId, type as FurnitureType);
  const patch = usePatchLayoutObject(roomId, layoutId);
  const addLink = useAddListingLink(roomId);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const label = type.replace(/_/g, ' ');
  const options = (listings.data ?? []).filter((l) => l.id !== listingId).slice(0, MAX);

  function pick(id: string) {
    setErr(null);
    patch.mutate(
      { objectId, edit: { listingId: id } },
      {
        onSuccess: (r) => {
          toast(r.warnings.length ? `Swapped · ${r.warnings.join(', ').replace(/_/g, ' ')}` : 'Swapped');
          onClose();
        },
        onError: (e) => setErr(errorText(e)),
      },
    );
  }

  function paste(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setErr(null);
    addLink.mutate(
      { url: url.trim(), type: type as FurnitureType },
      {
        onSuccess: () => setUrl(''), // it lands at the top of the choices (pasted links are picked)
        onError: (er) => setErr(errorText(er)),
      },
    );
  }

  return (
    <div className="swap" onPointerDown={(e) => e.stopPropagation()}>
      <div className="swap-h">
        <span>Swap the {label}</span>
        <button type="button" className="swap-btn" onClick={onClose}>
          Close
        </button>
      </div>
      {listings.isLoading ? (
        <p className="swap-empty">loading…</p>
      ) : !options.length ? (
        <p className="swap-empty">No other {label}s found yet. Find products again, or paste a link.</p>
      ) : (
        options.map((l) => (
          <button key={l.id} type="button" className="swap-opt" disabled={patch.isPending} onClick={() => pick(l.id)}>
            {l.imageUrl ? <img alt="" src={l.imageUrl} loading="lazy" referrerPolicy="no-referrer" /> : <span className="ph" />}
            <span>
              <b title={l.title}>{shortTitle(l.title)}</b>
              <small>
                {sellerOf(l.source, l.url)}
                {l.modelUrl ? ' · 3D' : ''}
              </small>
            </span>
            <span className="p">{money(l.price, l.currency)}</span>
          </button>
        ))
      )}
      <form className="swap-link" onSubmit={paste}>
        <input type="url" placeholder="Paste a product link" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={`Paste a link to a ${label}`} />
        <button className="pbtn sm" type="submit" disabled={addLink.isPending || !url.trim()}>
          {addLink.isPending ? 'Reading…' : 'Add'}
        </button>
      </form>
      {err && (
        <p className="swap-empty" role="alert" style={{ color: '#A3341F' }}>
          {err}
        </p>
      )}
    </div>
  );
}
