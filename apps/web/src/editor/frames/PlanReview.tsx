/**
 * The floor-plan read, reviewed on the plan itself: the uploaded image with every room jenna found outlined
 * on it (the reader's box for each room). Rooms jenna will furnish are outlined in colour and toggle on click;
 * the rest stay on the plan only, outlined in grey. Hover or tap a room for its name, size and notes.
 * Without the image (or boxes) the rooms are drawn to scale from their plan positions instead.
 */
import { useState } from 'react';
import { canFurnish, type DetectedRoom } from '../../api/types';

const KIND_LABEL: Record<string, string> = {
  bedroom: 'bedroom', bathroom: 'bathroom', kitchen: 'kitchen', dining: 'dining room', laundry: 'laundry',
  closet: 'closet', storage: 'storage', hallway: 'hall', entry: 'entry', balcony: 'balcony',
  living: 'living room', office: 'office', other: 'room',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
/** The main rooms people care about; the rest are summed up as smaller spaces. */
const MAIN_KINDS = ['bedroom', 'kitchen', 'dining', 'bathroom', 'living', 'office'];
/** Bilingual labels ("Salon / Living Room") shown by their first half where space is short. */
export const shortName = (name: string) => name.split(' / ')[0];

/** "2 bedrooms, kitchen, dining room, bathroom and 9 smaller spaces" */
function kindsSummary(rooms: DetectedRoom[]): string {
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const parts = MAIN_KINDS.filter((k) => counts.has(k)).map((k) => (counts.get(k)! > 1 ? `${counts.get(k)} ${kindLabel(k)}s` : kindLabel(k)));
  const small = rooms.filter((r) => !MAIN_KINDS.includes(r.kind)).length;
  if (small) parts.push(small > 1 ? `${small} smaller spaces` : 'a smaller space');
  return parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
}

function describe(r: DetectedRoom): string {
  const size = `${r.floorPlan.width} × ${r.floorPlan.depth} m${r.printedSize ? ` (printed ${r.printedSize})` : ''}`;
  const open = Object.values(r.floorPlan.walls ?? {}).some((w) => w?.open) ? ' · open-plan' : '';
  const role = r.furnish
    ? 'jenna will furnish it (click to skip)'
    : canFurnish(r.kind)
      ? 'on the plan only (click to furnish)'
      : `on the plan only: jenna can't furnish ${kindLabel(r.kind)}s yet`;
  return `${r.name} · ${size}${open} · ${role}${r.confidence < 0.6 ? ' · jenna is unsure of this one' : ''}`;
}

interface Props {
  image?: string;
  rooms: DetectedRoom[];
  warnings: string[];
  busy: boolean;
  creating: boolean;
  onToggle(index: number): void;
  onCreate(): void;
  onCancel(): void;
}

export function PlanReview({ image, rooms, warnings, busy, creating, onToggle, onCreate, onCancel }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const furnished = rooms.filter((r) => r.furnish);
  const planOnly = rooms.filter((r) => !r.furnish);
  const onImage = !!image && rooms.some((r) => r.box);

  const click = (i: number) => (canFurnish(rooms[i].kind) && !busy ? onToggle(i) : setHover(i));
  const roomProps = (i: number) => ({
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover((h) => (h === i ? null : h)),
    onClick: () => click(i),
    'aria-label': describe(rooms[i]),
  });

  return (
    <div className="review">
      <div className="review-h">
        <h3>{rooms.length} rooms found</h3>
        <span className="legend">
          <i className="sw on" /> furnished <i className="sw off" /> plan only
        </span>
      </div>

      <div className="review-fig">
        {onImage ? (
          <div className="review-img" style={{ aspectRatio: ratio ?? undefined }}>
            <img
              src={image}
              alt="Your floor plan, with the rooms jenna found outlined"
              onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            />
            {rooms.map((r, i) =>
              r.box ? (
                <button
                  key={i}
                  type="button"
                  className={`rbox${r.furnish ? ' on' : ''}${r.confidence < 0.6 ? ' unsure' : ''}${hover === i ? ' hot' : ''}`}
                  style={{
                    left: `${r.box.left * 100}%`,
                    top: `${r.box.top * 100}%`,
                    width: `${(r.box.right - r.box.left) * 100}%`,
                    height: `${(r.box.bottom - r.box.top) * 100}%`,
                  }}
                  {...roomProps(i)}
                >
                  {r.furnish && <span>{shortName(r.name)}</span>}
                </button>
              ) : null,
            )}
          </div>
        ) : (
          <Schematic rooms={rooms} hover={hover} roomProps={roomProps} />
        )}
      </div>

      <p className="review-info" aria-live="polite">
        {hover !== null ? (
          describe(rooms[hover])
        ) : (
          <>
            {furnished.length ? (
              <>
                jenna will furnish <b>{furnished.map((r) => r.name).join(', ')}</b>.{' '}
              </>
            ) : (
              <>Nothing to furnish yet. </>
            )}
            {planOnly.length > 0 && <>The {kindsSummary(planOnly)} stay on the plan for now.</>}
          </>
        )}
      </p>

      {warnings.length > 0 && (
        <details className="review-notes">
          <summary>{warnings.length} notes from reading the plan</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="acts">
        <button className="pbtn dark" type="button" disabled={busy} onClick={onCreate}>
          {creating ? 'Creating…' : `Create ${rooms.length} rooms`}
        </button>
        <button className="pbtn" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** No image to draw on: the rooms to scale from where the reader placed them. */
function Schematic({ rooms, hover, roomProps }: { rooms: DetectedRoom[]; hover: number | null; roomProps: (i: number) => object }) {
  const R = rooms.map((r) => ({ x: r.position.x, y: r.position.y, w: r.floorPlan.width, d: r.floorPlan.depth }));
  const minX = Math.min(...R.map((p) => p.x));
  const minY = Math.min(...R.map((p) => p.y));
  const W = Math.max(...R.map((p) => p.x + p.w)) - minX;
  const H = Math.max(...R.map((p) => p.y + p.d)) - minY;
  return (
    <svg className="review-svg" viewBox={`${minX - 0.2} ${minY - 0.2} ${W + 0.4} ${H + 0.4}`} preserveAspectRatio="xMidYMid meet">
      {rooms.map((r, i) => (
        <g key={i} className={`rshape${r.furnish ? ' on' : ''}${hover === i ? ' hot' : ''}`} {...roomProps(i)}>
          <rect x={R[i].x} y={R[i].y} width={R[i].w} height={R[i].d} vectorEffect="non-scaling-stroke" />
          {R[i].w > 0.9 && R[i].d > 0.5 && (
            <text x={R[i].x + R[i].w / 2} y={R[i].y + R[i].d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(r.furnish ? 0.35 : 0.26, R[i].w / 7)}>
              {shortName(r.name)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
