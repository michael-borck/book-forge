import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer
const api = {
  // Provider operations
  provider: {
    initialize: (config: any) => ipcRenderer.invoke('provider:initialize', config),
  },
  
  // Book operations
  book: {
    generate: (params: any) => ipcRenderer.invoke('book:generate', params),
  },
  
  // Export operations
  export: {
    markdown: (bookId: string) => ipcRenderer.invoke('export:markdown', bookId),
    html: (bookId: string) => ipcRenderer.invoke('export:html', bookId),
    pdf: (bookId: string) => ipcRenderer.invoke('export:pdf', bookId),
  },
  
  // Configuration
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', api);

// Type definitions for TypeScript
export type ElectronAPI = typeof api;