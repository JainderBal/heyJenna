/** Home: jenna, a hello, the project carousel with its caption and controls, and the "+" flow. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject, useProjects } from '../api/hooks';
import { errorText } from '../api/client';
import { JennaCube } from '../jenna/JennaCube';
import { HomeCarousel, type HomeCard } from './HomeCarousel';
import { DEFAULT_PALETTE, PALS } from '../editor/plans';
import { ArrowLeft, ArrowRight } from '../editor/icons';
import { AccountMenu } from '../app/auth/AccountMenu';

const NEW_CARD: HomeCard = { id: 'new', name: 'New project', kind: 'start here', palette: [], isNew: true };
const NEW_PALS = [PALS.motel, PALS.warm, PALS.rose];

export function Home() {
  const projects = useProjects();
  const create = useCreateProject();
  const navigate = useNavigate();
  const [index, setIndex] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);

  const cards = useMemo<HomeCard[]>(
    () => [
      NEW_CARD,
      ...(projects.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind ?? 'no plan yet',
        palette: p.palette.length ? p.palette : DEFAULT_PALETTE,
      })),
    ],
    [projects.data],
  );
  const n = cards.length;
  const cur = ((index % n) + n) % n;
  const card = cards[cur];
  const go = (step: number) => setIndex((i) => (((i + step) % n) + n) % n);

  useEffect(() => {
    if (projects.isError) setMsg(errorText(projects.error));
  }, [projects.isError, projects.error]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);

  const open = (c: HomeCard) => (c.isNew ? newProject() : navigate(`/p/${c.id}`));

  function newProject() {
    if (create.isPending) return;
    const fresh = (projects.data ?? []).filter((p) => p.name.startsWith('Untitled project')).length + 1;
    create.mutate(
      { name: 'Untitled project' + (fresh > 1 ? ` ${fresh}` : ''), palette: NEW_PALS[fresh % NEW_PALS.length] },
      { onSuccess: (p) => navigate(`/p/${p.id}`), onError: (e) => setMsg(errorText(e)) },
    );
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Enter' && document.activeElement === document.body) open(card);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  return (
    <div className="homev">
      <header className="hv-top">
        <span className="hv-word">hey jenna</span>
        <span className="hv-spacer" />
        <AccountMenu />
      </header>
      <section className="hv-body">
        <div className="hv-jenna" role="button" tabIndex={0} aria-label="jenna">
          <JennaCube size={130} />
        </div>
        <p className="hv-hello">
          {projects.isLoading ? 'one sec, finding your projects…' : 'hey! pick a project, or tap + to start one.'}
        </p>
        <HomeCarousel cards={cards} index={cur} onIndexChange={setIndex} onOpen={open} onNew={newProject}>
          <div className="hv-cap static" aria-live="polite" style={{ width: 247 }}>
            <b>{card.name}</b>
            <span>{create.isPending && card.isNew ? 'creating…' : card.kind}</span>
          </div>
        </HomeCarousel>
        <div className="hv-ctrl">
          <button type="button" aria-label="Previous" onClick={() => go(-1)}>
            <ArrowLeft />
          </button>
          <span className="count">
            <b>{String(cur + 1).padStart(2, '0')}</b> / {String(n).padStart(2, '0')}
          </span>
          <button type="button" aria-label="Next" onClick={() => go(1)}>
            <ArrowRight />
          </button>
        </div>
      </section>
      {msg && <div className="htoast">{msg}</div>}
    </div>
  );
}
