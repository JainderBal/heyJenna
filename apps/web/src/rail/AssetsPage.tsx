/** Assets: every moodboard image across the project's rooms in one grid; filter by room, open, remove. */
import { useEffect, useState } from 'react';
import { useDeleteRoomImage } from '../api/hooks';
import { errorText } from '../api/client';
import { toast } from '../app/useEditorStore';
import { NoRooms, RailHeader, type BoardImage, type RailBodyProps } from './RailPage';

interface Asset extends BoardImage {
  roomId: string;
  roomName: string;
  color: string;
}

export function AssetsPage({ data, loading, openRoom }: RailBodyProps) {
  const [room, setRoom] = useState<string | null>(null);
  const [open, setOpen] = useState<Asset | null>(null);
  const remove = useDeleteRoomImage();
  const all: Asset[] = data.flatMap((d) => d.images.map((i) => ({ ...i, roomId: d.room.id, roomName: d.room.name, color: d.color })));
  const shown = room ? all.filter((a) => a.roomId === room) : all;

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  function del(a: Asset) {
    remove.mutate(
      { roomId: a.roomId, imageId: a.id },
      {
        onSuccess: () => {
          toast(`Removed from the ${a.roomName.toLowerCase()} moodboard`);
          setOpen(null);
        },
        onError: (e) => toast(errorText(e)),
      },
    );
  }

  return (
    <div className="rp-in">
      <RailHeader title="Assets" sub={`${all.length} moodboard ${all.length === 1 ? 'image' : 'images'} across ${data.length} ${data.length === 1 ? 'room' : 'rooms'}`} />
      {!data.length && !loading && <NoRooms openPlan={() => openRoom('plan', 'plan')} />}
      {data.length > 0 && (
        <div className="rp-chips" role="group" aria-label="Filter by room">
          <button type="button" className={room ? '' : 'on'} aria-pressed={!room} onClick={() => setRoom(null)}>
            All <small>{all.length}</small>
          </button>
          {data.map((d) => (
            <button key={d.room.id} type="button" className={room === d.room.id ? 'on' : ''} aria-pressed={room === d.room.id} onClick={() => setRoom(d.room.id)}>
              <span className="pdot" style={{ background: d.color }} />
              {d.room.name} <small>{d.images.length}</small>
            </button>
          ))}
        </div>
      )}
      {data.length > 0 && !shown.length && (
        <div className="rp-empty">
          <b>{loading ? 'loading…' : 'No images yet'}</b>
          {!loading && <p>Upload images or add Pinterest pins on a room's moodboard.</p>}
          {!loading && (
            <button className="pbtn dark" type="button" onClick={() => openRoom(room ?? data[0].room.id, 'mood')}>
              Open a moodboard
            </button>
          )}
        </div>
      )}
      <div className="assets">
        {shown.map((a) => (
          <figure key={`${a.roomId}:${a.id}`} className="asset">
            <button type="button" className="asset-img" aria-label={`Open image from the ${a.roomName}`} onClick={() => setOpen(a)}>
              <img src={a.src} alt="" loading="lazy" />
            </button>
            <figcaption>
              <span className="pdot" style={{ background: a.color }} />
              <span className="nm">{a.roomName}</span>
              <small>{a.source === 'pin' ? 'pin' : 'upload'}</small>
              <button className="asset-x" type="button" aria-label="Remove image" title="Remove from the moodboard" disabled={remove.isPending} onClick={() => del(a)}>
                ×
              </button>
            </figcaption>
          </figure>
        ))}
      </div>

      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Image from the ${open.roomName}`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="lb-card">
            <img src={open.src} alt="" />
            <div className="lb-bar">
              <span className="pdot" style={{ background: open.color }} />
              <b>{open.roomName}</b>
              <small>{open.source === 'pin' ? 'Pinterest pin' : 'upload'}</small>
              <span className="sp-flex" />
              {open.link && (
                <a className="pbtn sm" href={open.link} target="_blank" rel="noreferrer">
                  Pin ↗
                </a>
              )}
              <button className="pbtn sm" type="button" disabled={remove.isPending} onClick={() => del(open)}>
                Remove
              </button>
              <button className="pbtn sm dark" type="button" onClick={() => openRoom(open.roomId, 'mood')}>
                Open moodboard
              </button>
              <button className="ibtn lb-x" type="button" aria-label="Close" onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
