/**
 * Typed wrapper around the Electron preload bridge (`window.electronAPI`).
 *
 * Every main-process handler returns a `{ success, error }` envelope; this
 * module unwraps it — resolving with the payload on success and throwing a
 * structured `ApiError` on failure — so callers can use plain try/catch and
 * never touch `window` directly.
 */

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  website?: string;
  supportsStreaming: boolean;
  supportsLocalModels: boolean;
  requiresApiKey: boolean;
}

export interface RedactedProviderConfig {
  hasApiKey: boolean;
  endpoint?: string;
  organizationId?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ProviderConfigInput {
  apiKey?: string;
  endpoint?: string;
  organizationId?: string;
}

export type BookStatus = 'generating' | 'completed' | 'error' | 'cancelled';
export type ChapterStatus = 'pending' | 'generating' | 'completed' | 'error';

export interface BookChapter {
  id: string;
  number: number;
  title: string;
  content: string;
  status: ChapterStatus;
  tokens: number;
}

export interface Book {
  id: string;
  title: string;
  description: string;
  topic: string;
  style: string;
  length: string;
  provider: string;
  model: string;
  status: BookStatus;
  error?: string;
  chapters: BookChapter[];
  totalTokens: number;
  createdAt: string;
  modifiedAt: string;
}

export interface BookRequestInput {
  topic: string;
  style: string;
  length: string;
  providerId?: string;
  model?: string;
}

export type ExportFormat = 'markdown' | 'html' | 'pdf';

export interface BookProgress {
  bookId: string;
  status: BookStatus;
  phase: 'outline' | 'chapter' | 'done' | 'error';
  currentChapter?: number;
  totalChapters?: number;
  chapterTitle?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True when running inside the desktop app (preload bridge present). */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

function bridge() {
  if (!isDesktop()) {
    throw new ApiError(
      'NO_BRIDGE',
      'This feature is only available in the BookForge desktop app.'
    );
  }
  return window.electronAPI;
}

// Unwrap the IPC result envelope: return the payload, or throw on failure.
async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const res = (await promise) as
    | ({ success: true } & Record<string, unknown>)
    | { success: false; error?: { code?: string; message?: string } };

  if (!res || typeof res !== 'object') {
    throw new ApiError('INVALID_RESPONSE', 'Malformed response from main process');
  }
  if (res.success) {
    const data = { ...res } as Record<string, unknown>;
    delete data.success;
    return data as T;
  }
  throw new ApiError(res.error?.code ?? 'UNKNOWN', res.error?.message ?? 'Unknown error');
}

export const api = {
  isDesktop,

  async listProviders(): Promise<ProviderInfo[]> {
    const { providers } = await unwrap<{ providers: ProviderInfo[] }>(
      bridge().provider.list()
    );
    return providers;
  },

  async providerStatus(): Promise<{ statuses: Record<string, string>; current: string | null }> {
    return unwrap(bridge().provider.status());
  },

  async configuredProviders(): Promise<Record<string, RedactedProviderConfig>> {
    const { configured } = await unwrap<{ configured: Record<string, RedactedProviderConfig> }>(
      bridge().provider.configured()
    );
    return configured;
  },

  async initializeProvider(
    providerId: string,
    config: ProviderConfigInput
  ): Promise<{ providerId: string; status: string }> {
    return unwrap(bridge().provider.initialize(providerId, config));
  },

  async setCurrentProvider(providerId: string): Promise<void> {
    await unwrap(bridge().provider.setCurrent(providerId));
  },

  async removeProvider(providerId: string): Promise<void> {
    await unwrap(bridge().provider.remove(providerId));
  },

  async generateBook(req: BookRequestInput): Promise<Book> {
    const { book } = await unwrap<{ book: Book }>(bridge().book.generate(req));
    return book;
  },

  async cancelBook(bookId: string): Promise<void> {
    await unwrap(bridge().book.cancel(bookId));
  },

  async listBooks(): Promise<Book[]> {
    const { books } = await unwrap<{ books: Book[] }>(bridge().book.list());
    return books;
  },

  async getBook(id: string): Promise<Book> {
    const { book } = await unwrap<{ book: Book }>(bridge().book.get(id));
    return book;
  },

  async deleteBook(id: string): Promise<void> {
    await unwrap(bridge().book.delete(id));
  },

  async exportBook(
    bookId: string,
    format: ExportFormat
  ): Promise<{ canceled: boolean; path?: string }> {
    return unwrap(bridge().export[format](bookId));
  },

  /** Subscribe to generation progress. Returns an unsubscribe function. */
  onBookProgress(callback: (progress: BookProgress) => void): () => void {
    if (!isDesktop()) return () => {};
    return window.electronAPI.book.onProgress((p) => callback(p as BookProgress));
  },
};
