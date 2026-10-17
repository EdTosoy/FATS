'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { workspaceActivityDays, type WorkspaceSnapshot } from '@fats/domain';
import type {
  ApplicationInput,
  WorkspaceRepository,
  Interview,
  InterviewInput,
  InterviewStatus,
  ApplicationStatus,
  JobApplication,
  RestorePreview,
  JobCapture,
} from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
} from '@/lib/local-application-repository';
import { JobFormDialog } from './job-form-dialog';

interface ApplicationContextValue {
  refreshWorkspace: () => Promise<void>;
  createCapturedApplication: (
    capture: JobCapture,
    input: ApplicationInput,
  ) => Promise<JobApplication>;
  exportBackup: () => Promise<string>;
  previewRestore: (text: string) => Promise<RestorePreview>;
  restoreBackup: (token: string) => Promise<void>;
  cancelRestore: (token: string) => void;
  activityDays: string[];
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
  const channel = useRef<BroadcastChannel | null>(null);
  const [activityDays, setActivityDays] = useState<string[]>([]);
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
    const snapshot = repository.getWorkspace
      ? repository.getWorkspace()
      : Promise.all([repository.list(), repository.listInterviews()]).then(
          ([applications, interviews]) => ({ applications, interviews }),
        );
    return snapshot.then(
      (snapshot: WorkspaceSnapshot) => {
        const { applications, interviews } = snapshot;
        setActivityDays(workspaceActivityDays(snapshot));
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
    channel.current = new BroadcastChannel('fats-workspace');
    channel.current.onmessage = () => {
      void refresh();
    };
    const timer = window.setInterval(
      () => setNow(new Date().toISOString()),
      30000,
    );
    function synchronize(event: StorageEvent) {
      if (event.key === APPLICATION_STORAGE_KEY || event.key === null)
        void refresh();
    }
    window.addEventListener('storage', synchronize);
    window.addEventListener('focus', refresh);
    window.addEventListener('fats:workspace-updated', refresh);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.clearInterval(timer);
      window.removeEventListener('storage', synchronize);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('fats:workspace-updated', refresh);
    };
  }, [refresh]);

  async function create(input: ApplicationInput) {
    const application = await repository.create(input);
    await refresh();
    channel.current?.postMessage('refresh');
    return application;
  }

  async function update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ) {
    const application = await repository.update(id, input);
    await refresh();
    channel.current?.postMessage('refresh');
    return application;
  }

  async function createInterview(input: InterviewInput) {
    const interview = await repository.createInterview(input);
    await refresh();
    channel.current?.postMessage('refresh');
    return interview;
  }
  async function updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ) {
    const interview = await repository.updateInterview(id, input);
    await refresh();
    channel.current?.postMessage('refresh');
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
    setActivityDays(workspaceActivityDays({ ...data, activityDays }));
    setNow(new Date().toISOString());
    setError(null);
    setLoading(false);
    setForm(null);
    channel.current?.postMessage('refresh');
  }

  return (
    <ApplicationContext.Provider
      value={{
        refreshWorkspace: async () => {
          await refresh();
          channel.current?.postMessage('refresh');
        },
        activityDays,
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
        createCapturedApplication: async (capture, input) => {
          const application = await repository.createCapturedApplication(
            capture,
            input,
          );
          await refresh();
          channel.current?.postMessage('refresh');
          return application;
        },
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
