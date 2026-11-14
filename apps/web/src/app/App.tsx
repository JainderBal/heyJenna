/**
 * Routes:
 *   /                → Home (project carousel)
 *   /p/:projectId    → Editor, with ?page=plan|<roomId> and ?sel=<frameId>[/<layer>]
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from '../home/Home';
import { Editor } from '../editor/Editor';
import { isApiError } from '../api/client';

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
          <Route path="/" element={<Home />} />
          <Route path="/p/:projectId" element={<Editor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
