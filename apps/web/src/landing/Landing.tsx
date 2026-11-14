/**
 * The marketing landing at "/": what hey jenna does, how it works in three steps, a live 3D room
 * (the studio's own viewer) and "Start a project" → the project carousel at /projects.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { JennaCube } from '../jenna/JennaCube';
import { RoomViewer } from '../viewer/RoomViewer';
import { DEMO_LAYOUT, DEMO_PALETTE, DEMO_ROOM } from './demoRoom';

const STEPS: { n: string; title: string; text: string; art: React.ReactNode }[] = [
  {
    n: '01',
    title: 'Pin the feeling',
    text: 'Upload photos or bring in Pinterest pins. jenna reads the palette, the shapes and the materials you keep coming back to.',
    art: (
      <div className="ld-art ld-mood">
        {DEMO_PALETTE.slice(0, 6).map((c, i) => (
          <span key={c} style={{ background: c, gridRow: i === 0 || i === 4 ? 'span 2' : undefined }} />
        ))}
      </div>
    ),
  },
  {
    n: '02',
    title: 'Add your floor plan',
    text: 'Snap a photo of the plan or draw the rooms. Every room gets its own page with its size, windows and doors.',
    art: (
      <svg className="ld-art" viewBox="0 0 160 110" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="10" y="10" width="140" height="90" rx="2" />
        <path d="M80 10v52M80 78v22M10 58h44M70 58h10M110 10v40M110 66v34M110 50h40" />
        <rect x="16" y="16" width="58" height="36" fill={DEMO_PALETTE[3]} stroke="none" opacity=".55" />
        <rect x="86" y="16" width="20" height="36" fill={DEMO_PALETTE[1]} stroke="none" opacity=".35" />
        <rect x="116" y="56" width="28" height="38" fill={DEMO_PALETTE[0]} stroke="none" opacity=".35" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Get the room, and the list',
    text: 'jenna finds real pieces (second-hand first: Kijiji, Marketplace, eBay, Etsy, then IKEA), lays them out in 3D and hands you a shopping list with links and prices.',
    art: (
      <div className="ld-art ld-list">
        {[
          ['Teak sideboard', 'Kijiji', '$180'],
          ['Boucle armchair', 'Marketplace', '$95'],
          ['Paper lantern', 'IKEA', '$29'],
        ].map(([t, s, p]) => (
          <div key={t}>
            <b>{t}</b>
            <small>{s}</small>
            <span>{p}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export function Landing() {
  const how = useRef<HTMLElement>(null);
  return (
    <div className="landing">
      <header className="ld-top">
        <span className="hv-word">hey jenna</span>
        <span className="hv-spacer" />
        <button className="ld-nav" type="button" onClick={() => how.current?.scrollIntoView({ behavior: 'smooth' })}>
          How it works
        </button>
        <Link className="pbtn dark" to="/projects">
          Open the studio
        </Link>
      </header>

      <section className="ld-hero">
        <div className="ld-copy">
          <p className="ld-kicker">your interior buddy for pre-loved homes</p>
          <h1>Every room starts as a feeling.</h1>
          <p className="ld-lede">
            Give jenna a moodboard and a floor plan. She lays out every room in 3D with real furniture you can buy, second-hand first, and a shopping list with links and prices.
          </p>
          <div className="ld-cta">
            <Link className="pbtn dark lg" to="/projects">
              Start a project
            </Link>
            <button className="pbtn lg" type="button" onClick={() => how.current?.scrollIntoView({ behavior: 'smooth' })}>
              See how it works
            </button>
          </div>
        </div>
        <div className="ld-jenna" aria-hidden="true">
          <JennaCube size={220} variant="home" />
        </div>
      </section>

      <section className="ld-how" ref={how} aria-labelledby="ld-how-h">
        <h2 id="ld-how-h">How it works</h2>
        <ol className="ld-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="ld-step">
              {s.art}
              <span className="ld-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="ld-room" aria-labelledby="ld-room-h">
        <div className="ld-room-copy">
          <h2 id="ld-room-h">The 3D room</h2>
          <p>Drag to turn it, scroll to zoom. In the studio every piece is the real product, with IKEA's own 3D models, and a Blender render when you want the photo.</p>
        </div>
        <div className="ld-viewer">
          <div className="viewer">
            <RoomViewer roomId={DEMO_ROOM.id} layout={DEMO_LAYOUT} room={DEMO_ROOM} palette={DEMO_PALETTE} />
          </div>
        </div>
      </section>

      <section className="ld-end">
        <h2>Start a room.</h2>
        <p>One moodboard, one floor plan. jenna does the boring middle.</p>
        <Link className="pbtn dark lg" to="/projects">
          Start a project
        </Link>
      </section>

      <footer className="ld-foot">
        <span>hey jenna</span>
        <span className="hv-spacer" />
        <Link to="/projects">Your projects</Link>
      </footer>
    </div>
  );
}
