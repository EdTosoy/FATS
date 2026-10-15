'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { DocumentLibrary } from '@fats/domain';
import { useAccount } from './account-provider';
import {
  ACCOUNT_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
} from '@/lib/http-workspace-repository';
interface DocumentsState {
  library: DocumentLibrary | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  command: (body: Record<string, unknown>) => Promise<void>;
  upload: (file: File, metadata: Record<string, unknown>) => Promise<void>;
}
const Context = createContext<DocumentsState | null>(null);
export function DocumentProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const id = account.user?.id;
  const [library, setLibrary] = useState<DocumentLibrary | null>(null),
    [loading, setLoading] = useState(Boolean(id)),
    [error, setError] = useState('');
  const refreshNumber = useRef(0);
  const request = useCallback(
    async (init?: RequestInit) => {
      const response = await fetch('/api/documents', {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { ...init?.headers, 'x-fats-account': id ?? '' },
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        if (result.code === 'ACCOUNT_CHANGED')
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
        throw new Error(
          result.error ??
            'Documents are temporarily unavailable. Keep your inputs and retry.',
        );
      }
      return result;
    },
    [id],
  );
  const refresh = useCallback(async () => {
    if (!id) return;
    const sequence = ++refreshNumber.current;
    try {
      const data = await request();
      if (sequence !== refreshNumber.current) return;
      setLibrary(data);
      setError('');
    } catch (error) {
      if (sequence !== refreshNumber.current) return;
      setError(
        error instanceof Error ? error.message : 'Documents are unavailable.',
      );
    } finally {
      if (sequence === refreshNumber.current) setLoading(false);
    }
  }, [id, request]);
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  return (
    <Context.Provider
      value={{
        library,
        loading,
        error,
        refresh,
        command: async (body) => {
          await request({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          await refresh();
        },
        upload: async (file, metadata) => {
          await request({
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-fats-upload': encodeURIComponent(
                JSON.stringify({ ...metadata, filename: file.name }),
              ),
            },
            body: file,
          });
          await refresh();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDocuments() {
  const value = useContext(Context);
  if (!value) throw new Error('DocumentProvider is required.');
  return value;
}
export function documentUrl(id: string, preview = false) {
  return `/api/documents?version=${encodeURIComponent(id)}${preview ? '&preview=1' : ''}`;
}
