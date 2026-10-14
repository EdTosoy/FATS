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
  WorkspaceRepository,
  Interview,
  InterviewInput,
  InterviewStatus,
  ApplicationStatus,
  JobApplication,
  RestorePreview,
} from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '@/lib/local-application-repository';
import { JobFormDialog } from './job-form-dialog';

interface ApplicationContextValue {
  exportBackup: () => Promise<string>;
  previewRestore: (text: string) => Promise<RestorePreview>;
  restoreBackup: (token: string) => Promise<void>;
  cancelRestore: (token: string) => void;
  applications: JobApplication[];
  interviews: Interview[];
  now: string;
  createInterview: (input: InterviewInput) => Promise<Interview>;
  updateInterview: (
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ) => Promise<Interview>;
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
  repository?: WorkspaceRepository;
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
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [now, setNow] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    application?: JobApplication;
    opener: HTMLElement | null;
  } | null>(null);

  const refresh = useCallback(() => {
    return Promise.all([repository.list(), repository.listInterviews()]).then(
      ([applications, interviews]) => {
        setInterviews(interviews);
        setNow(new Date().toISOString());
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
    const timer = window.setInterval(
      () => setNow(new Date().toISOString()),
      30000,
    );
    function synchronize(event: StorageEvent) {
      if (event.key === APPLICATION_STORAGE_KEY || event.key === null)
        void refresh();
    }
    window.addEventListener('storage', synchronize);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', synchronize);
    };
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

  async function createInterview(input: InterviewInput) {
    const interview = await repository.createInterview(input);
    await refresh();
    return interview;
  }
  async function updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ) {
    const interview = await repository.updateInterview(id, input);
    await refresh();
    return interview;
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

  async function restoreBackup(token: string) {
    const data = await repository.restoreBackup(token);
    setApplications(
      [...data.applications].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    setInterviews(
      [...data.interviews].sort((a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt),
      ),
    );
    setNow(new Date().toISOString());
    setError(null);
    setLoading(false);
    setForm(null);
  }

  return (
    <ApplicationContext.Provider
      value={{
        applications,
        interviews,
        now,
        loading,
        error,
        create,
        update,
        openForm,
        createInterview,
        updateInterview,
        exportBackup: () => repository.exportBackup(),
        previewRestore: (text) => repository.previewRestore(text),
        restoreBackup,
        cancelRestore: (token) => repository.cancelRestore(token),
      }}
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
