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
import { bookStore } from '../services/bookStore';
import { BookGenerator } from '../services/bookGenerator';
import { bookExporter } from '../services/bookExporter';
import {
  providerIdSchema,
  providerConfigSchema,
  bookRequestSchema,
  bookIdSchema,
  appConfigKeySchema,
  appConfigValueSchema,
} from './schemas';
import type { ProviderConfig } from '../../shared/types';

// A serialisable result envelope. Errors are returned (not thrown) so the
// renderer receives a structured payload instead of a stringified Error.
type IpcResult<T> =
  | ({ success: true } & T)
  | { success: false; error: { code: string; message: string } };

let manager: ProviderManager | null = null;
let generator: BookGenerator | null = null;
let initialized = false;

// Book ids the renderer has asked to cancel; checked between chapters.
const cancelRequested = new Set<string>();

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
    generator = new BookGenerator(manager);
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

  // ===== Book generation + library =====

  ipcMain.handle(
    'book:generate',
    guard(async (event: IpcMainInvokeEvent, paramsRaw: unknown) => {
      const req = bookRequestSchema.parse(paramsRaw);
      const sender = event.sender;
      let bookId: string | undefined;
      // Generation can take a while; progress events stream to the renderer
      // while this invoke is awaited, and the completed book is returned.
      try {
        const book = await generator!.generate(
          req,
          (progress) => {
            bookId = progress.bookId;
            if (!sender.isDestroyed()) sender.send('book:progress', progress);
          },
          (id) => cancelRequested.has(id)
        );
        return ok({ book });
      } finally {
        if (bookId) cancelRequested.delete(bookId);
      }
    })
  );

  ipcMain.handle(
    'book:cancel',
    guard(async (_event: IpcMainInvokeEvent, idRaw: unknown) => {
      const id = bookIdSchema.parse(idRaw);
      cancelRequested.add(id);
      return ok({ id });
    })
  );

  ipcMain.handle(
    'book:list',
    guard(async () => ok({ books: bookStore.list() }))
  );

  ipcMain.handle(
    'book:get',
    guard(async (_event: IpcMainInvokeEvent, idRaw: unknown) => {
      const id = bookIdSchema.parse(idRaw);
      const book = bookStore.get(id);
      if (!book) return fail('NOT_FOUND', `No book with id ${id}`);
      return ok({ book });
    })
  );

  ipcMain.handle(
    'book:delete',
    guard(async (_event: IpcMainInvokeEvent, idRaw: unknown) => {
      const id = bookIdSchema.parse(idRaw);
      bookStore.delete(id);
      return ok({ id });
    })
  );

  // ===== Export =====

  for (const format of ['markdown', 'html', 'pdf'] as const) {
    ipcMain.handle(
      `export:${format}`,
      guard(async (_event: IpcMainInvokeEvent, idRaw: unknown) => {
        const id = bookIdSchema.parse(idRaw);
        const book = bookStore.get(id);
        if (!book) return fail('NOT_FOUND', `No book with id ${id}`);
        const outcome = await bookExporter.export(book, format);
        return ok(outcome);
      })
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
