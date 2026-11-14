/** Styles: each room's style (palette, style name, key dials) side by side, linking to the room. */
import type { StyleProfile } from '../api/types';
import { NoRooms, RailHeader, Swatches, type RailBodyProps } from './RailPage';
import { useEditorStore } from '../app/useEditorStore';

type Dials = StyleProfile['dials'];
type UnitDial = { [K in keyof Dials]: Dials[K] extends number ? K : never }[keyof Dials];

/** The dials worth comparing across rooms: [dial, left end, right end]. */
const KEY_DIALS: [UnitDial, string, string][] = [
  ['palette_temperature', 'cool', 'warm'],
  ['palette_value', 'moody', 'airy'],
  ['palette_saturation', 'muted', 'vivid'],
  ['curvature', 'square', 'organic'],
  ['wood_tone', 'pale wood', 'dark wood'],
  ['texture', 'sleek', 'textured'],
  ['ornament', 'plain', 'ornate'],
];

const SHAPES: Record<StyleProfile['shapeFamily'], string> = { retro: 'retro shapes', modern: 'modern shapes', garden: 'garden shapes' };

export function StylesPage({ data, loading, openRoom }: RailBodyProps) {
  const styled = data.filter((d) => d.style).length;
  const spOpen = useEditorStore((s) => s.spOpen);
  return (
    <div className="rp-in">
      <RailHeader title="Styles" sub={`${styled} of ${data.length} ${data.length === 1 ? 'room has' : 'rooms have'} a style from a moodboard`} />
      {!data.length && !loading && <NoRooms openPlan={() => openRoom('plan', 'plan')} />}
      <div className="styles">
        {data.map((d) => {
          const p = d.style?.profile;
          return (
            <section key={d.room.id} className="rp-card style-card">
              <header>
                <span className="pdot" style={{ background: d.color }} />
                <h2>{d.room.name}</h2>
              </header>
              {p ? (
                <>
                  <div className="style-name">
                    <b>{p.name}</b>
                    <small>
                      {SHAPES[p.shapeFamily]}
                      {p.stylingDensity ? ` · ${p.stylingDensity}` : ''} · {d.style!.imageCount} {d.style!.imageCount === 1 ? 'image' : 'images'}
                    </small>
                  </div>
                  <div className="style-pal">
                    <PalRow label="walls & floor" colors={p.palette.dominant} />
                    <PalRow label="big pieces" colors={p.palette.secondary} />
                    <PalRow label="accents" colors={p.palette.accent} />
                  </div>
                  {p.vibe.length > 0 && (
                    <div className="style-tags">
                      {p.vibe.slice(0, 6).map((v) => (
                        <span key={v}>{v}</span>
                      ))}
                    </div>
                  )}
                  <dl className="dials">
                    {KEY_DIALS.map(([k, lo, hi]) => {
                      const v = typeof p.dials?.[k] === 'number' ? (p.dials[k] as number) : 0.5;
                      return (
                        <div key={k} className="dial">
                          <dt>
                            <span>{lo}</span>
                            <span>{hi}</span>
                          </dt>
                          <dd>
                            <span className="track" />
                            <i style={{ left: `${Math.round(v * 100)}%` }} aria-label={`${k.replace(/_/g, ' ')} ${Math.round(v * 100)} %`} />
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </>
              ) : (
                <div className="style-none">
                  <Swatches colors={d.palette} size="sm" />
                  <p className="empty">{loading ? 'loading…' : 'No moodboard yet: the project palette stands in. Add images and jenna reads the style.'}</p>
                </div>
              )}
              <div className="style-acts">
                <button className="pbtn sm" type="button" onClick={() => openRoom(d.room.id, 'mood')}>
                  {p ? 'Moodboard' : 'Add a moodboard'}
                </button>
                {p && (
                  <button
                    className="pbtn sm"
                    type="button"
                    onClick={() => {
                      openRoom(d.room.id, 'mood');
                      spOpen('style');
                    }}
                  >
                    Edit dials
                  </button>
                )}
                <button className="pbtn sm" type="button" onClick={() => openRoom(d.room.id)}>
                  Open room →
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PalRow({ label, colors }: { label: string; colors: string[] }) {
  return (
    <div className="pal-row">
      <Swatches colors={colors} size="sm" />
      <small>{label}</small>
    </div>
  );
}
