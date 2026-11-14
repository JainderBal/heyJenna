/**
 * STUB: the live 360° room viewer inside the "3D room" frame. Another agent replaces this with the
 * three.js viewer (the prototype's viewerFor(): dollhouse cutaway, drag to turn, scroll to zoom,
 * Spin / 3/4 / Top / Reset buttons) that places the layout's objects and their product models
 * (`listing.modelUrl`, served through GET /api/models?url=…). Keep the props.
 *
 * It renders inside `.viewer` (position:absolute; inset:0), which the canvas leaves alone for
 * pointer and wheel events, so the viewer can own drag and zoom.
 */
import type { Layout, Room } from '../api/types';

export interface RoomViewerProps {
  roomId: string;
  /** The room's newest layout, or null before "Lay out the room". */
  layout: Layout | null;
  /** The room itself (size, windows, doors) so an empty room can still be drawn. */
  room?: Room;
  /** Colours to paint with (moodboard palette, else the project's). */
  palette?: string[];
}

export function RoomViewer({ layout, room }: RoomViewerProps) {
  return (
    <div className="viewer-stub">
      <b>3D room</b>
      <span>
        {room ? `${room.floorPlan.width} × ${room.floorPlan.depth} m · ` : ''}
        {layout ? `${layout.objects.length} pieces placed` : 'no layout yet'}
      </span>
    </div>
  );
}
