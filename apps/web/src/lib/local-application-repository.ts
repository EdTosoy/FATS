import {
  createApplication,
  isApplicationStatus,
  normalizeApplicationInput,
  updateApplication,
  type ApplicationInput,
  type ApplicationRepository,
  type ApplicationStatus,
  type JobApplication,
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

function isStoredApplication(value: unknown): value is JobApplication {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (
    ![
      'id',
      'title',
      'company',
      'sourceUrl',
      'location',
      'description',
      'createdAt',
      'updatedAt',
    ].every((key) => typeof row[key] === 'string')
  )
    return false;
  if (
    !row.id ||
    !isApplicationStatus(row.status) ||
    !Number.isFinite(Date.parse(row.createdAt as string)) ||
    !Number.isFinite(Date.parse(row.updatedAt as string))
  )
    return false;
  try {
    normalizeApplicationInput(row as unknown as ApplicationInput);
    return true;
  } catch {
    return false;
  }
}

// Only this adapter knows about the browser's storage format. The UI uses the interface.
export class LocalApplicationRepository implements ApplicationRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(): Promise<JobApplication[]> {
    return this.read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: ApplicationInput): Promise<JobApplication> {
    const rows = this.read();
    const application = createApplication(input, this.id(), this.now());
    this.write([...rows, application]);
    return application;
  }

  async update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ): Promise<JobApplication> {
    const rows = this.read();
    const current = rows.find((row) => row.id === id);
    if (!current)
      throw new ApplicationStorageError(
        'This application could not be found. Refresh and try again.',
      );
    const application = updateApplication(current, input, this.now());
    this.write(rows.map((row) => (row.id === id ? application : row)));
    return application;
  }

  private read(): JobApplication[] {
    let raw: string | null;
    try {
      raw = this.storage.getItem(APPLICATION_STORAGE_KEY);
    } catch {
      throw new ApplicationStorageError(
        'FATS cannot access browser storage. Allow local storage in your browser and refresh.',
      );
    }
    if (raw === null) return [];
    try {
      const data: unknown = JSON.parse(raw);
      if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        data.version !== 1 ||
        !('applications' in data) ||
        !Array.isArray(data.applications) ||
        !data.applications.every(isStoredApplication)
      )
        throw new Error('Invalid storage');
      const ids = data.applications.map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate IDs');
      return data.applications;
    } catch {
      throw new ApplicationStorageError(
        'Your saved data could not be read. It has been left untouched. See Help for recovery guidance.',
      );
    }
  }

  private write(applications: JobApplication[]): void {
    try {
      this.storage.setItem(
        APPLICATION_STORAGE_KEY,
        JSON.stringify({ version: 1, applications }),
      );
    } catch {
      throw new ApplicationStorageError(
        'Your changes could not be saved. Browser storage may be full or blocked. Your previous data is unchanged; keep this form open and try again.',
      );
    }
  }
}
