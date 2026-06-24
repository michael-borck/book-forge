/**
 * SecureConfigStore - persistence for app configuration and provider credentials.
 *
 * Non-secret settings are stored as plain JSON via electron-store. Provider API
 * keys are encrypted at rest with Electron's `safeStorage` (OS keychain-backed)
 * and are NEVER returned to the renderer — the renderer only ever sees a
 * redacted view (`hasApiKey: boolean`). Decrypted configs stay in the main
 * process, where the provider clients actually use them.
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { ProviderConfig } from '../../shared/types';

// Shape of a persisted provider entry. The API key is stored separately, as a
// base64-encoded ciphertext, so the rest of the config can remain plain JSON.
interface StoredProviderEntry {
  config: Omit<ProviderConfig, 'apiKey'>;
  encryptedApiKey?: string; // base64 of safeStorage ciphertext
  // True when encryptedApiKey actually holds ciphertext; false when the platform
  // has no encryption backend and we had to fall back to plaintext (see below).
  encrypted?: boolean;
  apiKeyPlaintext?: string; // only set on the insecure fallback path
}

interface StoreSchema {
  app: Record<string, unknown>;
  providers: Record<string, StoredProviderEntry>;
}

// A provider config safe to hand to the renderer: no key material, just a flag.
export type RedactedProviderConfig = Omit<ProviderConfig, 'apiKey'> & {
  hasApiKey: boolean;
};

export class SecureConfigStore {
  private readonly store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'bookforge-config',
      defaults: { app: {}, providers: {} },
    });
  }

  // ===== Generic (non-secret) application config =====

  getAppValue(key: string): unknown {
    return (this.store.get('app') ?? {})[key] ?? null;
  }

  setAppValue(key: string, value: unknown): void {
    const app = { ...(this.store.get('app') ?? {}) };
    app[key] = value;
    this.store.set('app', app);
  }

  // ===== Provider configuration (with encrypted API keys) =====

  /**
   * Persist a provider configuration, encrypting the API key at rest.
   */
  setProviderConfig(providerId: string, config: ProviderConfig): void {
    const { apiKey, ...rest } = config;
    const entry: StoredProviderEntry = { config: rest };

    if (apiKey && apiKey.trim()) {
      if (safeStorage.isEncryptionAvailable()) {
        entry.encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64');
        entry.encrypted = true;
      } else {
        // No OS encryption backend (e.g. a Linux box without a keyring). Storing
        // the key plaintext is the documented fallback; warn loudly so it isn't
        // silently insecure.
        console.warn(
          `safeStorage encryption unavailable — storing API key for "${providerId}" UNENCRYPTED.`
        );
        entry.apiKeyPlaintext = apiKey;
        entry.encrypted = false;
      }
    }

    const providers = { ...this.store.get('providers') };
    providers[providerId] = entry;
    this.store.set('providers', providers);
  }

  /**
   * Full provider config including the decrypted API key. Main-process only —
   * never send the result of this across IPC.
   */
  getProviderConfig(providerId: string): ProviderConfig | null {
    const entry = this.store.get('providers')[providerId];
    if (!entry) return null;

    let apiKey: string | undefined;
    if (entry.encrypted && entry.encryptedApiKey) {
      try {
        apiKey = safeStorage.decryptString(Buffer.from(entry.encryptedApiKey, 'base64'));
      } catch (error) {
        console.error(`Failed to decrypt API key for "${providerId}":`, error);
        apiKey = undefined;
      }
    } else if (entry.apiKeyPlaintext) {
      apiKey = entry.apiKeyPlaintext;
    }

    return { ...entry.config, ...(apiKey ? { apiKey } : {}) };
  }

  /**
   * Renderer-safe view of a single provider config (no key material).
   */
  getRedactedProviderConfig(providerId: string): RedactedProviderConfig | null {
    const entry = this.store.get('providers')[providerId];
    if (!entry) return null;
    return {
      ...entry.config,
      hasApiKey: Boolean(entry.encryptedApiKey || entry.apiKeyPlaintext),
    };
  }

  /**
   * Renderer-safe view of all stored provider configs, keyed by provider id.
   */
  listRedactedProviderConfigs(): Record<string, RedactedProviderConfig> {
    const result: Record<string, RedactedProviderConfig> = {};
    const providers = this.store.get('providers');
    for (const id of Object.keys(providers)) {
      const redacted = this.getRedactedProviderConfig(id);
      if (redacted) result[id] = redacted;
    }
    return result;
  }

  /** Ids of all providers that have a stored configuration. */
  getConfiguredProviderIds(): string[] {
    return Object.keys(this.store.get('providers'));
  }

  deleteProviderConfig(providerId: string): void {
    const providers = { ...this.store.get('providers') };
    delete providers[providerId];
    this.store.set('providers', providers);
  }
}

// Single shared instance for the main process.
export const secureConfigStore = new SecureConfigStore();
