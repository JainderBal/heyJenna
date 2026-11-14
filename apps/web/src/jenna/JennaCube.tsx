/**
 * jenna, the terrazzo cube: a real three.js rounded cube with eyes. Idles (hop, turn, wiggle),
 * blinks, watches the cursor, wiggles on hover, spins when dragged and flips on a tap.
 * Ported from the prototype's `jenna3d` (studio, 150 px) and `mountJenna` (home, 130 px).
 */
import { useEffect, useRef } from 'react';
import { createJenna, type JennaHandle } from './jenna3d';

export interface JennaCubeProps {
  /** Width in px; the height is size × 16/15 (the prototype's 150 × 160 box). */
  size: number;
  /** Something for jenna to do now ('flip', 'hop', 'turn', 'wiggle'); plays whenever `n` changes. */
  act?: { name: string; n: number } | null;
  /** 'studio' adds the rim light and contact shadow of the editor jenna. Default: studio at 150 px and up. */
  variant?: 'studio' | 'home';
}

export function JennaCube({ size, act, variant }: JennaCubeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const jRef = useRef<JennaHandle | null>(null);
  const height = Math.round((size * 16) / 15);
  const kind = variant ?? (size >= 150 ? 'studio' : 'home');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const j = createJenna(host, size, height, kind === 'studio');
    jRef.current = j;
    return () => {
      jRef.current = null;
      j.dispose();
    };
  }, [size, height, kind]);

  const n = act?.n;
  useEffect(() => {
    if (act) jRef.current?.play(act.name);
    // only a new `n` replays; the name alone changing is not a new act
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={hostRef}
      className="jcube3d"
      style={{ width: size, height }}
      aria-hidden="true"
      onClickCapture={(e) => {
        // a drag-to-spin is not a click (the prototype's wasDrag check)
        if (jRef.current?.wasDrag()) e.stopPropagation();
      }}
    />
  );
}
