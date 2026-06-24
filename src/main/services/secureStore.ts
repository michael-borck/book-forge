/**
 * SecureConfigStore - persistence for app configuration and provider credentials.
 *
 * Non-secret settings are stored as plain JSON via electron-store. Secret fields
 * (API keys, bearer tokens) are encrypted at rest with Electron's `safeStorage`
 * (OS keychain-backed) and are NEVER returned to the renderer — it only sees a
 * redacted view (`hasApiKey` / `hasBearerToken`). Decrypted configs stay in the
 * main process, where the provider clients actually use them.
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { ProviderConfig } from '../../shared/types';

// Fields that must never be persisted in plaintext.
const SECRET_FIELDS = ['apiKey', 'bearerToken'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

type NonSecretConfig = Omit<ProviderConfig, SecretField>;

interface StoredSecret {
  value: string; // base64 ciphertext, or plaintext on the insecure fallback path
  encrypted: boolean;
}

interface StoredProviderEntry {
  config: NonSecretConfig;
  secrets?: Partial<Record<SecretField, StoredSecret>>;
  // Legacy single-key fields, read for back-compat with earlier versions.
  encryptedApiKey?: string;
  apiKeyPlaintext?: string;
  encrypted?: boolean;
}

interface StoreSchema {
  app: Record<string, unknown>;
  providers: Record<string, StoredProviderEntry>;
}

// A provider config safe to hand to the renderer: no secret material, just flags.
export type RedactedProviderConfig = NonSecretConfig & {
  hasApiKey: boolean;
  hasBearerToken: boolean;
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

  // ===== Provider configuration (with encrypted secrets) =====

  /** Persist a provider configuration, encrypting any secret fields at rest. */
  setProviderConfig(providerId: string, config: ProviderConfig): void {
    const rest: Record<string, unknown> = { ...config };
    const secrets: Partial<Record<SecretField, StoredSecret>> = {};

    for (const field of SECRET_FIELDS) {
      const value = config[field];
      delete rest[field];
      if (typeof value === 'string' && value.trim()) {
        secrets[field] = this.encryptSecret(providerId, field, value);
      }
    }

    const entry: StoredProviderEntry = { config: rest as NonSecretConfig };
    if (Object.keys(secrets).length) entry.secrets = secrets;

    const providers = { ...this.store.get('providers') };
    providers[providerId] = entry;
    this.store.set('providers', providers);
  }

  /**
   * Full provider config including decrypted secrets. Main-process only — never
   * send the result of this across IPC.
   */
  getProviderConfig(providerId: string): ProviderConfig | null {
    const entry = this.store.get('providers')[providerId];
    if (!entry) return null;

    const result: ProviderConfig = { ...entry.config };
    for (const field of SECRET_FIELDS) {
      const secret = entry.secrets?.[field];
      if (secret) {
        const value = this.decryptSecret(providerId, field, secret);
        if (value) result[field] = value;
      }
    }
    // Back-compat: earlier versions stored only the API key on the entry itself.
    if (!result.apiKey) {
      const legacy = this.readLegacyApiKey(providerId, entry);
      if (legacy) result.apiKey = legacy;
    }
    return result;
  }

  /** Renderer-safe view of a single provider config (no secret material). */
  getRedactedProviderConfig(providerId: string): RedactedProviderConfig | null {
    const entry = this.store.get('providers')[providerId];
    if (!entry) return null;
    const hasLegacyKey = Boolean(entry.encryptedApiKey || entry.apiKeyPlaintext);
    return {
      ...entry.config,
      hasApiKey: Boolean(entry.secrets?.apiKey) || hasLegacyKey,
      hasBearerToken: Boolean(entry.secrets?.bearerToken),
    };
  }

  /** Renderer-safe view of all stored provider configs, keyed by provider id. */
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

  // ===== Internals =====

  private encryptSecret(providerId: string, field: SecretField, value: string): StoredSecret {
    if (safeStorage.isEncryptionAvailable()) {
      return { value: safeStorage.encryptString(value).toString('base64'), encrypted: true };
    }
    // No OS encryption backend (e.g. a Linux box without a keyring). Storing the
    // value plaintext is the documented fallback; warn loudly.
    console.warn(
      `safeStorage encryption unavailable — storing "${field}" for "${providerId}" UNENCRYPTED.`
    );
    return { value, encrypted: false };
  }

  private decryptSecret(
    providerId: string,
    field: SecretField,
    secret: StoredSecret
  ): string | undefined {
    if (!secret.encrypted) return secret.value;
    try {
      return safeStorage.decryptString(Buffer.from(secret.value, 'base64'));
    } catch (error) {
      console.error(`Failed to decrypt "${field}" for "${providerId}":`, error);
      return undefined;
    }
  }

  private readLegacyApiKey(providerId: string, entry: StoredProviderEntry): string | undefined {
    if (entry.encrypted && entry.encryptedApiKey) {
      try {
        return safeStorage.decryptString(Buffer.from(entry.encryptedApiKey, 'base64'));
      } catch (error) {
        console.error(`Failed to decrypt legacy API key for "${providerId}":`, error);
        return undefined;
      }
    }
    return entry.apiKeyPlaintext;
  }
}

// Single shared instance for the main process.
export const secureConfigStore = new SecureConfigStore();
