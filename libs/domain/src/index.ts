export * from './application';
export * from './csv-import';
export * from './interview';
export * from './backup';
export * from './capture';
export type WorkspaceRepository =
  import('./application').ApplicationRepository &
    import('./interview').InterviewRepository &
    import('./backup').BackupRepository &
    import('./csv-import').CsvImportRepository & {
      getWorkspace?: () => Promise<import('./momentum').WorkspaceSnapshot>;
    };
export * from './migration';
export * from './document';
export * from './matching';
export * from './offer';
export * from './offer-backup';
export * from './career';
export * from './career-backup';
export * from './momentum';
