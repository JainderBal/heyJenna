/**
 * STUB: the project carousel. Another agent replaces this with the prototype's curved WebGL
 * carousel (startHome() in saas-ui/hey-jenna-app.html). Keep the props: Home owns the index and the
 * prev/next buttons; the carousel animates to `index`, reports drags/clicks through
 * `onIndexChange`, and renders `children` (the caption) inside its `.hv-stage`.
 */
import type { ReactNode } from 'react';

export interface HomeCard {
  /** Project id, or 'new' for the "+" card (always first). */
  id: string;
  name: string;
  kind: string;
  /** Colours for the cover (the project's palette). */
  palette: string[];
  isNew?: boolean;
}

export interface HomeCarouselProps {
  cards: HomeCard[];
  /** The centred card. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Open a project card (the centred one was clicked, or Enter). */
  onOpen: (card: HomeCard) => void;
  /** The "+" card was clicked while centred. */
  onNew: () => void;
  /** Caption for the centred card, placed under it. */
  children?: ReactNode;
}

export function HomeCarousel({ cards, index, onIndexChange, onOpen, onNew, children }: HomeCarouselProps) {
  return (
    <div className="hv-stage stub" role="region" aria-roledescription="carousel" aria-label="Projects">
      <div className="hv-row">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`hv-card${i === index ? ' on' : ''}`}
            aria-label={c.isNew ? 'New project' : c.name}
            onClick={() => (i !== index ? onIndexChange(i) : c.isNew ? onNew() : onOpen(c))}
          >
            {c.isNew ? (
              <span className="plus">+</span>
            ) : (
              <span className="sw">
                {c.palette.slice(0, 6).map((col, k) => (
                  <i key={k} style={{ background: col }} />
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
