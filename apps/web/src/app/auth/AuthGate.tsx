/**
 * The login gate. With VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY unset (local dev) it renders the
 * app as is: no login screen, the API trusts `x-dev-user`. With them set, it shows the sign-in screen
 * until Supabase has a session, and clears cached API data whenever the signed-in user changes.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authEnabled } from '../../api/auth';
import { signOut, supabaseClient, watchSession, type SignedIn } from './session';
import { SignIn } from './SignIn';
import './auth.css';

export interface AuthState {
  user: SignedIn;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** The signed-in user and sign-out, or null in dev mode (no login). */
export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  if (!authEnabled()) return <>{children}</>;
  return <SupabaseGate>{children}</SupabaseGate>;
}

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'out' } | { kind: 'in'; user: SignedIn };

function SupabaseGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let live = true;
    supabaseClient()
      .then((c) => {
        if (!live) return;
        stop = watchSession(c, (user) => {
          // another person's projects must never show from the cache
          if ((user?.userId ?? null) !== lastUser.current) qc.clear();
          lastUser.current = user?.userId ?? null;
          setStatus(user ? { kind: 'in', user } : { kind: 'out' });
        });
      })
      .catch((e: Error) => live && setStatus({ kind: 'error', message: e.message }));
    return () => {
      live = false;
      stop?.();
    };
  }, [qc]);

  if (status.kind === 'loading') return <div className="auth-screen" aria-busy="true" />;
  if (status.kind === 'error') return <SignIn error={status.message} />;
  if (status.kind === 'out') return <SignIn />;
  const state: AuthState = { user: status.user, signOut: async () => signOut(await supabaseClient()) };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
