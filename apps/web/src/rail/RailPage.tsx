/**
 * The left rail's project pages (Share, Assets, Sellers, Styles). They take the canvas's place in the
 * editor (URL ?view=share|assets|sellers|styles) and read every room of the project at once.
 */
import { useMemo, type ReactNode } from 'react';
import { useProjectRoomData } from '../api/hooks';
import { errorText } from '../api/client';
import type { MoodboardImage, Project, Room, StyleResponse } from '../api/types';
import { roomPalette } from '../editor/model';
import { roomItems, type ProjectItem } from './railData';
import { SharePage } from './SharePage';
import { AssetsPage } from './AssetsPage';
import { SellersPage } from './SellersPage';
import { StylesPage } from './StylesPage';

export const RAIL_VIEWS = ['share', 'assets', 'sellers', 'styles'] as const;
export type RailView = (typeof RAIL_VIEWS)[number];
export const asRailView = (v: string | null): RailView | null => (RAIL_VIEWS as readonly string[]).includes(v ?? '') ? (v as RailView) : null;

export type BoardImage = MoodboardImage & { src: string };

/** One room with everything the rail pages show about it. */
export interface RoomView {
  room: Room;
  color: string;
  palette: string[];
  style: StyleResponse | null | undefined;
  images: BoardImage[];
  items: ProjectItem[];
  /** The newest layout has been made (the list is the layout's, not just picked products). */
  laidOut: boolean;
}

export interface RailPageProps {
  project: Project | undefined;
  rooms: Room[];
  projectPalette: string[];
  /** Leave the page for a room (and select a frame on it, e.g. "mood"). */
  openRoom: (roomId: string, sel?: string) => void;
}

export interface RailBodyProps extends RailPageProps {
  data: RoomView[];
  loading: boolean;
}

export function RailPage({ view, ...props }: RailPageProps & { view: RailView }) {
  const ids = useMemo(() => props.rooms.map((r) => r.id), [props.rooms]);
  const q = useProjectRoomData(ids);
  const data: RoomView[] = props.rooms.map((room, k) => {
    const d = q.rooms[k];
    return {
      room,
      color: props.projectPalette[k % props.projectPalette.length],
      palette: roomPalette(d?.style, props.projectPalette),
      style: d?.style,
      images: d?.images ?? [],
      items: roomItems({ room, layout: d?.layout, listings: d?.listings }),
      laidOut: !!d?.layout,
    };
  });
  const body: RailBodyProps = { ...props, data, loading: q.isLoading };
  return (
    <main className="rp" aria-label={TITLES[view]}>
      {q.error && <p className="rp-err">{errorText(q.error)}</p>}
      {view === 'share' && <SharePage {...body} />}
      {view === 'assets' && <AssetsPage {...body} />}
      {view === 'sellers' && <SellersPage {...body} />}
      {view === 'styles' && <StylesPage {...body} />}
    </main>
  );
}

const TITLES: Record<RailView, string> = { share: 'Share', assets: 'Assets', sellers: 'Sellers', styles: 'Styles' };

export function RailHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="rp-h">
      <div className="rp-ht">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="rp-acts">{children}</div>}
    </header>
  );
}

export function NoRooms({ openPlan }: { openPlan: () => void }) {
  return (
    <div className="rp-empty">
      <b>No rooms yet</b>
      <p>Rooms come from your floor plan: read a photo or draw one.</p>
      <button className="pbtn dark" type="button" onClick={openPlan}>
        Go to the floor plan
      </button>
    </div>
  );
}

export function Swatches({ colors, size = 'md' }: { colors: string[]; size?: 'sm' | 'md' }) {
  return (
    <div className={`rp-sw ${size}`} aria-label={`Palette: ${colors.join(', ')}`}>
      {colors.map((c, i) => (
        <span key={c + i} style={{ background: c }} title={c} />
      ))}
    </div>
  );
}
