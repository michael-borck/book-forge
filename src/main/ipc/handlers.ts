/**
 * IPC handlers — the trust boundary between the (untrusted) renderer and the
 * main process. Every payload is validated with zod before use, provider work
 * is delegated to the ProviderManager, and API keys live only in the encrypted
 * secure store (never returned to the renderer).
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { ZodError } from 'zod';

import { providerRegistry, ProviderManager } from '../services/providers';
import { registerAllProviders } from '../services/providers/registerProviders';
import { secureConfigStore } from '../services/secureStore';
import {
  providerIdSchema,
  providerConfigSchema,
  generationParamsSchema,
  appConfigKeySchema,
  appConfigValueSchema,
} from './schemas';
import type { ProviderConfig, GenerationParams } from '../../shared/types';

// A serialisable result envelope. Errors are returned (not thrown) so the
// renderer receives a structured payload instead of a stringified Error.
type IpcResult<T> =
  | ({ success: true } & T)
  | { success: false; error: { code: string; message: string } };

let manager: ProviderManager | null = null;
let initialized = false;

function ok<T>(data: T): { success: true } & T {
  return { success: true, ...data };
}

function fail(code: string, message: string): IpcResult<never> {
  return { success: false, error: { code, message } };
}

// Wrap a handler so validation/provider errors become a structured response.
function guard<A extends unknown[], R>(
  fn: (...args: A) => Promise<IpcResult<R>>
): (...args: A) => Promise<IpcResult<R>> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return fail('VALIDATION_ERROR', message);
      }
      const code = (error as { code?: string })?.code ?? 'INTERNAL_ERROR';
      const message = error instanceof Error ? error.message : String(error);
      return fail(code, message);
    }
  };
}

export function registerIPCHandlers(): void {
  if (!initialized) {
    registerAllProviders();
    manager = new ProviderManager();
    initialized = true;
    // Restore previously-configured providers in the background. Failures (e.g.
    // offline, revoked key) leave the provider un-ready rather than crashing.
    void restorePersistedProviders();
  }

  // ===== Provider discovery (no secrets) =====

  ipcMain.handle(
    'provider:list',
    guard(async () => ok({ providers: providerRegistry.getSupportedProviders() }))
  );

  ipcMain.handle(
    'provider:configured',
    guard(async () => ok({ configured: secureConfigStore.listRedactedProviderConfigs() }))
  );

  ipcMain.handle(
    'provider:status',
    guard(async () =>
      ok({
        statuses: providerRegistry.getProviderStatuses(),
        current: manager!.getCurrentProviderId(),
      })
    )
  );

  // ===== Provider configuration =====

  ipcMain.handle(
    'provider:initialize',
    guard(async (_event: IpcMainInvokeEvent, providerIdRaw: unknown, configRaw: unknown) => {
      const providerId = providerIdSchema.parse(providerIdRaw);
      const incoming = providerConfigSchema.parse(configRaw ?? {}) as ProviderConfig;

      if (!providerRegistry.isProviderRegistered(providerId)) {
        return fail('PROVIDER_NOT_FOUND', `Unknown provider: ${providerId}`);
      }

      // Merge over any previously-stored config so the caller can update a single
      // field (or re-initialise) without resending the API key every time.
      const existing = secureConfigStore.getProviderConfig(providerId) ?? {};
      const effective: ProviderConfig = { ...existing, ...incoming };

      secureConfigStore.setProviderConfig(providerId, effective);
      await manager!.initializeProvider(providerId, effective);

      return ok({ providerId, status: providerRegistry.getProviderStatuses()[providerId] ?? 'unknown' });
    })
  );

  ipcMain.handle(
    'provider:setCurrent',
    guard(async (_event: IpcMainInvokeEvent, providerIdRaw: unknown) => {
      const providerId = providerIdSchema.parse(providerIdRaw);
      await manager!.setCurrentProvider(providerId);
      return ok({ current: providerId });
    })
  );

  ipcMain.handle(
    'provider:remove',
    guard(async (_event: IpcMainInvokeEvent, providerIdRaw: unknown) => {
      const providerId = providerIdSchema.parse(providerIdRaw);
      await providerRegistry.disposeProvider(providerId);
      secureConfigStore.deleteProviderConfig(providerId);
      return ok({ providerId });
    })
  );

  ipcMain.handle(
    'provider:models',
    guard(async (_event: IpcMainInvokeEvent, providerIdRaw: unknown) => {
      const providerId = providerIdSchema.parse(providerIdRaw);
      const provider = providerRegistry.getProvider(providerId);
      if (!provider) {
        return fail('PROVIDER_NOT_CONFIGURED', `Provider not initialized: ${providerId}`);
      }
      return ok({ models: await provider.getAvailableModels() });
    })
  );

  // ===== Generation =====

  ipcMain.handle(
    'book:generate',
    guard(async (_event: IpcMainInvokeEvent, paramsRaw: unknown) => {
      const parsed = generationParamsSchema.parse(paramsRaw);
      const { providerId, ...genParams } = parsed;

      if (providerId) {
        await manager!.setCurrentProvider(providerId);
      }
      const provider = manager!.getCurrentProvider();
      if (!provider) {
        return fail('PROVIDER_NOT_CONFIGURED', 'No provider is currently active');
      }

      const chunk = await manager!.generate(genParams as GenerationParams);
      return ok({
        content: chunk.content,
        model: chunk.model,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
      });
    })
  );

  // ===== Export (not yet implemented) =====

  for (const format of ['markdown', 'html', 'pdf'] as const) {
    ipcMain.handle(
      `export:${format}`,
      guard(async () => fail('NOT_IMPLEMENTED', `${format} export is not implemented yet`))
    );
  }

  // ===== Generic non-secret app config =====

  ipcMain.handle(
    'config:get',
    guard(async (_event: IpcMainInvokeEvent, keyRaw: unknown) => {
      const key = appConfigKeySchema.parse(keyRaw);
      return ok({ value: secureConfigStore.getAppValue(key) });
    })
  );

  ipcMain.handle(
    'config:set',
    guard(async (_event: IpcMainInvokeEvent, keyRaw: unknown, valueRaw: unknown) => {
      const key = appConfigKeySchema.parse(keyRaw);
      const value = appConfigValueSchema.parse(valueRaw);
      secureConfigStore.setAppValue(key, value);
      return ok({ key });
    })
  );
}

/**
 * Re-initialise providers that have a stored configuration, so the app comes
 * back ready after a restart without re-prompting for keys.
 */
async function restorePersistedProviders(): Promise<void> {
  for (const providerId of secureConfigStore.getConfiguredProviderIds()) {
    const config = secureConfigStore.getProviderConfig(providerId);
    if (!config) continue;
    try {
      await manager!.initializeProvider(providerId, config);
    } catch (error) {
      console.warn(`Could not restore provider "${providerId}":`, error);
    }
  }
}
