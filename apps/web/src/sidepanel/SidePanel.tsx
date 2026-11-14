/**
 * The tabbed side panel on the right (jenna / Shopping list, and Pinterest in the desktop app). Tabs close one by one
 * with ×, "+" opens the ones not shown, and the whole panel hides when no tab is open.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { SIDE_TABS, useEditorStore, type SideTab } from '../app/useEditorStore';
import { Bag, JennaFace, PinIcon } from '../editor/icons';
import { ChatPanel } from './ChatPanel';
import { PinterestPanel, useDesktopPins } from './PinterestPanel';
import { ShopPreview } from './ShopPreview';
import type { SidePanelBodyProps } from './types';

const DEF: Record<SideTab, { label: string; icon: ReactNode; Body: ComponentType<SidePanelBodyProps> }> = {
  chat: { label: 'jenna', icon: <JennaFace />, Body: ChatPanel },
  shop: { label: 'Shopping list', icon: <Bag />, Body: ShopPreview },
  pinterest: { label: 'Pinterest', icon: <PinIcon />, Body: PinterestPanel },
};

export function SidePanel({ projectId, roomId }: SidePanelBodyProps) {
  const tabs = useEditorStore((s) => s.spTabs);
  const active = useEditorStore((s) => s.spActive);
  const { spOpen, spClose, spActivate } = useEditorStore.getState();
  const [menu, setMenu] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const closed = SIDE_TABS.filter((k) => !tabs.includes(k));
  useDesktopPins(roomId);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !addRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [menu]);

  if (!tabs.length) return null;
  return (
    <aside className="sp" aria-label="Side panel">
      <div className="sp-tabs" role="tablist">
        {tabs.map((k) => (
          <div
            key={k}
            className={`sp-tab${k === active ? ' on' : ''}`}
            role="tab"
            aria-selected={k === active}
            tabIndex={0}
            onClick={() => spActivate(k)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                spActivate(k);
              }
            }}
          >
            <span className="sp-ic">{DEF[k].icon}</span>
            <span className="nm">{DEF[k].label}</span>
            <button
              className="sp-x"
              type="button"
              aria-label={`Close ${DEF[k].label}`}
              onClick={(e) => {
                e.stopPropagation();
                spClose(k);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="sp-add" ref={addRef}>
          {closed.length > 0 && (
            <button className="ibtn" type="button" aria-label="Open another window" title="Open another window" onClick={() => setMenu((m) => !m)}>
              +
            </button>
          )}
          {menu && closed.length > 0 && (
            <div className="sp-menu">
              {closed.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    spOpen(k);
                  }}
                >
                  <span className="sp-ic">{DEF[k].icon}</span>
                  {DEF[k].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="sp-body">
        {tabs.map((k) => {
          const Body = DEF[k].Body;
          // inactive tabs stay mounted (hidden) so a chat or a scrolled pin grid keeps its state
          return (
            <div key={k} hidden={k !== active} style={{ position: 'absolute', inset: 0 }}>
              <Body projectId={projectId} roomId={roomId} />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
