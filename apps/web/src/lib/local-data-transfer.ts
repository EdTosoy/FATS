import { workspaceCounts } from '@fats/domain';
import {
  APPLICATION_STORAGE_KEY,
  LocalApplicationRepository,
  type KeyValueStorage,
} from './local-application-repository';
import type { HttpWorkspaceRepository } from './http-workspace-repository';
export class LocalDataTransfer {
  private readonly local: LocalApplicationRepository;
  private pending: { raw: string | null; token: string } | null = null;
  constructor(private readonly storage: KeyValueStorage) {
    this.local = new LocalApplicationRepository(storage);
  }
  async inspect() {
    return workspaceCounts(await this.local.getWorkspace());
  }
  exportBackup() {
    return this.local.exportBackup();
  }
  async preview(account: HttpWorkspaceRepository) {
    const raw = this.storage.getItem(APPLICATION_STORAGE_KEY);
    const text = await this.local.exportBackup();
    if (this.storage.getItem(APPLICATION_STORAGE_KEY) !== raw)
      throw new Error('Browser data changed. Preview it again.');
    const result = await account.previewMigration(text);
    this.pending = { raw, token: result.token };
    return result;
  }
  async confirm(account: HttpWorkspaceRepository, token: string) {
    if (!this.pending || this.pending.token !== token)
      throw new Error('Preview your browser data again.');
    if (this.storage.getItem(APPLICATION_STORAGE_KEY) !== this.pending.raw)
      throw new Error(
        'Your browser data changed since preview. Preview again before copying.',
      );
    return account.migrateLocal(token);
  }
  cancel(account: HttpWorkspaceRepository) {
    if (this.pending) account.cancelRestore(this.pending.token);
    this.pending = null;
  }
}
