export * from './application';
export * from './interview';
export * from './backup';
export type WorkspaceRepository =
  import('./application').ApplicationRepository &
    import('./interview').InterviewRepository &
    import('./backup').BackupRepository;
