import {
  validateActivityDays,
  type WorkspaceSnapshot,
  parseBackup,
  serializeBackup,
  validateWorkspaceData,
  upcomingInterviews,
  type WorkspaceData,
  type WorkspaceRepository,
  type ApplicationInput,
  type ApplicationStatus,
  type InterviewInput,
  type InterviewStatus,
  type JobCapture,
  type JobApplication,
  type Interview,
  type RestorePreview,
  type LocalMigrationPreview,
} from '@fats/domain';
export const SESSION_EXPIRED_EVENT = 'fats:session-expired';
export const ACCOUNT_CHANGED_EVENT = 'fats:account-changed';
export class HttpWorkspaceRepository implements WorkspaceRepository {
  private reading: Promise<WorkspaceSnapshot> | null = null;
  private pendingCreates = new Map<string, string>();
  constructor(private readonly accountId: string) {}
  async request<T>(
    action?: string,
    fields: Record<string, unknown> = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/api/workspace', {
        method: action ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          ...(action ? { 'Content-Type': 'application/json' } : {}),
          'X-FATS-Account': this.accountId,
        },
        ...(action ? { body: JSON.stringify({ action, ...fields }) } : {}),
      });
    } catch {
      throw new Error(
        'The account connection was interrupted. Keep this form open and retry. Nothing was saved to your local workspace.',
      );
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401)
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      if (data.code === 'ACCOUNT_CHANGED' || data.code === 'EMAIL_UNVERIFIED')
        window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : 'Your account could not be updated. Retry.',
      );
    }
    return data as T;
  }
  getWorkspace(): Promise<WorkspaceSnapshot> {
    if (!this.reading)
      this.reading = this.request<unknown>()
        .then((value) => ({
          ...validateWorkspaceData(value),
          activityDays: validateActivityDays(
            (value as WorkspaceSnapshot).activityDays,
          ),
        }))
        .finally(() => {
          this.reading = null;
        });
    return this.reading;
  }
  async list() {
    return (await this.getWorkspace()).applications;
  }
  async listInterviews(applicationId?: string) {
    return (await this.getWorkspace()).interviews.filter(
      (row) =>
        applicationId === undefined || row.applicationId === applicationId,
    );
  }
  async upcomingInterviews(now: string) {
    return upcomingInterviews(await this.listInterviews(), now);
  }
  private async createRecord<T>(
    action: string,
    input: ApplicationInput | InterviewInput,
  ): Promise<T> {
    const key = JSON.stringify({ action, input });
    const id = this.pendingCreates.get(key) ?? crypto.randomUUID();
    this.pendingCreates.set(key, id);
    const result = await this.request<T>(action, { id, input });
    this.pendingCreates.delete(key);
    return result;
  }
  create(input: ApplicationInput) {
    return this.createRecord<JobApplication>('create', input);
  }
  update(id: string, input: ApplicationInput & { status: ApplicationStatus }) {
    return this.request<JobApplication>('update', { id, input });
  }
  deleteApplication(id: string) {
    return this.request<void>('delete-application', { id });
  }
  createInterview(input: InterviewInput) {
    return this.createRecord<Interview>('create-interview', input);
  }
  updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ) {
    return this.request<Interview>('update-interview', { id, input });
  }
  deleteInterview(id: string) {
    return this.request<void>('delete-interview', { id });
  }
  createCapturedApplication(capture: JobCapture, input: ApplicationInput) {
    return this.request<JobApplication>('capture', { capture, input });
  }
  async exportBackup() {
    return serializeBackup(parseBackup(await this.request<string>('export')));
  }
  previewRestore(text: string) {
    parseBackup(text);
    return this.request<RestorePreview>('preview-restore', { text });
  }
  restoreBackup(token: string) {
    return this.request<WorkspaceData>('restore', {
      token,
      confirmed: true,
    }).then(validateWorkspaceData);
  }
  cancelRestore(token: string) {
    void this.request('cancel', { token }).catch(() => {});
  }
  previewMigration(text: string) {
    parseBackup(text);
    return this.request<LocalMigrationPreview>('preview-migration', { text });
  }
  migrateLocal(token: string) {
    return this.request<WorkspaceData>('migrate', {
      token,
      confirmed: true,
    }).then(validateWorkspaceData);
  }
}
