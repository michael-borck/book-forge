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

  // Workbench projects
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    templates: () => ipcRenderer.invoke('project:templates'),
    get: (id: string) => ipcRenderer.invoke('project:get', id),
    create: (input: unknown) => ipcRenderer.invoke('project:create', input),
    updateMeta: (id: string, patch: unknown) =>
      ipcRenderer.invoke('project:updateMeta', id, patch),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    duplicate: (id: string) => ipcRenderer.invoke('project:duplicate', id),
    plan: (id: string) => ipcRenderer.invoke('project:plan', id),
    generate: (id: string) => ipcRenderer.invoke('project:generate', id),
    cancel: (id: string) => ipcRenderer.invoke('project:cancel', id),
    continuity: (id: string) => ipcRenderer.invoke('project:continuity', id),
  },

  node: {
    create: (projectId: string, input: unknown) =>
      ipcRenderer.invoke('node:create', projectId, input),
    update: (projectId: string, nodeId: string, patch: unknown) =>
      ipcRenderer.invoke('node:update', projectId, nodeId, patch),
    move: (projectId: string, nodeId: string, move: unknown) =>
      ipcRenderer.invoke('node:move', projectId, nodeId, move),
    delete: (projectId: string, nodeId: string) =>
      ipcRenderer.invoke('node:delete', projectId, nodeId),
    aiEdit: (projectId: string, nodeId: string, payload: unknown) =>
      ipcRenderer.invoke('node:aiEdit', projectId, nodeId, payload),
  },

  imageProvider: {
    list: () => ipcRenderer.invoke('imageProvider:list'),
    configure: (id: string, config: unknown) =>
      ipcRenderer.invoke('imageProvider:configure', id, config),
    setCurrent: (id: string) => ipcRenderer.invoke('imageProvider:setCurrent', id),
    remove: (id: string) => ipcRenderer.invoke('imageProvider:remove', id),
    styles: () => ipcRenderer.invoke('imageProvider:styles'),
  },

  artwork: {
    plan: (projectId: string, payload?: unknown) =>
      ipcRenderer.invoke('artwork:plan', projectId, payload ?? {}),
    update: (projectId: string, artworkId: string, patch: unknown) =>
      ipcRenderer.invoke('artwork:update', projectId, artworkId, patch),
    remove: (projectId: string, artworkId: string) =>
      ipcRenderer.invoke('artwork:delete', projectId, artworkId),
    generate: (projectId: string, artworkId: string) =>
      ipcRenderer.invoke('artwork:generate', projectId, artworkId),
    generateAll: (projectId: string, options?: unknown) =>
      ipcRenderer.invoke('artwork:generateAll', projectId, options ?? {}),
    upload: (projectId: string, payload?: unknown) =>
      ipcRenderer.invoke('artwork:upload', projectId, payload ?? {}),
    asset: (projectId: string, artworkId: string, variant: 'thumb' | 'full') =>
      ipcRenderer.invoke('artwork:asset', projectId, artworkId, variant),
    onProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('artwork:progress', listener);
      return () => ipcRenderer.removeListener('artwork:progress', listener);
    },
  },

  research: {
    import: (projectId: string) => ipcRenderer.invoke('research:import', projectId),
  },

  snapshot: {
    list: (projectId: string, nodeId?: string) =>
      ipcRenderer.invoke('snapshot:list', projectId, nodeId),
    create: (projectId: string, nodeId: string, reason: string) =>
      ipcRenderer.invoke('snapshot:create', projectId, nodeId, reason),
    restore: (projectId: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshot:restore', projectId, snapshotId),
    diff: (projectId: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshot:diff', projectId, snapshotId),
  },

  compile: {
    run: (payload: unknown) => ipcRenderer.invoke('compile:run', payload),
    batch: (payload: unknown) => ipcRenderer.invoke('compile:batch', payload),
  },

  // Book / generation operations
  book: {
    estimate: (params: unknown) => ipcRenderer.invoke('book:estimate', params),
    generate: (params: unknown) => ipcRenderer.invoke('book:generate', params),
    cancel: (id: string) => ipcRenderer.invoke('book:cancel', id),
    retry: (id: string) => ipcRenderer.invoke('book:retry', id),
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
