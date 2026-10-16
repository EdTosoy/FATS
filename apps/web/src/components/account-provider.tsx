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
import {
  ACCOUNT_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
} from '@/lib/http-workspace-repository';
export interface AccountUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}
interface AccountState {
  user: AccountUser | null;
  mode: 'local' | 'account';
  loading: boolean;
  expired: boolean;
  error: string;
  configured: boolean;
}
interface AccountContextValue extends AccountState {
  erasure: { receipt: string; status: 'pending' | 'complete' } | null;
  recordErasure: (receipt: string, status: 'pending' | 'complete') => void;
  refreshSession: (broadcast?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  useLocal: () => void;
}
const AccountContext = createContext<AccountContextValue | null>(null);
const MODE_KEY = 'fats.workspace-mode';
function preference(): 'local' | 'account' {
  try {
    return localStorage.getItem(MODE_KEY) === 'account' ? 'account' : 'local';
  } catch {
    return 'local';
  }
}
function remember(mode: 'local' | 'account') {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* Preference storage must never block account persistence. */
  }
}
export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({
    user: null,
    mode: 'local',
    loading: true,
    expired: false,
    error: '',
    configured: true,
  });
  const [erasure, setErasure] = useState<AccountContextValue['erasure']>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const refreshSession = useCallback(async (broadcast = false) => {
    try {
      const response = await fetch('/api/account', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          'Account access is unavailable. Retry or keep your current form open.',
        );
      const result = (await response.json()) as {
        user: AccountUser | null;
        configured?: boolean;
      };
      if (result.user) {
        remember('account');
        setState({
          user: result.user,
          mode: 'account',
          loading: false,
          expired: false,
          error: '',
          configured: true,
        });
      } else {
        const mode = preference();
        setState((current) => ({
          ...current,
          user: mode === 'account' ? current.user : null,
          mode,
          loading: false,
          expired: mode === 'account',
          error: '',
          configured: result.configured !== false,
        }));
      }
      if (broadcast) channel.current?.postMessage('refresh');
    } catch (error) {
      setState((current) => ({
        ...current,
        mode: preference(),
        loading: false,
        error: error instanceof Error ? error.message : 'Account unavailable.',
      }));
    }
  }, []);
  useEffect(() => {
    void refreshSession();
    const refresh = () => {
      void refreshSession();
    };
    const expire = () => {
      setState((current) => ({ ...current, expired: true, mode: 'account' }));
      // A request using an older cookie can finish after reauthentication.
      // Reconcile against the live session rather than leaving a stale gate.
      void refreshSession();
    };
    const changed = () => {
      void refreshSession();
    };
    const synchronize = (event: StorageEvent) => {
      if (event.key === MODE_KEY || event.key === null) refresh();
    };
    channel.current = new BroadcastChannel('fats-account');
    channel.current.onmessage = (event) => {
      if (event.data?.type === 'erasure') {
        if (event.data.owner !== state.user?.id) return;
        remember('local');
        setState({
          user: null,
          mode: 'local',
          loading: false,
          expired: false,
          error: '',
          configured: true,
        });
        setErasure({ receipt: '', status: 'pending' });
      } else refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', synchronize);
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', synchronize);
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed);
    };
  }, [refreshSession, state.user?.id]);
  async function signOut() {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'same-origin',
    });
    if (!response.ok)
      throw new Error(
        'Sign out could not be confirmed. Try again; your account has not switched to local storage.',
      );
    remember('local');
    setState({
      user: null,
      mode: 'local',
      loading: false,
      expired: false,
      error: '',
      configured: true,
    });
    channel.current?.postMessage('refresh');
  }
  return (
    <AccountContext.Provider
      value={{
        ...state,
        erasure,
        recordErasure: (receipt, status) => {
          const owner = state.user?.id;
          remember('local');
          setState({
            user: null,
            mode: 'local',
            loading: false,
            expired: false,
            error: '',
            configured: true,
          });
          setErasure({ receipt, status });
          if (owner) channel.current?.postMessage({ type: 'erasure', owner });
        },
        refreshSession,
        signOut,
        useLocal: () => {
          setErasure(null);
          remember('local');
          setState((current) => ({
            ...current,
            user: null,
            mode: 'local',
            expired: false,
            error: '',
          }));
        },
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('AccountProvider is required.');
  return value;
}
