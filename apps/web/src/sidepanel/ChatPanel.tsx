/**
 * STUB: the jenna chat tab. Another agent fills it in with useChat(roomId) (POST /rooms/:roomId/chat;
 * the server keeps no history, so send it back each turn) and the prototype's `.chat.docked` look
 * (messages, suggestion chips, input).
 */
import type { SidePanelBodyProps } from './types';

export function ChatPanel({ roomId }: SidePanelBodyProps) {
  return (
    <div className="sp-stub">
      <h3>hey jenna</h3>
      <p>{roomId ? "hey! i'm jenna. ask me for a palette, a fit check or a shopping list." : 'Open a room to chat with jenna about it.'}</p>
    </div>
  );
}
