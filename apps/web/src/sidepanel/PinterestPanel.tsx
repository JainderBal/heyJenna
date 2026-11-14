/**
 * The Pinterest tab (prototype: renderPP / showCtx). Pick a board (paste a public board link, a
 * recent one, or the API's own boards when it has a token), then add pins to a room's moodboard with
 * "+", the right-click menu, or by dragging them onto the Moodboard frame (PIN_DRAG_TYPE = JSON
 * PinRef). "✦ Matches your board" ranks the loaded pins by colour distance to the room's palette.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { errorText, isApiError } from '../api/client';
import { useAddPinsToRoom, useImportPinterestBoard, usePinterestBoards, usePinterestPins, useProjectRooms, useSimilarPins } from '../api/hooks';
import type { PinRef, Room } from '../api/types';
import { toast } from '../app/useEditorStore';
import { PIN_DRAG_TYPE } from '../editor/frames/RoomFrames';
import { Close, ExternalLink, PinIcon, Search } from '../editor/icons';
import { FIND_SIMILAR_EVENT } from './events';
import type { SidePanelBodyProps } from './types';

/** A pin as the grid shows it, from an imported board (no size) or the API (with size). */
interface GridPin {
  id: string;
  title: string | null;
  imageUrl: string;
  link: string | null;
  ratio?: string;
}

type Source = { kind: 'import'; title: string; url: string; pins: GridPin[] } | { kind: 'api'; id: string; name: string };
interface RecentBoard {
  title: string;
  url: string;
}

const RECENT_KEY = 'hj-pinterest-boards';
const RECENT_MAX = 5;
const SIMILAR_MAX = 30; // SimilarPinsRequest max

