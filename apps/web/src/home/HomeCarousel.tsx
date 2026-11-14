/**
 * The project carousel: the prototype's curved WebGL carousel (startHome() in
 * saas-ui/hey-jenna-app.html). Home owns the index and the prev/next buttons; the carousel animates
 * to `index`, reports drags/clicks/idle drift through `onIndexChange`, and renders `children`
 * (the caption) under the centred card inside its `.hv-stage`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createCarousel, type Carousel } from './carousel3d';

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
  const stageRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Carousel | null>(null);
  const [noGL, setNoGL] = useState(false);
  const latest = useRef({ cards, onIndexChange, onOpen, onNew });
  latest.current = { cards, onIndexChange, onOpen, onNew };
  const startIndex = useRef(index);

  // Only rebuild textures when what is drawn changes (ids, palettes, which one is "+").
  const cardsKey = useMemo(() => cards.map((c) => `${c.id}:${c.isNew ? '+' : c.palette.join(',')}`).join('|'), [cards]);

  useEffect(() => {
    const stage = stageRef.current;
    const cap = capRef.current;
    if (!stage || !cap) return;
    const c = createCarousel(stage, cap, startIndex.current, {
      index: (i) => latest.current.onIndexChange(i),
      open: (i) => {
        const card = latest.current.cards[i];
        if (!card) return;
        if (card.isNew) latest.current.onNew();
        else latest.current.onOpen(card);
      },
    });
    if (!c) {
      setNoGL(true);
      return;
    }
    engine.current = c;
    return () => {
      engine.current = null;
      c.dispose();
    };
  }, []);

  useEffect(() => {
    engine.current?.setCards(latest.current.cards);
  }, [cardsKey]);

  useEffect(() => {
    engine.current?.goTo(index);
  }, [index, cardsKey]);

  return (
    <div
      ref={stageRef}
      className="hv-stage"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Projects"
    >
      {noGL && <p className="hv-nogl">The carousel needs WebGL.</p>}
      <div ref={capRef} className="hv-capbox">
        {children}
      </div>
    </div>
  );
}
