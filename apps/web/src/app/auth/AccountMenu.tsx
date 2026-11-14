/** The header avatar. Signed in with Supabase it opens a menu with the email and "Sign out"; in dev mode it is the plain avatar. */
import { useEffect, useRef, useState } from 'react';
import { errorText } from '../../api/client';
import { useAuth } from './AuthGate';

export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!auth) return <div className="avatar">J</div>;
  const email = auth.user.email ?? 'Signed in';
  return (
    <div className="acct" ref={box}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen((o) => !o)}>
        {(auth.user.email?.[0] ?? 'J').toUpperCase()}
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="who" title={email}>
            {email}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => auth.signOut().catch((e) => setProblem(errorText(e)))}
          >
            Sign out
          </button>
          {problem && <div className="who">{problem}</div>}
        </div>
      )}
    </div>
  );
}
