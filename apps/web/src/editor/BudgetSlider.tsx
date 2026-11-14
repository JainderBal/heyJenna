/**
 * The home's furniture budget. The slider and the number box cover $1,000–$10,000.
 * No limit is a separate checkbox (stored as null). A change is saved after a short pause;
 * search and layout are not re-run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorText } from '../api/client';
import { usePatchProject, useProject, useProjectSpend } from '../api/hooks';
import type { Room } from '../api/types';
import { toast } from '../app/useEditorStore';
import { money } from './model';

const MIN = 1000;
const MAX = 10_000;
const STEP = 100;
const DEFAULT_AMOUNT = 5_000;
const SAVE_AFTER_MS = 600;

/** Slider thumb: an in-range amount on a step, otherwise the nearest end of the track. */
function sliderPos(n: number): number {
  if (n <= MIN) return MIN;
  if (n >= MAX) return MAX;
  return Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP));
}

const shown = (n: number) => String(n);

/** A whole dollar from the box, or null when it is empty or not a whole dollar. */
function parsed(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Amount to keep. In range, or exactly the number already stored (so a budget outside
 * $1,000–$10,000 is left alone until the person moves a control).
 */
function acceptable(text: string, stored: number | null | undefined): number | null {
  const n = parsed(text);
  if (n == null) return null;
  if (n >= MIN && n <= MAX) return n;
  if (stored != null && n === stored) return n;
  return null;
}

/** Same split as the API: budget × this room's floor area ÷ the home's floor area. */
export function roomShare(budget: number, roomId: string, rooms: Room[]): number {
  const area = (r: Room) => Math.max(0, r.floorPlan.width * r.floorPlan.depth);
  const total = rooms.reduce((s, r) => s + area(r), 0);
  const mine = rooms.find((r) => r.id === roomId);
  if (total > 0) return (budget * (mine ? area(mine) : 0)) / total;
  return rooms.length ? budget / rooms.length : budget;
}

export function BudgetSlider({ projectId, rooms, roomId }: { projectId: string; rooms: Room[]; roomId?: string }) {
  const project = useProject(projectId);
  const patch = usePatchProject(projectId);
  const budgetCad = project.data?.budgetCad;
  const ids = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const spent = useProjectSpend(ids);

  const [unlimited, setUnlimited] = useState(budgetCad == null);
  const [text, setText] = useState(budgetCad == null ? '' : shown(budgetCad));
  const [slider, setSlider] = useState(sliderPos(budgetCad ?? DEFAULT_AMOUNT));
  const [rev, setRev] = useState(0);
  const [resetKey, setResetKey] = useState(0);

  const dirty = useRef(false);
  const pending = useRef<number | null | undefined>(undefined);
  const textRef = useRef(text);
  const unlimitedRef = useRef(unlimited);
  textRef.current = text;
  unlimitedRef.current = unlimited;
  /** Last numeric budget, so unchecking No limit can put it back. Null when the home was already unlimited. */
  const restore = useRef<number | null>(budgetCad ?? null);
  const budgetRef = useRef(budgetCad);
  budgetRef.current = budgetCad;

  const apply = (budget: number | null | undefined) => {
    if (budget == null) {
      setUnlimited(true);
      setSlider(sliderPos(restore.current ?? DEFAULT_AMOUNT));
      setText(restore.current == null ? '' : shown(restore.current));
      return;
    }
    setUnlimited(false);
    setText(shown(budget));
    setSlider(sliderPos(budget));
    restore.current = budget;
  };

  useEffect(() => {
    if (dirty.current || !project.data) return;
    // Keep an out-of-range draft on screen. It is not written until it is valid.
    if (!unlimitedRef.current && acceptable(textRef.current, budgetCad) == null) return;
    apply(budgetCad);
  }, [budgetCad, project.data, resetKey]);

  const save = (next: number | null) => {
    const current = budgetRef.current ?? null;
    if (next === current) {
      if (pending.current === next) {
        dirty.current = false;
        pending.current = undefined;
      }
      return;
    }
    patch.mutate(
      { budgetCad: next },
      {
        onSuccess: () => {
          if (pending.current === next) {
            dirty.current = false;
            pending.current = undefined;
          }
        },
        onError: (e) => {
          toast(`Budget not saved: ${errorText(e)}`);
          if (pending.current === next) {
            dirty.current = false;
            pending.current = undefined;
            setResetKey((k) => k + 1);
          }
        },
      },
    );
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const queue = (next: number | null) => {
    pending.current = next;
    dirty.current = true;
    setRev((r) => r + 1);
  };

  /** Drop a save that was waiting, so an out-of-range amount is not written. */
  const cancel = () => {
    pending.current = undefined;
    dirty.current = false;
    setRev((r) => r + 1);
  };

  useEffect(() => {
    if (!dirty.current || pending.current === undefined) return;
    const next = pending.current;
    const t = setTimeout(() => saveRef.current(next), SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [rev]);

  useEffect(() => () => {
    if (dirty.current && pending.current !== undefined) saveRef.current(pending.current);
  }, []);

  const amount = unlimited ? null : acceptable(text, budgetCad);
  const showError = !unlimited && amount == null;

  let detail: string | null = null;
  if (showError) detail = 'Enter an amount between $1,000 and $10,000.';
  else if (amount != null) {
    const home = `${money(amount, 'CAD')} for the home`;
    if (roomId) {
      const share = Math.round(roomShare(amount, roomId, rooms));
      const others = Math.round(ids.filter((id) => id !== roomId).reduce((s, id) => s + (spent[id] ?? 0), 0));
      detail = `${home} · this room ${money(share, 'CAD')} · other rooms ${money(others, 'CAD')}`;
    } else {
      const planned = Math.round(ids.reduce((s, id) => s + (spent[id] ?? 0), 0));
      detail = planned > 0 ? `${home} · ${money(planned, 'CAD')} already planned` : home;
    }
  }

  const ready = !!project.data;

  return (
    <div className="budget" data-own-pointer data-own-wheel>
      <div className="budget-row">
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={slider}
          aria-label="Home budget slider"
          disabled={!ready || unlimited}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = Number(e.target.value);
            setUnlimited(false);
            setSlider(n);
            setText(String(n));
            restore.current = n;
            queue(n);
          }}
        />
        <input
          type="number"
          inputMode="numeric"
          min={MIN}
          max={MAX}
          step={1}
          value={text}
          aria-label="Home budget"
          disabled={!ready || unlimited}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const n = acceptable(next, budgetRef.current);
            if (n == null || n < MIN || n > MAX) {
              cancel();
              return;
            }
            setSlider(sliderPos(n));
            restore.current = n;
            queue(n);
          }}
        />
        <label className="budget-check">
          <input
            type="checkbox"
            checked={unlimited}
            disabled={!ready}
            onChange={(e) => {
              if (e.target.checked) {
                setUnlimited(true);
                queue(null);
                return;
              }
              const n = restore.current ?? DEFAULT_AMOUNT;
              setUnlimited(false);
              setText(shown(n));
              setSlider(sliderPos(n));
              restore.current = n;
              queue(n);
            }}
          />
          No limit
        </label>
      </div>
      {detail && <p>{detail}</p>}
    </div>
  );
}