function loadRecent(): RecentBoard[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((b): b is RecentBoard => !!b && typeof b.url === 'string' && typeof b.title === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function saveRecent(list: RecentBoard[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* private mode: just don't remember */
  }
}

const isUrl = (s: string | null | undefined): s is string => {
  if (!s) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

/** What the API takes for a pin: `{id, imageUrl, link?}` (link must be a URL when present). */
const toRef = (p: GridPin): PinRef => ({ id: p.id.slice(0, 64), imageUrl: p.imageUrl, ...(isUrl(p.link) ? { link: p.link } : {}) });
const pinPage = (p: GridPin) => (isUrl(p.link) && /pinterest\./.test(new URL(p.link).hostname) ? p.link : `https://www.pinterest.com/pin/${encodeURIComponent(p.id)}/`);
const label = (p: GridPin) => p.title?.trim() || 'Pinterest pin';

/** Opens pinterest.com in its own window docked to the right of the studio (or at the screen's right edge). */
function openPinterestWindow() {
  const w = 480;
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const sl = scr.availLeft ?? 0;
  const right = window.screenX + window.outerWidth;
  const left = right + w <= sl + scr.availWidth ? right : Math.max(sl, sl + scr.availWidth - w);
  const h = Math.min(window.outerHeight || scr.availHeight, scr.availHeight);
  const win = window.open('https://www.pinterest.com/', 'hj-pinterest', `popup=yes,width=${w},height=${h},left=${left},top=${window.screenY}`);
  if (!win) return toast('Allow pop-ups to open Pinterest beside the studio');
  try {
    win.opener = null;
  } catch {
    /* cross-origin already */
  }
  win.focus();
}

export function PinterestPanel({ roomId, projectId }: SidePanelBodyProps) {
  const rooms = useProjectRooms(projectId).data ?? [];
  const room = rooms.find((r) => r.id === roomId);

  const [src, setSrc] = useState<Source | null>(null);
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<RecentBoard[]>(loadRecent);
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'feed' | 'similar'>('feed');
  const [similar, setSimilar] = useState<{ roomId: string; pins: GridPin[]; unreadable: number } | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [ctx, setCtx] = useState<{ pin: GridPin; x: number; y: number } | null>(null);

  const importBoard = useImportPinterestBoard();
  const boards = usePinterestBoards();
  const apiPins = usePinterestPins(src?.kind === 'api' ? src.id : undefined);
  const addPins = useAddPinsToRoom();
  const rank = useSimilarPins(roomId ?? '');

  const pins: GridPin[] = useMemo(() => {
    if (!src) return [];
    if (src.kind === 'import') return src.pins;
    return (apiPins.data?.items ?? []).map((p) => ({ id: p.id, title: p.title, imageUrl: p.imageUrl, link: p.link, ratio: `${p.size.width}/${p.size.height}` }));
  }, [src, apiPins.data]);

  const importMutate = importBoard.mutate;
  const doImport = useCallback(
    (boardUrl: string) => {
      const url = boardUrl.trim();
      if (!url) return;
      importMutate(
        { boardUrl: url },
        {
          onSuccess: (r) => {
            setSrc({ kind: 'import', title: r.board.title, url: r.board.url, pins: r.pins.map((p) => ({ id: p.id, title: p.title, imageUrl: p.imageUrl, link: p.link })) });
            setPicking(false);
            setTab('feed');
            setSimilar(null);
            setLink('');
            setRecent((old) => {
              const next = [{ title: r.board.title, url: r.board.url }, ...old.filter((b) => b.url !== r.board.url && b.url !== url)].slice(0, RECENT_MAX);
              saveRecent(next);
              return next;
            });
            if (!r.pins.length) toast('That board has no pins yet');
          },
        },
      );
    },
    [importMutate],
  );

  // reopen the last board once
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (recent[0]) doImport(recent[0].url);
  }, [recent, doImport]);

  // matches belong to one room
  useEffect(() => {
    if (similar && similar.roomId !== roomId) {
      setSimilar(null);
      setTab('feed');
    }
  }, [roomId, similar]);

  function add(pin: GridPin, target: Room) {
    addPins.mutate(
      { roomId: target.id, pins: [toRef(pin)] },
      {
        onSuccess: () => {
          setAdded((s) => new Set(s).add(`${target.id}:${pin.id}`));
          toast(`Added to ${target.name} moodboard`);
        },
        onError: (e) => toast(errorText(e)),
      },
    );
  }

  const rankMutate = rank.mutate;
  const runSimilar = useCallback(() => {
    if (!roomId) return toast('Open a room page to match pins to its moodboard');
    const cands = pins.filter((p) => p.imageUrl.startsWith('https://')).slice(0, SIMILAR_MAX);
    if (!cands.length) return toast('Paste a public board link in the Pinterest tab first');
    const byId = new Map(cands.map((p) => [p.id.slice(0, 64), p]));
    rankMutate(cands.map(toRef), {
      onSuccess: (r) => {
        const list = r.ranked.map((x) => byId.get(x.pin.id)).filter((p): p is GridPin => !!p);
        setSimilar({ roomId, pins: list, unreadable: r.unreadable.length });
        setTab('similar');
        setPicking(false);
        toast(list.length ? `${list.length} pins ranked by how well they match ${room?.name ?? 'the room'}` : "jenna couldn't read those pins");
      },
      onError: (e) => toast(isApiError(e, 404) ? `Add a few images to the ${room?.name ?? 'room'} moodboard first` : errorText(e)),
    });
  }, [roomId, pins, rankMutate, room?.name]);

  // "Find pins like my board" from the chat
  const runRef = useRef(runSimilar);
  runRef.current = runSimilar;
  useEffect(() => {
    const on = () => runRef.current();
    window.addEventListener(FIND_SIMILAR_EVENT, on);
    return () => window.removeEventListener(FIND_SIMILAR_EVENT, on);
  }, []);

  const closeCtx = useCallback(() => setCtx(null), []);

  const q = query.trim().toLowerCase();
  const shown = (tab === 'similar' && similar ? similar.pins : pins).filter((p) => !q || (p.title ?? '').toLowerCase().includes(q));
  const showPicker = !src || picking;
  const boardList = boards.data?.items ?? [];
  const boardsHidden = isApiError(boards.error, 501);

  const head = (
    <header>
      <span className="pp-ic">
        <PinIcon />
      </span>
      <div>
        <b>Pinterest</b>
        <small>{src && !picking ? (src.kind === 'import' ? src.title : src.name) : 'pick a board'}</small>
      </div>
      <button className="ibtn" type="button" aria-label="Open Pinterest in a window beside the studio" title="Open Pinterest beside the studio" onClick={openPinterestWindow}>
        <ExternalLink />
      </button>
    </header>
  );

  const footer = (
    <footer>
      <small>open Pinterest beside the studio and drag pin images straight onto a room's moodboard.</small>
      {src && !picking && (
        <button className="link" type="button" onClick={() => setPicking(true)}>
          Change board
        </button>
      )}
      <button className="pbtn sm" type="button" onClick={openPinterestWindow}>
        Open Pinterest
      </button>
    </footer>
  );

  if (showPicker)
    return (
      <div className="pp">
        {head}
        <div className="pp-connect pp-pick">
          <h3>Bring in a Pinterest board</h3>
          <p>paste the link to any public board. jenna reads its pins (no sign-in), and you add the ones you like to a room's moodboard.</p>
          <form
            className="pp-import"
            onSubmit={(e) => {
              e.preventDefault();
              doImport(link);
            }}
          >
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a public board link"
              aria-label="Public Pinterest board link"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="pbtn sm dark" type="submit" disabled={importBoard.isPending || !link.trim()}>
              {importBoard.isPending ? 'Reading…' : 'Import'}
            </button>
          </form>
          {importBoard.isError && <p className="pp-err">{errorText(importBoard.error)}</p>}
          {src && picking && (
            <button className="link" type="button" onClick={() => setPicking(false)}>
              ← Back to {src.kind === 'import' ? src.title : src.name}
            </button>
          )}
          {recent.length > 0 && (
            <div className="pp-boards">
              <div className="ctx-h">Recent boards</div>
              {recent.map((b) => (
                <button key={b.url} type="button" disabled={importBoard.isPending} onClick={() => doImport(b.url)} title={b.url}>
                  <PinIcon />
                  <span>{b.title}</span>
                </button>
              ))}
            </div>
          )}
          {!boardsHidden && boardList.length > 0 && (
            <div className="pp-boards">
              <div className="ctx-h">Your boards</div>
              {boardList.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSrc({ kind: 'api', id: b.id, name: b.name });
                    setPicking(false);
                    setTab('feed');
                    setSimilar(null);
                  }}
                >
                  <PinIcon />
                  <span>{b.name}</span>
                  {b.pinCount != null && <small>{b.pinCount}</small>}
                </button>
              ))}
            </div>
          )}
          {!boardsHidden && boards.isError && <small>couldn't list your Pinterest boards: {errorText(boards.error)}</small>}
        </div>
        {footer}
      </div>
    );

  const loading = src?.kind === 'api' && apiPins.isLoading;
  return (
    <div className="pp">
      {head}
      <div className="pp-tools">
        <label className="pp-search">
          <Search />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search these pins" autoComplete="off" aria-label="Search pins" />
          {query && (
            <button type="button" className="pp-clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <Close />
            </button>
          )}
        </label>
        <div className="pp-tabs">
          <button type="button" className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>
            Board pins
          </button>
          <button
            type="button"
            className={tab === 'similar' ? 'on' : ''}
            disabled={!roomId || !pins.length || rank.isPending}
            title={roomId ? 'Rank these pins by how well they match the room' : 'Open a room page first'}
            onClick={() => (similar ? setTab('similar') : runSimilar())}
          >
            {rank.isPending ? 'Matching…' : '✦ Matches your board'}
          </button>
        </div>
        <p className="pp-hint">
          {room ? (
            <>
              right-click a pin to add it to the <b>{room.name}</b> moodboard, or drag it in.
            </>
          ) : (
            'open a room page, then right-click a pin to add it to that room.'
          )}
          {tab === 'similar' && similar && (
            <>
              {' '}
              closest match first.{similar.unreadable ? ` ${similar.unreadable} pins couldn't be read.` : ''}{' '}
              <button className="link" type="button" onClick={runSimilar}>
                Re-rank
              </button>
            </>
          )}
        </p>
      </div>
      <div className="pp-grid" onScroll={() => ctx && setCtx(null)}>
        {loading ? (
          <p className="pp-hint">loading pins…</p>
        ) : apiPins.isError && src?.kind === 'api' ? (
          <p className="pp-err">{errorText(apiPins.error)}</p>
        ) : (
          <div className="pp-cols">
            {shown.map((p) => {
              const on = !!roomId && added.has(`${roomId}:${p.id}`);
              return (
                <figure
                  key={p.id}
                  className={`pinc${on ? ' on' : ''}`}
                  draggable
                  tabIndex={0}
                  aria-label={label(p)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PIN_DRAG_TYPE, JSON.stringify(toRef(p)));
                    e.dataTransfer.setData('text/uri-list', p.imageUrl);
                    e.dataTransfer.setData('text/plain', p.imageUrl);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtx({ pin: p, x: e.clientX, y: e.clientY });
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                      e.preventDefault();
                      const rc = e.currentTarget.getBoundingClientRect();
                      setCtx({ pin: p, x: rc.left + 12, y: rc.top + 12 });
                    }
                  }}
                >
                  <img alt={label(p)} src={p.imageUrl} style={p.ratio ? { aspectRatio: p.ratio } : undefined} draggable={false} loading="lazy" referrerPolicy="no-referrer" />
                  <button
                    className="padd"
                    type="button"
                    aria-label={room ? `Add to ${room.name} moodboard` : 'Add to a moodboard'}
                    disabled={addPins.isPending}
                    onClick={(e) => {
                      if (room) return add(p, room);
                      const rc = e.currentTarget.getBoundingClientRect();
                      setCtx({ pin: p, x: rc.left, y: rc.bottom + 4 });
                    }}
                  >
                    {on ? '✓' : '+'}
                  </button>
                  {p.title && <figcaption>{p.title}</figcaption>}
                </figure>
              );
            })}
            {!shown.length && <p className="pp-hint">{q ? 'no pins match.' : 'no pins on this board yet.'}</p>}
          </div>
        )}
      </div>
      {footer}
      {ctx && (
        <PinMenu
          {...ctx}
          room={room}
          others={rooms.filter((r) => r.id !== roomId)}
          onClose={closeCtx}
          onAdd={(r) => add(ctx.pin, r)}
          onSimilar={() => {
            const pin = ctx.pin;
            if (room)
              addPins.mutate(
                { roomId: room.id, pins: [toRef(pin)] },
                {
                  onSuccess: () => setAdded((s) => new Set(s).add(`${room.id}:${pin.id}`)),
                  onSettled: () => runRef.current(),
                },
              );
            else runSimilar();
          }}
        />
      )}
    </div>
  );
}

