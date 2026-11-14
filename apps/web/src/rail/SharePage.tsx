/** Share: a read-only summary of the project (rooms, palettes, shopping lists) to copy, download or print. */
import { toast } from '../app/useEditorStore';
import { dims } from '../editor/plans';
import { shortTitle } from '../editor/model';
import { downloadText, money, shoppingCsv, slug, totals, totalText } from './railData';
import { NoRooms, RailHeader, Swatches, type RailBodyProps } from './RailPage';

export function SharePage({ project, data, loading, openRoom }: RailBodyProps) {
  const items = data.flatMap((d) => d.items);
  const pieces = items.filter((i) => !i.suggested);
  const name = project?.name ?? 'Project';
  const link = project ? `${window.location.origin}/p/${project.id}` : window.location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied');
    } catch {
      window.prompt('Copy this link', link);
    }
  }

  return (
    <div className="rp-in share-page">
      <RailHeader
        title={name}
        sub={
          <>
            {project?.kind ?? 'no plan yet'} · {data.length} {data.length === 1 ? 'room' : 'rooms'} · {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} · <b>{totalText(totals(items))}</b>
          </>
        }
      >
        <button className="pbtn" type="button" onClick={copy}>
          Copy link
        </button>
        <button
          className="pbtn"
          type="button"
          disabled={!items.length}
          title={items.length ? undefined : 'Nothing on the shopping lists yet'}
          onClick={() => downloadText(`${slug(name)}-shopping-list.csv`, shoppingCsv(items))}
        >
          Download shopping list (CSV)
        </button>
        <button className="pbtn dark" type="button" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </RailHeader>
      <p className="rp-note no-print">A read-only summary. The link opens this project in the studio for people signed in to it; public share links aren't built yet.</p>

      {!data.length && !loading && <NoRooms openPlan={() => openRoom('plan', 'plan')} />}
      <div className="share-rooms">
        {data.map((d) => {
          const t = totals(d.items);
          return (
            <section key={d.room.id} className="rp-card share-room">
              <header>
                <span className="pdot" style={{ background: d.color }} />
                <h2>{d.room.name}</h2>
                <small>
                  {dims(d.room)} · {d.room.areaM2.toFixed(1)} m²
                </small>
                <button className="link no-print" type="button" onClick={() => openRoom(d.room.id)}>
                  Open room
                </button>
              </header>
              <div className="share-style">
                <Swatches colors={d.palette} />
                <div>
                  <b>{d.style?.profile.name ?? 'No moodboard yet'}</b>
                  {d.style && <small>{d.style.profile.vibe.slice(0, 4).join(' · ')}</small>}
                </div>
                {d.images.length > 0 && (
                  <div className="share-thumbs">
                    {d.images.slice(0, 4).map((i) => (
                      <img key={i.id} src={i.src} alt="" loading="lazy" />
                    ))}
                  </div>
                )}
              </div>
              {d.items.length ? (
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>Piece</th>
                      <th>Seller</th>
                      <th className="num">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((i) => (
                      <tr key={i.id} className={i.suggested ? 'rp-sugg' : undefined}>
                        <td title={i.title}>
                          {i.url ? (
                            <a href={i.url} target="_blank" rel="noreferrer">
                              {shortTitle(i.title)}
                            </a>
                          ) : (
                            shortTitle(i.title)
                          )}
                        </td>
                        <td>{i.seller}</td>
                        <td className="num">{money(i.price, i.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Room total</td>
                      <td className="num">{totalText(t)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="empty">{loading ? 'loading…' : 'Nothing on the shopping list yet.'}</p>
              )}
            </section>
          );
        })}
      </div>
      {data.length > 1 && items.length > 0 && (
        <div className="rp-card share-total">
          <span>
            Project total · {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}
          </span>
          <b>{totalText(totals(items))}</b>
        </div>
      )}
      <p className="print-only share-foot">
        hey jenna · {name} · {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
