/**
 * The infinite canvas: pan (drag empty space, space+drag, middle button, two-finger scroll),
 * zoom (ctrl/⌘ + wheel, pinch; two fingers on a touch screen), drag frames (one finger pans instead), and animated focus/fit like the prototype's
 * focusOn()/fit(). The view lives in a ref and is written straight to the DOM so panning doesn't
 * re-render the frames.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { frameOfSel, posKey, useEditorStore } from '../app/useEditorStore';
import type { Frame } from './model';

interface View {
  x: number;
  y: number;
  z: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Elements inside a frame that keep their own pointer handling (no frame drag). */
const OWN_POINTER = 'button, a, input, textarea, select, label, form, .viewer, [data-own-pointer]';
/** Elements whose wheel events scroll or zoom themselves. */
const OWN_WHEEL = '.viewer, [data-own-wheel]';
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface CanvasProps {
  frames: Frame[];
  body: (f: Frame) => ReactNode;
  /** Overlays inside the stage (dock, toast, jenna…). */
  children?: ReactNode;
  onFrameClick?: (f: Frame) => void;
}

export function Canvas({ frames, body, children, onFrameClick }: CanvasProps) {
  const stage = useRef<HTMLElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 60, y: 60, z: 0.5 });
  const anim = useRef(0);
  const space = useRef(false);

  const projectId = useEditorStore((s) => s.projectId);
  const page = useEditorStore((s) => s.page);
  const sel = useEditorStore((s) => s.sel);
  const pos = useEditorStore((s) => s.pos);
  const focus = useEditorStore((s) => s.focus);
  const select = useEditorStore((s) => s.select);
  const moveFrame = useEditorStore((s) => s.moveFrame);

  const placed = frames.map((f) => ({ ...f, ...(pos[posKey(projectId, page, f.id)] ?? {}) }));
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const selFrame = sel ? frameOfSel(sel) : null;

  const apply = useCallback(() => {
    const v = view.current;
    if (world.current) world.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
  }, []);

  const focusOn = useCallback(
    (b: Box, instant?: boolean) => {
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const narrow = r.width < 600; // phones: less margin, the frames are small enough already
      const z = Math.min((r.width - (narrow ? 32 : 140)) / b.w, (r.height - 220) / b.h, 1);
      const to: View = { z, x: (r.width - b.w * z) / 2 - b.x * z, y: Math.max(110, Math.min((r.height - b.h * z) / 2 + 30, 150)) - b.y * z };
      cancelAnimationFrame(anim.current);
      if (instant || reduceMotion()) {
        view.current = to;
        apply();
        return;
      }
      const from = { ...view.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - t0) / 420));
        const e = easeInOutCubic(t);
        view.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
        apply();
        if (t < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply],
  );

  const fit = useCallback(
    (instant?: boolean) => {
      const F = placedRef.current;
      if (!F.length) return;
      const minX = Math.min(...F.map((f) => f.x));
      const minY = Math.min(...F.map((f) => f.y));
      const maxX = Math.max(...F.map((f) => f.x + f.w));
      const maxY = Math.max(...F.map((f) => f.y + f.h));
      focusOn({ x: minX - 30, y: minY - 30, w: maxX - minX + 60, h: maxY - minY + 60 }, instant);
    },
    [focusOn],
  );

  // focus requests from the store (page change, layer click, …)
  useEffect(() => {
    if (!focus) return;
    const run = () => {
      if (focus.target === 'fit') return fit(focus.instant);
      const f = placedRef.current.find((x) => x.id === frameOfSel(focus.target));
      if (f) focusOn({ x: f.x - 40, y: f.y - 40, w: f.w + 80, h: f.h + 80 }, focus.instant);
      else fit(focus.instant);
    };
    const raf = requestAnimationFrame(run); // after layout, so the stage has its size
    return () => cancelAnimationFrame(raf);
    // frames.length: a page whose frames arrive later (rooms loading) still gets its fit
  }, [focus, frames.length, fit, focusOn]);

  useEffect(apply, [apply]);

  // wheel: pan, or zoom around the cursor with ctrl/⌘ (also trackpad pinch)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest(OWN_WHEEL)) return;
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const v = view.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const nz = Math.min(4, Math.max(0.1, v.z * Math.exp(-e.deltaY * 0.01)));
        view.current = { x: mx - ((mx - v.x) * nz) / v.z, y: my - ((my - v.y) * nz) / v.z, z: nz };
      } else view.current = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      apply();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [apply]);

  // space to pan, escape to deselect
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,[contenteditable]')) return;
      if (e.code === 'Space') {
        space.current = true;
        stage.current?.classList.add('space');
        e.preventDefault();
      }
      if (e.key === 'Escape') useEditorStore.getState().select(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        stage.current?.classList.remove('space');
      }
    };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
    };
  }, []);

  const drag = useRef<null | { type: 'pan'; sx: number; sy: number; vx: number; vy: number } | { type: 'move'; sx: number; sy: number; fx: number; fy: number; id: string; el: HTMLElement; moved: boolean }>(null);

  /** Touch points down on the stage, for two-finger pinch zoom. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<null | { d: number; z: number; mx: number; my: number; vx: number; vy: number }>(null);

  function startPinch() {
    const [a, b] = [...touches.current.values()];
    const r = stage.current!.getBoundingClientRect();
    const v = view.current;
    drag.current = null;
    pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: v.z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, vx: v.x, vy: v.y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('[data-overlay]')) return; // dock, jenna, toast…
    const touch = e.pointerType === 'touch';
    if (touch && !t.closest('.viewer')) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        cancelAnimationFrame(anim.current);
        startPinch();
        stage.current?.setPointerCapture(e.pointerId);
        return;
      }
    }
    const fr = t.closest<HTMLElement>('.frame');
    // on a touch screen one finger pans everywhere (a frame is selected, not dragged)
    const panning = space.current || e.button === 1 || !fr || (touch && !t.closest(OWN_POINTER));
    if (fr && panning && touch) {
      const f = placedRef.current.find((x) => x.id === fr.dataset.id);
      if (f && useEditorStore.getState().sel !== f.id) select(f.id);
      if (f) onFrameClick?.(f);
    }
    if (panning) {
      if (fr && touch) {
        cancelAnimationFrame(anim.current);
        drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y };
        stage.current?.setPointerCapture(e.pointerId);
        return;
      }
      if (!fr && !space.current && e.button === 0 && useEditorStore.getState().sel) select(null);
      cancelAnimationFrame(anim.current);
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.current.x, vy: view.current.y };
      stage.current?.classList.add('panning');
      stage.current?.setPointerCapture(e.pointerId);
      return;
    }
    const f = placedRef.current.find((x) => x.id === fr.dataset.id);
    if (!f) return;
    if (useEditorStore.getState().sel !== f.id) select(f.id);
    onFrameClick?.(f);
    if (t.closest(OWN_POINTER) || e.button !== 0) return;
    drag.current = { type: 'move', sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y, id: f.id, el: fr, moved: false };
    stage.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      const r = stage.current!.getBoundingClientRect();
      const nz = Math.min(4, Math.max(0.1, (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / p.d));
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      // keep the world point under the pinch centre under the fingers
      view.current = { z: nz, x: mx - ((p.mx - p.vx) * nz) / p.z, y: my - ((p.my - p.vy) * nz) / p.z };
      apply();
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.type === 'pan') {
      view.current = { ...view.current, x: d.vx + dx, y: d.vy + dy };
      apply();
    } else {
      d.moved = true;
      d.el.style.left = Math.round(d.fx + dx / view.current.z) + 'px';
      d.el.style.top = Math.round(d.fy + dy / view.current.z) + 'px';
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    stage.current?.classList.remove('panning');
    if (d?.type === 'move' && d.moved) moveFrame(d.id, Math.round(d.fx + (e.clientX - d.sx) / view.current.z), Math.round(d.fy + (e.clientY - d.sy) / view.current.z));
  }

  return (
    <main className="stage" ref={stage} aria-label="Canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="world" ref={world}>
        {placed.map((f) => (
          <div key={f.id} className={`frame${selFrame === f.id ? ' on' : ''}`} data-id={f.id} style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
            <div className="frame-label">{f.name}</div>
            <div className="frame-body">{body(f)}</div>
            <div className="sel">
              <i />
              <i />
              <i />
              <i />
              <div className="dims">
                {f.w} × {f.h}
              </div>
            </div>
          </div>
        ))}
      </div>
      {children}
    </main>
  );
}
