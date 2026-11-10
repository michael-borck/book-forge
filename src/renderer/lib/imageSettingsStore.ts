import { create } from 'zustand';
import {
  api,
  ApiError,
  type ImageProviderConfigInput,
  type ImageProviderInfo,
  type RedactedImageProviderConfig,
} from './api';

interface ImageSettingsState {
  providers: ImageProviderInfo[];
  configured: Record<string, RedactedImageProviderConfig>;
  current: string | null;
  loading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  configure: (
    id: string,
    config: ImageProviderConfigInput
  ) => Promise<{ ok: boolean; message?: string }>;
  setCurrent: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useImageSettingsStore = create<ImageSettingsState>((set, get) => ({
  providers: [],
  configured: {},
  current: null,
  loading: false,
  error: null,

  async refresh() {
    if (!api.isDesktop()) {
      set({ error: 'Image providers are only available in the desktop app.', loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const state = await api.listImageProviders();
      set({ ...state, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load image providers',
      });
    }
  },

  async configure(id, config) {
    try {
      const state = await api.configureImageProvider(id, config);
      set({ ...state });
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Failed to configure image provider';
      await get().refresh();
      return { ok: false, message };
    }
  },

  async setCurrent(id) {
    try {
      await api.setCurrentImageProvider(id);
    } finally {
      await get().refresh();
    }
  },

  async remove(id) {
    try {
      const state = await api.removeImageProvider(id);
      set({ ...state });
    } finally {
      await get().refresh();
    }
  },
}));
