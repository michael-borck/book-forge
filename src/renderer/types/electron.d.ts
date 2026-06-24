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
    remove: (providerId: string) => Promise<IpcResult<{ providerId: string }>>;
    models: (providerId: string) => Promise<IpcResult<{ models: unknown[] }>>;
  };
  book: {
    generate: (params: unknown) => Promise<IpcResult<{ book: unknown }>>;
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
