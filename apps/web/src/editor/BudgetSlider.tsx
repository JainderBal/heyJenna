/**
 * Each room's own furniture budget. It is set before the room is built: until it is, the room's
 * "Find products and lay out" step stays locked. The slider covers $100–$15,000; the number box takes
 * any whole dollar from $50 up. A change is saved after a short pause; search and layout are not re-run.
 */
import { useEffect, useRef, useState } from 'react';
import type { RoomKind } from '@hey-jenna/contracts';
import { errorText } from '../api/client';
import { usePatchRoom } from '../api/hooks';
import type { Room } from '../api/types';
import { toast } from '../app/useEditorStore';
import { money } from './model';

const MIN = 100;
const MAX = 15_000;
const STEP = 50;
const LOWEST = 50;
const SAVE_AFTER_MS = 600;

/** A starting point per m² by kind (CAD, IKEA prices), so the slider opens somewhere sensible. */
const PER_M2: Partial<Record<RoomKind, number>> = {
  living: 220, office: 180, bedroom: 170, dining: 160, kitchen: 60, bathroom: 60,
  hallway: 70, entry: 80, closet: 80, storage: 40, laundry: 40, balcony: 90, other: 150,
};

/** What the slider suggests before the person picks: area × a per-kind rate, rounded to $50, kept in range. */
export function suggestedBudget(room: Pick<Room, 'kind' | 'areaM2'>): number {
  const rate = PER_M2[room.kind ?? 'living'] ?? 150;
  const raw = Math.round((room.areaM2 * rate) / STEP) * STEP;
  return Math.min(MAX, Math.max(MIN * 3, raw));
}

const onTrack = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP));

/** A whole dollar from the box, or null when it's empty, not whole, or below $50. */
function parsed(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= LOWEST && n <= 1_000_000 ? n : null;
}

export function RoomBudget({ room, projectId, spent, compact }: { room: Room; projectId: string; spent?: number | null; compact?: boolean }) {
  const patch = usePatchRoom(projectId);
  const stored = room.budgetCad;
  const start = stored ?? suggestedBudget(room);
  const [text, setText] = useState(String(start));
  const [slider, setSlider] = useState(onTrack(start));
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // the stored budget changed elsewhere (another frame, the floor plan list): show it unless a save is waiting
  useEffect(() => {
    if (pending.current != null) return;
    const n = stored ?? suggestedBudget(room);
    setText(String(n));
    setSlider(onTrack(n));
  }, [stored, room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (n: number) => {
    pending.current = n;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = pending.current;
      if (next == null || next === stored) {
        pending.current = null;
        return;
      }
      patch.mutate(
        { roomId: room.id, patch: { budgetCad: next } },
        {
          onSettled: () => {
            if (pending.current === next) pending.current = null;
          },
          onError: (e) => toast(`Budget not saved: ${errorText(e)}`),
        },
      );
    }, SAVE_AFTER_MS);
  };
  // leaving the page saves a change that was still waiting
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const next = pending.current;
      if (next != null && next !== stored) patch.mutate({ roomId: room.id, patch: { budgetCad: next } });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const amount = parsed(text);
  const set = stored != null;
  let detail: string;
  if (amount == null) detail = `Enter a whole amount from ${money(LOWEST, 'CAD')}.`;
  else if (!set) detail = `Set ${room.name}’s budget before jenna builds it (suggested for ${room.areaM2.toFixed(0)} m²).`;
  else if (spent != null && spent > 0) detail = `${money(spent, 'CAD')} planned of ${money(stored, 'CAD')}${spent > stored + 0.5 ? ' · over budget' : ''}`;
  else detail = `jenna keeps ${room.name}’s picks inside ${money(stored, 'CAD')}.`;

  return (
    <div className={`budget${set ? '' : ' unset'}${compact ? ' compact' : ''}`} data-own-pointer data-own-wheel>
      {!compact && <h5>Room budget</h5>}
      <div className="budget-row">
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={slider}
          aria-label={`${room.name} budget slider`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = Number(e.target.value);
            setSlider(n);
            setText(String(n));
            save(n);
          }}
        />
        <input
          type="number"
          inputMode="numeric"
          min={LOWEST}
          step={1}
          value={text}
          aria-label={`${room.name} budget`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setText(e.target.value);
            const n = parsed(e.target.value);
            if (n == null) {
              clearTimeout(timer.current);
              pending.current = null;
              return;
            }
            setSlider(onTrack(n));
            save(n);
          }}
        />
        {!set && amount != null && (
          <button className="pbtn sm dark" type="button" disabled={patch.isPending} onClick={() => patch.mutate({ roomId: room.id, patch: { budgetCad: amount } }, { onError: (e) => toast(`Budget not saved: ${errorText(e)}`) })}>
            Set {money(amount, 'CAD')}
          </button>
        )}
      </div>
      {!compact || !set || amount == null ? <p>{detail}</p> : null}
    </div>
  );
}
