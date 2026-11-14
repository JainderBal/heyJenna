/**
 * STUB: the Pinterest tab. Another agent fills it in: boards (usePinterestBoards; 501 = no token on
 * the API), a board's pins (usePinterestPins), add to the moodboard (useAddMoodboardPins, or drag a
 * pin onto the Moodboard frame with dataTransfer PIN_DRAG_TYPE = JSON PinRef), "find more like this"
 * (useSimilarPins), and board import (useImportPinterestBoard). Styles: `.pp*` in studio.css.
 */
import type { SidePanelBodyProps } from './types';

export function PinterestPanel({ roomId }: SidePanelBodyProps) {
  return (
    <div className="sp-stub">
      <h3>Pinterest</h3>
      <p>{roomId ? 'Your boards and pins will show here. Drag a pin onto the moodboard to add it.' : 'Open a room to add pins to its moodboard.'}</p>
    </div>
  );
}
