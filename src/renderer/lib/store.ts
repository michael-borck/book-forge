/**
 * Global renderer state (zustand). Currently holds provider/settings state;
 * book + generation slices will be added in later phases.
 */

import { create } from 'zustand';
import {
  api,
  ApiError,
  type ProviderInfo,
  type RedactedProviderConfig,
  type ProviderConfigInput,
  type Book,
  type BookProgress,
  type BookRequestInput,
} from './api';

export type ProviderUiStatus = 'ready' | 'configured' | 'error' | 'not-configured';

interface SettingsState {
  providers: ProviderInfo[];
  statuses: Record<string, string>;
  configured: Record<string, RedactedProviderConfig>;
  current: string | null;
  loading: boolean;
  /** Set when the bridge is unavailable (e.g. opened in a plain browser). */
  unavailable: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  configure: (
    providerId: string,
    config: ProviderConfigInput
  ) => Promise<{ ok: boolean; message?: string }>;
  remove: (providerId: string) => Promise<void>;
  setCurrent: (providerId: string) => Promise<void>;
  /** Derive the display status for a provider id. */
  uiStatus: (providerId: string) => ProviderUiStatus;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  statuses: {},
  configured: {},
  current: null,
  loading: false,
  unavailable: false,
  error: null,

  async refresh() {
    if (!api.isDesktop()) {
      set({ unavailable: true, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const [providers, statusResult, configured] = await Promise.all([
        api.listProviders(),
        api.providerStatus(),
        api.configuredProviders(),
      ]);
      set({
        providers,
        statuses: statusResult.statuses,
        current: statusResult.current,
        configured,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load providers',
      });
    }
  },

  async configure(providerId, config) {
    try {
      await api.initializeProvider(providerId, config);
      await get().refresh();
      return { ok: true };
    } catch (error) {
      // Refresh anyway so a stored-but-unhealthy provider still shows up.
      await get().refresh();
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Failed to configure provider';
      return { ok: false, message };
    }
  },

  async remove(providerId) {
    try {
      await api.removeProvider(providerId);
    } finally {
      await get().refresh();
    }
  },

  async setCurrent(providerId) {
    try {
      await api.setCurrentProvider(providerId);
    } finally {
      await get().refresh();
    }
  },

  uiStatus(providerId) {
    const { statuses, configured } = get();
    const status = statuses[providerId];
    if (status === 'ready') return 'ready';
    if (status === 'error') return 'error';
    if (configured[providerId]) return 'configured';
    return 'not-configured';
  },
}));

interface BookState {
  books: Book[];
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  generating: boolean;
  progress: BookProgress | null;
  /** Id of the in-flight generation (from progress events), for cancellation. */
  currentBookId: string | null;

  refresh: () => Promise<void>;
  generate: (
    req: BookRequestInput
  ) => Promise<{ ok: boolean; book?: Book; message?: string }>;
  cancel: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  loading: false,
  unavailable: false,
  error: null,
  generating: false,
  progress: null,
  currentBookId: null,

  async refresh() {
    if (!api.isDesktop()) {
      set({ unavailable: true, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const books = await api.listBooks();
      set({ books, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load library',
      });
    }
  },

  async generate(req) {
    set({ generating: true, progress: null, currentBookId: null, error: null });
    const unsubscribe = api.onBookProgress((progress) =>
      set({ progress, currentBookId: progress.bookId })
    );
    try {
      const book = await api.generateBook(req);
      await get().refresh();
      return { ok: true, book };
    } catch (error) {
      await get().refresh();
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Failed to generate book';
      return { ok: false, message };
    } finally {
      unsubscribe();
      set({ generating: false, currentBookId: null });
    }
  },

  async cancel() {
    const id = get().currentBookId;
    if (id) await api.cancelBook(id);
  },

  async remove(id) {
    try {
      await api.deleteBook(id);
    } finally {
      await get().refresh();
    }
  },
}));
