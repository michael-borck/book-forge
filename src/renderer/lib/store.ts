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
