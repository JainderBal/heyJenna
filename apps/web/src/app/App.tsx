/**
 * Routes:
 *   /                        → Landing (what hey jenna does, the 3D room, "Start a project"); the desktop app skips it
 *   /projects                → Home (project carousel)
 *   /p/:projectId            → Editor, with ?page=plan|<roomId>, ?sel=<frameId>[/<layer>] and ?view=share|assets|sellers|styles
 *   /projects/:projectId     → /p/:projectId (query kept)
 *   /home                    → /projects
 * The studio routes are behind AuthGate: a sign-in screen first when Supabase login is configured
 * (VITE_SUPABASE_*). The landing page is public.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Home } from '../home/Home';
import { Editor } from '../editor/Editor';
import { Landing } from '../landing/Landing';
import { isApiError } from '../api/client';
import { AuthGate } from './auth/AuthGate';
import { desktop } from './desktopBridge';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx won't get better by asking again
      retry: (n, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={desktop ? <Navigate to="/projects" replace /> : <Landing />} />
          <Route element={<AuthGate><Outlet /></AuthGate>}>
            <Route path="/projects" element={<Home />} />
            <Route path="/p/:projectId" element={<Editor />} />
          </Route>
          <Route path="/projects/:projectId" element={<ToEditor />} />
          <Route path="/home" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<Navigate to={desktop ? '/projects' : '/'} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function ToEditor() {
  const { projectId = '' } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/p/${projectId}${search}`} replace />;
}
