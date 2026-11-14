/** Sellers: the project's chosen products grouped by where they're sold, with counts, totals and outbound links. */
import { shortTitle } from '../editor/model';
import { bySeller, money, totals, totalText } from './railData';
import { NoRooms, RailHeader, type RailBodyProps } from './RailPage';

/** Where "Visit" goes for a seller group (links and unfound pieces have none). */
const HOME: Partial<Record<string, string>> = {
  ikea: 'https://www.ikea.com/ca/en/',
};

export function SellersPage({ data, loading, openRoom }: RailBodyProps) {
  const items = data.flatMap((d) => d.items);
  const groups = bySeller(items);
  const sellers = groups.filter((g) => g.id !== 'none');
  const priced = items.filter((i) => !i.suggested);

  return (
    <div className="rp-in">
      <RailHeader
        title="Sellers"
        sub={
          <>
            {priced.length} {priced.length === 1 ? 'product' : 'products'} from {sellers.length} {sellers.length === 1 ? 'seller' : 'sellers'} · <b>{totalText(totals(items))}</b>
          </>
        }
      />
      {!data.length && !loading && <NoRooms openPlan={() => openRoom('plan', 'plan')} />}
      {data.length > 0 && !groups.length && (
        <div className="rp-empty">
          <b>{loading ? 'loading…' : 'No products chosen yet'}</b>
          {!loading && <p>Find products and lay out a room: what jenna picks shows up here, grouped by seller.</p>}
        </div>
      )}
      {sellers.length > 0 && (
        <div className="seller-sum">
          {sellers.map((g) => (
            <button
              key={g.id}
              type="button"
              className="rp-card seller-tile"
              onClick={() => document.getElementById(`seller-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <b>{g.name}</b>
              <span>
                {g.items.length} {g.items.length === 1 ? 'item' : 'items'}
              </span>
              <strong>{totalText(g.total)}</strong>
            </button>
          ))}
        </div>
      )}
      <div className="seller-groups">
        {groups.map((g) => (
          <section key={g.id} id={`seller-${g.id}`} className="rp-card seller-group">
            <header>
              <h2>{g.name}</h2>
              <small>
                {g.blurb} · {g.items.length} {g.items.length === 1 ? 'item' : 'items'}
              </small>
              <span className="sp-flex" />
              {g.id !== 'none' && <b className="seller-total">{totalText(g.total)}</b>}
              {HOME[g.id] && (
                <a className="link" href={HOME[g.id]} target="_blank" rel="noreferrer">
                  Visit {g.name.split(' ')[0]} ↗
                </a>
              )}
            </header>
            <ul className="seller-items">
              {g.items.map((i) => (
                <li key={i.id}>
                  {i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" /> : <span className="ph" />}
                  <div className="si-t">
                    <b title={i.title}>{shortTitle(i.title)}</b>
                    <small>
                      <button type="button" className="link" onClick={() => openRoom(i.roomId, 'list')}>
                        {i.roomName}
                      </button>
                      {g.id === 'links' && ` · ${i.seller}`}
                    </small>
                  </div>
                  <span className="p">{i.suggested ? '' : money(i.price, i.currency)}</span>
                  {i.url ? (
                    <a className="plink" href={i.url} target="_blank" rel="noreferrer" aria-label={`Open ${shortTitle(i.title)} at ${i.seller}`}>
                      Open ↗
                    </a>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
