import { contextBridge, ipcRenderer } from 'electron';

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
    remove: (providerId: string) => ipcRenderer.invoke('provider:remove', providerId),
    models: (providerId: string) => ipcRenderer.invoke('provider:models', providerId),
  },

  // Book / generation operations
  book: {
    generate: (params: unknown) => ipcRenderer.invoke('book:generate', params),
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
