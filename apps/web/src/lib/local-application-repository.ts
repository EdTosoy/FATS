import {
  createApplication,
  createBackup,
  serializeBackup,
  parseBackup,
  validateWorkspaceData,
  workspaceCounts,
  type WorkspaceData,
  type RestorePreview,
  updateApplication,
  type ApplicationInput,
  createInterview,
  updateInterview,
  upcomingInterviews,
  type Interview,
  type InterviewInput,
  type InterviewStatus,
  type WorkspaceRepository,
  type ApplicationStatus,
  type JobApplication,
  validateJobCapture,
  normalizeApplicationInput,
  canonicalPostingUrl,
  type JobCapture,
} from '@fats/domain';

export const APPLICATION_STORAGE_KEY = 'fats.applications.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class ApplicationStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationStorageError';
  }
}

// Only this adapter knows about the browser's storage format. The UI uses the interface.
export class LocalApplicationRepository implements WorkspaceRepository {
  private pendingRestore: {
    token: string;
    raw: string | null;
    data: WorkspaceData;
  } | null = null;
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getWorkspace(): Promise<WorkspaceData> {
    const data = this.read();
    return {
      applications: data.applications.sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
      interviews: data.interviews.sort((a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt),
      ),
    };
  }

  async list(): Promise<JobApplication[]> {
    return this.read().applications.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async create(input: ApplicationInput): Promise<JobApplication> {
    const data = this.read();
    const rows = data.applications;
    const application = createApplication(input, this.id(), this.now());
    this.write({ ...data, applications: [...rows, application] });
    return application;
  }

  async createCapturedApplication(
    capture: JobCapture,
    input: ApplicationInput,
  ): Promise<JobApplication> {
    const now = this.now();
    const valid = validateJobCapture(capture, now);
    const normalized = normalizeApplicationInput(input);
    const data = this.read();
    const existing = data.applications.find(
      (row) =>
        row.id === valid.id ||
        canonicalPostingUrl(row.sourceUrl) ===
          canonicalPostingUrl(normalized.sourceUrl),
    );
    if (existing) return existing; // Retry or already-saved posting; never overwrite it.
    const application = createApplication(normalized, valid.id, now);
    this.write({ ...data, applications: [...data.applications, application] });
    return application;
  }

  async update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ): Promise<JobApplication> {
    const data = this.read();
    const rows = data.applications;
    const current = rows.find((row) => row.id === id);
    if (!current)
      throw new ApplicationStorageError(
        'This application could not be found. Refresh and try again.',
      );
    const application = updateApplication(current, input, this.now());
    this.write({
      ...data,
      applications: rows.map((row) => (row.id === id ? application : row)),
    });
    return application;
  }

  async listInterviews(applicationId?: string): Promise<Interview[]> {
    return this.read()
      .interviews.filter(
        (row) => !applicationId || row.applicationId === applicationId,
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }
  async upcomingInterviews(now: string): Promise<Interview[]> {
    return upcomingInterviews(await this.listInterviews(), now);
  }
  async createInterview(input: InterviewInput): Promise<Interview> {
    const data = this.read();
    this.requireParent(data, input.applicationId);
    const interview = createInterview(input, this.id(), this.now());
    if (data.interviews.some((row) => row.id === interview.id))
      throw new ApplicationStorageError(
        'An interview with this identifier already exists. Try again.',
      );
    this.write({ ...data, interviews: [...data.interviews, interview] });
    return interview;
  }
  async updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ): Promise<Interview> {
    const data = this.read();
    this.requireParent(data, input.applicationId);
    const current = data.interviews.find((row) => row.id === id);
    if (!current)
      throw new ApplicationStorageError(
        'This interview could not be found. Refresh and try again.',
      );
    const interview = updateInterview(current, input, this.now());
    this.write({
      ...data,
      interviews: data.interviews.map((row) =>
        row.id === id ? interview : row,
      ),
    });
    return interview;
  }
  async deleteApplication(id: string): Promise<void> {
    const data = this.read();
    this.requireParent(data, id);
    if (data.interviews.some((row) => row.applicationId === id))
      throw new ApplicationStorageError(
        'This application has linked interviews and cannot be deleted. Keep it to preserve your interview history.',
      );
    this.write({
      ...data,
      applications: data.applications.filter((row) => row.id !== id),
    });
  }
  private requireParent(data: WorkspaceData, id: string) {
    if (!data.applications.some((row) => row.id === id))
      throw new ApplicationStorageError(
        'The linked application could not be found. Refresh and choose an existing application.',
      );
  }

  async exportBackup(): Promise<string> {
    // One validated read of the FATS key: both collections share one snapshot.
    return serializeBackup(createBackup(this.read(), this.now()));
  }

  async previewRestore(text: string): Promise<RestorePreview> {
    this.pendingRestore = null;
    const backup = parseBackup(text);
    const raw = this.readRaw();
    let current = null;
    try {
      current = workspaceCounts(this.decode(raw));
    } catch {
      /* Explicit confirmation can recover an unreadable workspace. */
    }
    const token = crypto.randomUUID();
    this.pendingRestore = { token, raw, data: backup.data };
    return {
      token,
      exportedAt: backup.exportedAt,
      incoming: workspaceCounts(backup.data),
      current,
    };
  }

  cancelRestore(token: string): void {
    if (this.pendingRestore?.token === token) this.pendingRestore = null;
  }

  async restoreBackup(token: string): Promise<WorkspaceData> {
    const staged = this.pendingRestore;
    if (!staged || staged.token !== token)
      throw new ApplicationStorageError(
        'Preview the backup again before restoring.',
      );
    // Do not overwrite changes made after the user reviewed the counts.
    if (this.readRaw() !== staged.raw) {
      this.pendingRestore = null;
      throw new ApplicationStorageError(
        'Your workspace changed since this preview. Cancel and preview the backup again before replacing it.',
      );
    }
    const data = validateWorkspaceData(staged.data);
    // A single setItem atomically replaces both collections. Never clear first.
    this.write(data);
    this.pendingRestore = null;
    return data;
  }

  private readRaw(): string | null {
    try {
      return this.storage.getItem(APPLICATION_STORAGE_KEY);
    } catch {
      throw new ApplicationStorageError(
        'FATS cannot access browser storage. Allow local storage in your browser and refresh.',
      );
    }
  }

  private read(): WorkspaceData {
    return this.decode(this.readRaw());
  }

  private decode(raw: string | null): WorkspaceData {
    if (raw === null) return { applications: [], interviews: [] };
    try {
      const data: unknown = JSON.parse(raw);
      if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        data.version !== 1 ||
        !('applications' in data)
      )
        throw new Error('Invalid storage');
      return validateWorkspaceData({
        applications: data.applications,
        interviews: 'interviews' in data ? data.interviews : [],
      });
    } catch {
      throw new ApplicationStorageError(
        'Your saved data could not be read. It has been left untouched. See Help for recovery guidance.',
      );
    }
  }

  private write(data: WorkspaceData): void {
    try {
      this.storage.setItem(
        APPLICATION_STORAGE_KEY,
        JSON.stringify({ version: 1, ...data }),
      );
    } catch {
      throw new ApplicationStorageError(
        'Your changes could not be saved. Browser storage may be full or blocked. Your previous data is unchanged; keep this form open and try again.',
      );
    }
  }
}
