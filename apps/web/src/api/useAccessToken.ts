import { useSyncExternalStore } from 'react';
import { getAccessToken, onAccessToken } from './auth';

/** The current Supabase access token (null in dev mode or signed out); re-renders when it changes. */
export const useAccessToken = () => useSyncExternalStore(onAccessToken, getAccessToken);
