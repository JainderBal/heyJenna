/**
 * STUB: jenna, the terrazzo cube. Another agent replaces this with the real three.js cube from the
 * prototype (idle, blink, watch the cursor, hop, spin on drag). Keep the props.
 */
export interface JennaCubeProps {
  /** Width in px; the height is size × 16/15 (the prototype's 150 × 160 box). */
  size: number;
  /** Something for jenna to do now ('flip', 'hop'…). The real cube animates it; the stub ignores it. */
  act?: { name: string; n: number } | null;
}

export function JennaCube({ size }: JennaCubeProps) {
  return (
    <div className="jcube" style={{ width: size, height: Math.round((size * 16) / 15) }} aria-hidden="true">
      <svg viewBox="0 0 28 28">
        <rect x="2" y="2" width="24" height="24" rx="8" fill="#F4EEE7" stroke="#1E1E1E" strokeWidth="1.2" />
        <rect x="6" y="7" width="3" height="2" fill="#2E8B7A" />
        <rect x="18" y="18" width="3" height="2" fill="#E8A0B8" />
        <rect x="19" y="7" width="2" height="3" fill="#B9A4D9" />
        <rect x="7" y="19" width="2" height="2" fill="#E8955A" />
        <rect x="10.5" y="10" width="2.4" height="6" rx="1.2" fill="#1E1E1E" />
        <rect x="15.5" y="10" width="2.4" height="6" rx="1.2" fill="#1E1E1E" />
      </svg>
    </div>
  );
}
