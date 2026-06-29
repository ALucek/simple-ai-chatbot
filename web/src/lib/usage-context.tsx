'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { type Usage, getUsage } from './api';

interface UsageValue {
  used: number | null;
  budget: number | null;
  refresh: () => void;
}

const UsageContext = createContext<UsageValue | null>(null);

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  const refresh = useCallback(() => {
    getUsage()
      .then((u) => setUsage(u))
      .catch(() => {
        // Keep the last-known value; a usage hiccup must never show "0% used."
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <UsageContext.Provider
      value={{
        used: usage?.used ?? null,
        budget: usage?.budget ?? null,
        refresh,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage(): UsageValue {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error('useUsage must be used within a UsageProvider');
  return ctx;
}
