/**
 * The jenna chat tab (prototype: the `.chat` markup, `say` and `ACT`), docked. POST
 * /rooms/:roomId/chat keeps no history, so every turn sends the conversation back. useChat
 * invalidates what the reply's `actions` changed (style, listings, layouts).
 */
import { useEffect, useRef, useState } from 'react';
import type { ChatTurn } from '@hey-jenna/contracts';
import { errorText } from '../api/client';
import { useChat, useProjectRooms } from '../api/hooks';
import { useEditorStore } from '../app/useEditorStore';
import { desktop } from '../app/desktopBridge';
import { openPinterestWindow } from '../app/openPinterest';
import type { SidePanelBodyProps } from './types';

interface Msg {
  who: 'j' | 'u';
  text: string;
  /** Local lines (greeting, hints, errors) are shown but not sent back as history. */
  local?: boolean;
}

const HISTORY_MAX = 40; // ChatRequest max

type Act = 'palette' | 'plan' | 'list' | 'similar';
const SUGG: { act: Act; label: string; message: string }[] = [
  { act: 'palette', label: 'Pull a palette', message: 'pull a palette from my moodboard' },
  { act: 'plan', label: 'Check the floor plan', message: 'check the floor plan: does everything fit?' },
  { act: 'list', label: 'Build my shopping list', message: 'build my shopping list' },
  { act: 'similar', label: 'Find pins like my board', message: 'find more like my board' },
];

const Face = () => (
  <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true">
    <rect x="2" y="2" width="24" height="24" rx="8" fill="#F4EEE7" />
    <rect x="10.5" y="10" width="2.4" height="6" rx="1.2" fill="#1E1E1E" />
    <rect x="15.5" y="10" width="2.4" height="6" rx="1.2" fill="#1E1E1E" />
  </svg>
);

export function ChatPanel({ roomId, projectId }: SidePanelBodyProps) {
  const rooms = useProjectRooms(projectId).data;
  const room = rooms?.find((r) => r.id === roomId);
  if (!roomId)
    return (
      <section className="chat docked" aria-label="hey jenna chat">
        <ChatHead />
        <div className="msgs">
          <div className="msg j">hey! i'm jenna. open a room (pick one from Pages on the left) and i'll help with its palette, a fit check or a shopping list.</div>
        </div>
      </section>
    );
  // one conversation per room: a new room starts fresh
  return <RoomChat key={roomId} roomId={roomId} roomName={room?.name} />;
}

function ChatHead() {
  return (
    <header>
      <Face />
      <b>hey jenna</b>
      <span className="muted">your interior buddy</span>
    </header>
  );
}

function RoomChat({ roomId, roomName }: { roomId: string; roomName?: string }) {
  const chat = useChat(roomId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const name = roomName?.toLowerCase() ?? 'this room';

  useEffect(() => {
    setMsgs((m) => (m.length ? m : [{ who: 'j', local: true, text: `hey! i'm jenna. drop photos on the ${name} moodboard and i'll pull a palette, check what fits and build a shopping list you can buy.` }]));
  }, [name]);

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, chat.isPending]);

  const say = (m: Msg) => setMsgs((old) => [...old, m]);

  function send(message: string) {
    const v = message.trim();
    if (!v || chat.isPending) return;
    const history: ChatTurn[] = msgs
      .filter((m) => !m.local && m.text.trim())
      .map((m) => ({ role: m.who === 'u' ? 'user' : 'assistant', content: m.text.slice(0, 4000) }))
      .slice(-HISTORY_MAX) as ChatTurn[];
    say({ who: 'u', text: v });
    chat.mutate(
      { message: v.slice(0, 2000), history },
      {
        onSuccess: (r) => say({ who: 'j', text: r.reply || '…' }),
        onError: (e) => say({ who: 'j', local: true, text: `hmm, i couldn't answer that: ${errorText(e)}` }),
      },
    );
  }

  function act(a: (typeof SUGG)[number]) {
    const st = useEditorStore.getState();
    if (a.act === 'similar') {
      say({ who: 'u', text: a.message, local: true });
      say({ who: 'j', local: true, text: 'opened Pinterest beside the studio. drag the pins you like onto the moodboard and i\'ll read them into the room\'s style.' });
      if (desktop) st.spOpen('pinterest');
      else openPinterestWindow();
      return;
    }
    if (a.act === 'palette') st.select('pal', true);
    if (a.act === 'plan') st.select('room3d', true);
    if (a.act === 'list') {
      st.select('list', true);
      st.spOpen('shop');
      st.spActivate('chat');
    }
    send(a.message);
  }

  return (
    <section className="chat docked" aria-label="hey jenna chat">
      <ChatHead />
      <div className="msgs" ref={box} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            {m.text}
          </div>
        ))}
        {chat.isPending && (
          <div className="msg j typing" aria-label="jenna is typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      <div className="sugg">
        {SUGG.map((s) => (
          <button key={s.act} type="button" disabled={chat.isPending} onClick={() => act(s)}>
            {s.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
          setText('');
          input.current?.focus();
        }}
      >
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell jenna about the room…" autoComplete="off" aria-label="Message jenna" maxLength={2000} />
        <button className="send" type="submit" disabled={chat.isPending || !text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
