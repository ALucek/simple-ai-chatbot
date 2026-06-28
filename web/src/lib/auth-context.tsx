'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';

type Status = 'loading' | 'authed' | 'anon';

interface AuthValue {
  user: api.User | null;
  status: Status;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Boot: restore the session from the refresh token, if present.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!api.hasRefreshToken()) {
        if (active) setStatus('anon');
        return;
      }
      try {
        await api.refreshAccess();
        const u = await api.me();
        if (active) {
          setUser(u);
          setStatus('authed');
        }
      } catch {
        if (active) setStatus('anon');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // A failed mid-session refresh notifies here → drop to anon so the shell redirects.
  useEffect(() => {
    api.setOnUnauthorized(() => {
      setUser(null);
      setStatus('anon');
    });
    return () => api.setOnUnauthorized(null);
  }, []);

  async function loginWithGoogle(idToken: string) {
    await api.loginWithGoogle(idToken);
    setUser(await api.me());
    setStatus('authed');
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setStatus('anon');
  }

  return (
    <AuthContext.Provider value={{ user, status, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