/** The prototype's right-click menu (`.ctx`), portalled so the side panel can't clip it. */
function PinMenu({
  pin,
  x,
  y,
  room,
  others,
  onClose,
  onAdd,
  onSimilar,
}: {
  pin: GridPin;
  x: number;
  y: number;
  room: Room | undefined;
  others: Room[];
  onClose(): void;
  onAdd(r: Room): void;
  onSimilar(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    setAt({ left: Math.max(8, Math.min(x, innerWidth - m.offsetWidth - 8)), top: Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 8)) });
    m.querySelector<HTMLElement>('button,a')?.focus();
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return createPortal(
    <div className="ctx" ref={ref} role="menu" aria-label={`${label(pin)} actions`} style={at}>
      {room && (
        <button type="button" role="menuitem" onClick={pick(() => onAdd(room))}>
          <b>Add to {room.name} moodboard</b>
        </button>
      )}
      <div className="ctx-h">Add to…</div>
      {others.length ? (
        others.map((r) => (
          <button key={r.id} type="button" role="menuitem" onClick={pick(() => onAdd(r))}>
            {r.name}
          </button>
        ))
      ) : (
        <div className="ctx-h">{room ? 'no other rooms yet' : 'add a floor plan to get rooms'}</div>
      )}
      <hr />
      <button type="button" role="menuitem" onClick={pick(onSimilar)}>
        ✦ Find similar with jenna
      </button>
      <a href={pinPage(pin)} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={onClose}>
        Open on Pinterest ↗
      </a>
    </div>,
    document.body,
  );
}
