export * from './application';
export * from './interview';
export * from './backup';
export * from './capture';
export type WorkspaceRepository =
  import('./application').ApplicationRepository &
    import('./interview').InterviewRepository &
    import('./backup').BackupRepository & {
      getWorkspace?: () => Promise<import('./backup').WorkspaceData>;
    };
export * from './migration';
export * from './document';
