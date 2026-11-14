/**
 * The home's furniture budget. The top of the slider is "No limit" (stored as null).
 * A number is saved on the project after a short pause; search and layout are not re-run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorText } from '../api/client';
import { usePatchProject, useProject, useProjectSpend } from '../api/hooks';
import type { Room } from '../api/types';
import { toast } from '../app/useEditorStore';
import { money } from './model';

const MIN = 1000;
const MAX = 60_000;
const STEP = 500;
const SAVE_AFTER_MS = 600;

function sliderValue(budget: number | null | undefined): number {
  if (budget == null) return MAX;
  const stepped = Math.round(budget / STEP) * STEP;
  return Math.min(Math.max(stepped, MIN), MAX - STEP);
}

/** Same split as the API: budget × this room's floor area ÷ the home's floor area. */
export function roomShare(budget: number, roomId: string, rooms: Room[]): number {
  const area = (r: Room) => Math.max(0, r.floorPlan.width * r.floorPlan.depth);
  const total = rooms.reduce((s, r) => s + area(r), 0);
  const mine = rooms.find((r) => r.id === roomId);
  if (total > 0) return budget * (mine ? area(mine) : 0) / total;
  return rooms.length ? budget / rooms.length : budget;
}

export function BudgetSlider({ projectId, rooms, roomId }: { projectId: string; rooms: Room[]; roomId?: string }) {
  const project = useProject(projectId);
  const patch = usePatchProject(projectId);
  const budgetCad = project.data?.budgetCad;
  const ids = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const spent = useProjectSpend(ids);
  const [value, setValue] = useState(() => sliderValue(budgetCad));
  const dirty = useRef(false);
  const valueRef = useRef(value);
  const budgetRef = useRef(budgetCad);
  valueRef.current = value;
  budgetRef.current = budgetCad;

  useEffect(() => {
    if (!dirty.current && project.data) setValue(sliderValue(budgetCad));
  }, [budgetCad, project.data]);

  const save = (v: number) => {
    const next = v >= MAX ? null : v;
    const current = budgetRef.current ?? null;
    dirty.current = false;
    if (next === current) return;
    patch.mutate({ budgetCad: next }, { onError: (e) => toast(`Budget not saved: ${errorText(e)}`) });
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => saveRef.current(valueRef.current), SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => () => {
    if (dirty.current) saveRef.current(valueRef.current);
  }, []);

  const limited = value < MAX;
  const home = limited ? `${money(value, 'CAD')} for the home` : 'No limit';
  let detail = 'Drag to set a furniture budget for the whole home.';
  if (limited && roomId) {
    const share = Math.round(roomShare(value, roomId, rooms));
    const others = Math.round(ids.filter((id) => id !== roomId).reduce((s, id) => s + (spent[id] ?? 0), 0));
    detail = `${home} · this room ${money(share, 'CAD')} · other rooms ${money(others, 'CAD')}`;
  } else if (limited) {
    const planned = Math.round(ids.reduce((s, id) => s + (spent[id] ?? 0), 0));
    detail = planned > 0 ? `${home} · ${money(planned, 'CAD')} already planned` : home;
  }

  return (
    <div className="budget" data-own-pointer>
      <div className="budget-row">
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={value}
          aria-label="Home budget"
          disabled={!project.data}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            dirty.current = true;
            setValue(Number(e.target.value));
          }}
        />
        <output>{limited ? money(value, 'CAD') : 'No limit'}</output>
      </div>
      <p>{detail}</p>
    </div>
  );
}
