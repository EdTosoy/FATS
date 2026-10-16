'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Offer, OfferCommand } from '@fats/domain';
import { useAccount } from './account-provider';
import {
  ACCOUNT_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
} from '@/lib/http-workspace-repository';
interface OfferContext {
  offers: Offer[];
  loading: boolean;
  error: string;
  now: Date;
  refresh: () => Promise<Offer[]>;
  command: (
    applicationId: string,
    baseVersion: number,
    requestId: string,
    command: OfferCommand,
  ) => Promise<void>;
}
const Context = createContext<OfferContext | null>(null);
export function OfferProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount(),
    id = user?.id;
  const [offers, setOffers] = useState<Offer[]>([]),
    [loading, setLoading] = useState(Boolean(id)),
    [error, setError] = useState(''),
    [now, setNow] = useState(() => new Date());
  const sequence = useRef(0);
  const request = useCallback(
    async (body?: unknown) => {
      const response = await fetch('/api/offers', {
        method: body ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'x-fats-account': id ?? '',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        if (result.code === 'ACCOUNT_CHANGED')
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
        throw new Error(
          result.error ?? 'Offers are unavailable. Keep your inputs and retry.',
        );
      }
      return result;
    },
    [id],
  );
  const refresh = useCallback(async (): Promise<Offer[]> => {
    if (!id) return [];
    const current = ++sequence.current;
    try {
      const rows: Offer[] = await request();
      if (current === sequence.current) {
        setOffers(rows);
        setError('');
      }
      return rows;
    } catch (error) {
      if (current === sequence.current)
        setError(
          error instanceof Error ? error.message : 'Offers are unavailable.',
        );
      throw error;
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [id, request]);
  useEffect(() => {
    const reload = () => {
      void refresh().catch(() => {});
    };
    const initial = window.setTimeout(reload, 0);
    const timer = window.setInterval(() => {
      setNow(new Date());
      reload();
    }, 30000);
    window.addEventListener('focus', reload);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);
  return (
    <Context.Provider
      value={{
        offers,
        loading,
        error,
        now,
        refresh,
        command: async (applicationId, baseVersion, requestId, command) => {
          await request({ applicationId, baseVersion, requestId, command });
          await refresh();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOffers() {
  const value = useContext(Context);
  if (!value) throw new Error('OfferProvider is required.');
  return value;
}
