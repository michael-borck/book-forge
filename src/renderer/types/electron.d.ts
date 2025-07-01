export interface ElectronAPI {
  provider: {
    initialize: (config: any) => Promise<any>;
  };
  book: {
    generate: (params: any) => Promise<any>;
  };
  export: {
    markdown: (bookId: string) => Promise<any>;
    html: (bookId: string) => Promise<any>;
    pdf: (bookId: string) => Promise<any>;
  };
  config: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<any>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}