// Result envelope returned by every IPC handler.
export type IpcResult<T = Record<string, unknown>> =
  | ({ success: true } & T)
  | { success: false; error: { code: string; message: string } };

export interface ElectronAPI {
  provider: {
    list: () => Promise<IpcResult<{ providers: unknown[] }>>;
    configured: () => Promise<IpcResult<{ configured: Record<string, unknown> }>>;
    status: () => Promise<IpcResult<{ statuses: Record<string, string>; current: string | null }>>;
    initialize: (
      providerId: string,
      config: unknown
    ) => Promise<IpcResult<{ providerId: string; status: string }>>;
    setCurrent: (providerId: string) => Promise<IpcResult<{ current: string }>>;
    setModel: (
      providerId: string,
      model: string
    ) => Promise<IpcResult<{ providerId: string; model: string }>>;
    remove: (providerId: string) => Promise<IpcResult<{ providerId: string }>>;
    models: (providerId: string) => Promise<IpcResult<{ models: unknown[] }>>;
  };
  project: {
    list: () => Promise<IpcResult<{ projects: unknown[] }>>;
    templates: () => Promise<IpcResult<{ templates: unknown[] }>>;
    get: (id: string) => Promise<IpcResult<{ project: unknown }>>;
    create: (input: unknown) => Promise<IpcResult<{ project: unknown }>>;
    updateMeta: (id: string, patch: unknown) => Promise<IpcResult<{ project: unknown }>>;
    delete: (id: string) => Promise<IpcResult<{ id: string }>>;
    duplicate: (id: string) => Promise<IpcResult<{ project: unknown }>>;
    plan: (id: string) => Promise<IpcResult<{ project: unknown }>>;
    generate: (id: string) => Promise<IpcResult<{ project: unknown }>>;
    cancel: (id: string) => Promise<IpcResult<{ id: string }>>;
    continuity: (id: string) => Promise<IpcResult<{ project: unknown; result: unknown }>>;
  };
  node: {
    create: (projectId: string, input: unknown) => Promise<IpcResult<{ project: unknown; nodeId: string }>>;
    update: (projectId: string, nodeId: string, patch: unknown) => Promise<IpcResult<{ project: unknown }>>;
    move: (projectId: string, nodeId: string, move: unknown) => Promise<IpcResult<{ project: unknown }>>;
    delete: (projectId: string, nodeId: string) => Promise<IpcResult<{ project: unknown }>>;
    aiEdit: (projectId: string, nodeId: string, payload: unknown) => Promise<IpcResult<{ project: unknown }>>;
  };
  research: {
    import: (projectId: string) => Promise<IpcResult<{ project: unknown; nodeId?: string; canceled: boolean }>>;
  };
  snapshot: {
    list: (projectId: string, nodeId?: string) => Promise<IpcResult<{ snapshots: unknown[] }>>;
    create: (projectId: string, nodeId: string, reason: string) => Promise<IpcResult<{ snapshot: unknown }>>;
    restore: (projectId: string, snapshotId: string) => Promise<IpcResult<{ project: unknown }>>;
    diff: (projectId: string, snapshotId: string) => Promise<IpcResult<{ snapshotId: string; nodeId: string; lines: unknown[] }>>;
  };
  imageProvider: {
    list: () => Promise<IpcResult<unknown>>;
    configure: (id: string, config: unknown) => Promise<IpcResult<unknown>>;
    setCurrent: (id: string) => Promise<IpcResult<{ current: string }>>;
    remove: (id: string) => Promise<IpcResult<unknown>>;
    styles: () => Promise<IpcResult<{ styles: unknown[] }>>;
  };
  artwork: {
    plan: (projectId: string, payload?: unknown) => Promise<IpcResult<{ project: unknown }>>;
    update: (projectId: string, artworkId: string, patch: unknown) => Promise<IpcResult<{ project: unknown }>>;
    remove: (projectId: string, artworkId: string) => Promise<IpcResult<{ project: unknown }>>;
    generate: (projectId: string, artworkId: string) => Promise<IpcResult<{ project: unknown }>>;
    generateAll: (projectId: string, options?: unknown) => Promise<IpcResult<{ project: unknown }>>;
    upload: (projectId: string, payload?: unknown) => Promise<IpcResult<{ project: unknown; canceled: boolean; artworkId?: string }>>;
    asset: (projectId: string, artworkId: string, variant: 'thumb' | 'full') => Promise<IpcResult<{ dataUrl: string }>>;
    onProgress: (callback: (progress: unknown) => void) => () => void;
  };
  compile: {
    run: (payload: unknown) => Promise<IpcResult<{ canceled: boolean; path?: string; warnings?: string[] }>>;
    batch: (payload: unknown) => Promise<IpcResult<{ canceled: boolean; results: unknown[] }>>;
  };
  book: {
    estimate: (params: unknown) => Promise<IpcResult<unknown>>;
    generate: (params: unknown) => Promise<IpcResult<{ book: unknown }>>;
    cancel: (id: string) => Promise<IpcResult<{ id: string }>>;
    retry: (id: string) => Promise<IpcResult<{ book: unknown }>>;
    list: () => Promise<IpcResult<{ books: unknown[] }>>;
    get: (id: string) => Promise<IpcResult<{ book: unknown }>>;
    delete: (id: string) => Promise<IpcResult<{ id: string }>>;
    onProgress: (callback: (progress: unknown) => void) => () => void;
  };
  export: {
    markdown: (bookId: string) => Promise<IpcResult<{ canceled: boolean; path?: string }>>;
    html: (bookId: string) => Promise<IpcResult<{ canceled: boolean; path?: string }>>;
    pdf: (bookId: string) => Promise<IpcResult<{ canceled: boolean; path?: string }>>;
  };
  config: {
    get: (key: string) => Promise<IpcResult<{ value: unknown }>>;
    set: (key: string, value: unknown) => Promise<IpcResult<{ key: string }>>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
