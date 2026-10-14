'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ApplicationInput,
  ApplicationRepository,
  ApplicationStatus,
  JobApplication,
} from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '@/lib/local-application-repository';
import { JobFormDialog } from './job-form-dialog';

interface ApplicationContextValue {
  applications: JobApplication[];
  loading: boolean;
  error: string | null;
  openForm: (application?: JobApplication) => void;
  create: (input: ApplicationInput) => Promise<JobApplication>;
  update: (
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ) => Promise<JobApplication>;
}

const ApplicationContext = createContext<ApplicationContextValue | null>(null);

export function ApplicationProvider({
  children,
  repository: providedRepository,
}: {
  children: ReactNode;
  repository?: ApplicationRepository;
}) {
  const repository = useMemo(
    () =>
      providedRepository ??
      new LocalApplicationRepository({
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      }),
    [providedRepository],
  );
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    application?: JobApplication;
    opener: HTMLElement | null;
  } | null>(null);

  const refresh = useCallback(() => {
    return repository.list().then(
      (applications) => {
        setApplications(applications);
        setError(null);
        setLoading(false);
      },
      (error: unknown) => {
        setError(
          error instanceof Error
            ? error.message
            : 'Your applications could not be loaded. Refresh and try again.',
        );
        setLoading(false);
      },
    );
  }, [repository]);

  useEffect(() => {
    void refresh();
    function synchronize(event: StorageEvent) {
      if (event.key === APPLICATION_STORAGE_KEY || event.key === null)
        void refresh();
    }
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, [refresh]);

  async function create(input: ApplicationInput) {
    const application = await repository.create(input);
    await refresh();
    return application;
  }

  async function update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ) {
    const application = await repository.update(id, input);
    await refresh();
    return application;
  }

  function openForm(application?: JobApplication) {
    setForm({
      application,
      opener:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    });
  }

  return (
    <ApplicationContext.Provider
      value={{ applications, loading, error, create, update, openForm }}
    >
      {children}
      {form && (
        <JobFormDialog
          application={form.application}
          opener={form.opener}
          onClose={() => setForm(null)}
        />
      )}
    </ApplicationContext.Provider>
  );
}

export function useApplications() {
  const context = useContext(ApplicationContext);
  if (!context)
    throw new Error('useApplications must be used inside ApplicationProvider');
  return context;
}
