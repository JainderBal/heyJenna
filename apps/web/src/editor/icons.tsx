/** The prototype's inline icons, as components. */
import type { ReactNode } from 'react';
import type { LayerIcon } from './model';

const s12 = { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor' } as const;

export const LAYER_ICONS: Record<LayerIcon, ReactNode> = {
  frame: <svg {...s12} strokeWidth={1.2}><path d="M4 1v10M8 1v10M1 4h10M1 8h10" /></svg>,
  img: <svg {...s12} strokeWidth={1.1}><rect x="1" y="2" width="10" height="8" rx="1" /><path d="M1.5 9l3-3 2 2 1.5-1.5 2.5 2.5" /></svg>,
  vec: <svg {...s12} strokeWidth={1.1}><path d="M2 10l1-3 5-5 2 2-5 5z" /></svg>,
  text: <svg {...s12} strokeWidth={1.3}><path d="M2 2.5h8M6 2.5v8" /></svg>,
  plan: <svg {...s12} strokeWidth={1.2}><rect x="1" y="1" width="10" height="10" /><path d="M7 1v5h4M4 11V8" /></svg>,
  rect: <svg {...s12} strokeWidth={1.2}><rect x="1.5" y="2.5" width="9" height="7" rx="1" /></svg>,
};

export const Twisty = () => (
  <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2.5 1.5l3 2.5-3 2.5z" fill="currentColor" /></svg>
);

export const Logo = () => (
  <svg className="logo" viewBox="0 0 28 28" aria-label="hey jenna">
    <rect x="2" y="2" width="24" height="24" rx="7" fill="#F4EEE7" stroke="#1E1E1E" strokeWidth="1.5" />
    <rect x="6" y="7" width="3" height="2" fill="#2E8B7A" />
    <rect x="18" y="18" width="3" height="2" fill="#E8A0B8" />
    <rect x="19" y="7" width="2" height="3" fill="#B9A4D9" />
    <rect x="10.5" y="11" width="2" height="5" rx="1" fill="#1E1E1E" />
    <rect x="15.5" y="11" width="2" height="5" rx="1" fill="#1E1E1E" />
  </svg>
);

export const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M7 1.5a4 4 0 0 1 4 4c0 2.6-2.2 3.7-4 3.7" /><path d="M7 9.2 5.8 12.5" /><path d="M7 1.5a4 4 0 0 0-4 4c0 1 .3 1.8.9 2.4" />
  </svg>
);

export const JennaFace = () => (
  <svg width="14" height="14" viewBox="0 0 28 28">
    <rect x="2.5" y="2.5" width="23" height="23" rx="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
    <rect x="10" y="10" width="2.8" height="8" rx="1.4" fill="currentColor" />
    <rect x="15.2" y="10" width="2.8" height="8" rx="1.4" fill="currentColor" />
  </svg>
);

export const Bag = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M2 4h10l-1 8H3z" /><path d="M5 4V3a2 2 0 0 1 4 0v1" />
  </svg>
);

export const Plus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M7 2v10M2 7h10" /></svg>
);

export const Search = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6" cy="6" r="4" /><path d="M9 9l3.5 3.5" /></svg>
);

export const PlanDrop = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#1E1E1E" strokeWidth="1.6"><rect x="6" y="6" width="32" height="32" rx="2" /><path d="M24 6v18h14M14 38v-9" /></svg>
);

export const ArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 8H3M7 4 3 8l4 4" /></svg>
);
export const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
export const ExternalLink = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 1.5h5.5V7M8.5 1.5 2 8" /></svg>
);
