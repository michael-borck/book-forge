import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// The API exposed to the renderer. Note: API keys are passed *in* via
// provider.initialize but are never returned — provider.configured() yields a
// redacted view (hasApiKey: boolean) only.
const api = {
  // Provider operations
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    configured: () => ipcRenderer.invoke('provider:configured'),
    status: () => ipcRenderer.invoke('provider:status'),
    initialize: (providerId: string, config: unknown) =>
      ipcRenderer.invoke('provider:initialize', providerId, config),
    setCurrent: (providerId: string) => ipcRenderer.invoke('provider:setCurrent', providerId),
    setModel: (providerId: string, model: string) =>
      ipcRenderer.invoke('provider:setModel', providerId, model),
    remove: (providerId: string) => ipcRenderer.invoke('provider:remove', providerId),
    models: (providerId: string) => ipcRenderer.invoke('provider:models', providerId),
  },

  // Book / generation operations
  book: {
    generate: (params: unknown) => ipcRenderer.invoke('book:generate', params),
    cancel: (id: string) => ipcRenderer.invoke('book:cancel', id),
    list: () => ipcRenderer.invoke('book:list'),
    get: (id: string) => ipcRenderer.invoke('book:get', id),
    delete: (id: string) => ipcRenderer.invoke('book:delete', id),
    // Subscribe to generation progress. Returns an unsubscribe function.
    onProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('book:progress', listener);
      return () => {
        ipcRenderer.removeListener('book:progress', listener);
      };
    },
  },

  // Export operations
  export: {
    markdown: (bookId: string) => ipcRenderer.invoke('export:markdown', bookId),
    html: (bookId: string) => ipcRenderer.invoke('export:html', bookId),
    pdf: (bookId: string) => ipcRenderer.invoke('export:pdf', bookId),
  },

  // Generic (non-secret) configuration
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', api);

// Type definitions for TypeScript
export type ElectronAPI = typeof api;
