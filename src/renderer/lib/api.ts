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
};
