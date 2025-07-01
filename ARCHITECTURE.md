# BookForge - Technical Architecture

## System Overview

BookForge is built as a desktop application using Electron with a Next.js frontend. The architecture follows a clean separation between the main process (Electron) and renderer process (Next.js), with secure IPC communication between them.

```
┌─────────────────────────────────────────────────────────────┐
│                        BookForge App                         │
├─────────────────────────────────────────────────────────────┤
│                    Renderer Process (UI)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Next.js App                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │   Pages     │  │ Components  │  │   Store    │  │   │
│  │  │  - Home     │  │  - Forms    │  │  - User    │  │   │
│  │  │  - Generate │  │  - Preview  │  │  - Book    │  │   │
│  │  │  - Settings │  │  - Export   │  │  - Config  │  │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    IPC Communication Layer                   │
├─────────────────────────────────────────────────────────────┤
│                    Main Process (Backend)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────┐ │   │
│  │  │   Window   │  │    IPC     │  │   Services    │ │   │
│  │  │ Management │  │  Handlers  │  │  - Providers  │ │   │
│  │  │            │  │            │  │  - Export     │ │   │
│  │  │            │  │            │  │  - Storage    │ │   │
│  │  └────────────┘  └────────────┘  └───────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Main Process (Electron)

The main process handles:
- Window management
- System integration
- Secure API key storage
- File system operations
- IPC communication

#### Key Modules

**Window Manager**
```typescript
// src/main/window/WindowManager.ts
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  
  createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
  }
}
```

**IPC Handlers**
```typescript
// src/main/ipc/handlers.ts
export function registerIPCHandlers() {
  // Provider operations
  ipcMain.handle('provider:initialize', async (event, config) => {
    return await providerService.initialize(config);
  });
  
  // Generation operations
  ipcMain.handle('book:generate', async (event, params) => {
    return await bookService.generate(params);
  });
  
  // Export operations
  ipcMain.handle('export:markdown', async (event, book) => {
    return await exportService.exportMarkdown(book);
  });
}
```

### 2. Renderer Process (Next.js)

The renderer process provides the user interface using Next.js with React.

#### Application Structure

```
src/renderer/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── generate/          # Generation page
│   ├── settings/          # Settings page
│   └── library/           # Book library
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── layout/            # Layout components
│   └── features/          # Feature components
├── lib/
│   ├── api/               # API client
│   ├── store/             # Zustand stores
│   └── utils/             # Utilities
└── styles/                # Global styles
```

### 3. Provider System

The provider system uses an adapter pattern to support multiple AI providers with a unified interface.

```typescript
// src/shared/types/provider.ts
interface IProvider {
  name: string;
  initialize(config: ProviderConfig): Promise<void>;
  generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk>;
  countTokens(text: string): Promise<number>;
  estimateCost(usage: TokenUsage): CostEstimate;
  getAvailableModels(): Promise<Model[]>;
}

// src/main/services/providers/BaseProvider.ts
abstract class BaseProvider implements IProvider {
  protected config: ProviderConfig;
  
  abstract name: string;
  
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    await this.validateConfig();
  }
  
  protected abstract validateConfig(): Promise<void>;
  abstract generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk>;
  abstract countTokens(text: string): Promise<number>;
}
```

#### Provider Implementations

**Claude Provider**
```typescript
// src/main/services/providers/ClaudeProvider.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider extends BaseProvider {
  name = 'claude';
  private client: Anthropic;
  
  protected async validateConfig(): Promise<void> {
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }
  
  async *generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const stream = await this.client.messages.create({
      model: params.model,
      messages: params.messages,
      stream: true,
      max_tokens: params.maxTokens,
    });
    
    for await (const chunk of stream) {
      yield {
        content: chunk.delta?.text || '',
        tokens: await this.countTokens(chunk.delta?.text || ''),
      };
    }
  }
}
```

**Ollama Provider**
```typescript
// src/main/services/providers/OllamaProvider.ts
export class OllamaProvider extends BaseProvider {
  name = 'ollama';
  
  async getAvailableModels(): Promise<Model[]> {
    const response = await fetch(`${this.config.endpoint}/api/tags`);
    const data = await response.json();
    return data.models.map(m => ({
      id: m.name,
      name: m.name,
      contextLength: m.details.parameter_size,
    }));
  }
}
```

### 4. Book Generation Engine

The book generation engine orchestrates the two-phase generation process.

```typescript
// src/main/services/BookService.ts
export class BookService {
  constructor(private providerService: ProviderService) {}
  
  async generate(params: BookGenerationParams): Promise<AsyncGenerator<BookChunk>> {
    // Phase 1: Generate structure
    const structure = await this.generateStructure(params);
    
    // Phase 2: Generate content for each chapter
    for (const chapter of structure.chapters) {
      yield* this.generateChapter(chapter, params);
    }
  }
  
  private async generateStructure(params: BookGenerationParams): Promise<BookStructure> {
    const prompt = this.buildStructurePrompt(params);
    const response = await this.providerService.generate({
      messages: [{ role: 'user', content: prompt }],
      model: params.model,
      temperature: 0.3,
    });
    
    return this.parseStructure(response);
  }
  
  private async *generateChapter(
    chapter: Chapter,
    params: BookGenerationParams
  ): AsyncGenerator<BookChunk> {
    const prompt = this.buildChapterPrompt(chapter, params);
    
    yield {
      type: 'chapter_start',
      chapter: chapter.title,
    };
    
    const stream = this.providerService.generateStream({
      messages: [{ role: 'user', content: prompt }],
      model: params.model,
      temperature: params.temperature || 0.7,
    });
    
    for await (const chunk of stream) {
      yield {
        type: 'content',
        content: chunk.content,
        tokens: chunk.tokens,
      };
    }
    
    yield {
      type: 'chapter_end',
      chapter: chapter.title,
    };
  }
}
```

### 5. State Management

Zustand is used for state management in the renderer process.

```typescript
// src/renderer/lib/store/bookStore.ts
interface BookState {
  currentBook: Book | null;
  generationProgress: GenerationProgress | null;
  isGenerating: boolean;
  
  // Actions
  startGeneration: (params: BookGenerationParams) => void;
  updateProgress: (progress: GenerationProgress) => void;
  cancelGeneration: () => void;
}

export const useBookStore = create<BookState>((set, get) => ({
  currentBook: null,
  generationProgress: null,
  isGenerating: false,
  
  startGeneration: async (params) => {
    set({ isGenerating: true, generationProgress: { chapters: [], currentChapter: 0 } });
    
    try {
      const generator = await window.api.generateBook(params);
      
      for await (const chunk of generator) {
        if (chunk.type === 'content') {
          // Update current book content
        } else if (chunk.type === 'chapter_start') {
          // Update progress
        }
      }
    } finally {
      set({ isGenerating: false });
    }
  },
}));
```

### 6. Export System

The export system handles different output formats.

```typescript
// src/main/services/ExportService.ts
export class ExportService {
  async exportMarkdown(book: Book): Promise<string> {
    const formatter = new MarkdownFormatter();
    return formatter.format(book);
  }
  
  async exportHTML(book: Book, theme: string): Promise<string> {
    const markdown = await this.exportMarkdown(book);
    const html = await this.markdownToHTML(markdown);
    return this.applyTheme(html, theme);
  }
  
  async exportPDF(book: Book, options: PDFOptions): Promise<Buffer> {
    const html = await this.exportHTML(book, options.theme);
    return await this.htmlToPDF(html, options);
  }
}
```

## Security Architecture

### API Key Storage

API keys are stored using Electron's safeStorage API:

```typescript
// src/main/services/ConfigService.ts
import { safeStorage } from 'electron';

export class ConfigService {
  private store: Store;
  
  async setApiKey(provider: string, apiKey: string): Promise<void> {
    const encrypted = safeStorage.encryptString(apiKey);
    this.store.set(`apiKeys.${provider}`, encrypted.toString('base64'));
  }
  
  async getApiKey(provider: string): Promise<string | null> {
    const encrypted = this.store.get(`apiKeys.${provider}`);
    if (!encrypted) return null;
    
    const buffer = Buffer.from(encrypted, 'base64');
    return safeStorage.decryptString(buffer);
  }
}
```

### IPC Security

All IPC communication is validated and sanitized:

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  generateBook: (params: BookGenerationParams) => {
    // Validate params
    if (!isValidParams(params)) {
      throw new Error('Invalid parameters');
    }
    return ipcRenderer.invoke('book:generate', params);
  },
});
```

## Performance Optimizations

### 1. Streaming Architecture

All content generation uses streaming to provide real-time feedback:

```typescript
// Efficient streaming with backpressure handling
async function* streamWithBackpressure<T>(
  source: AsyncGenerator<T>,
  bufferSize: number = 10
): AsyncGenerator<T> {
  const buffer: T[] = [];
  let done = false;
  
  // Producer
  (async () => {
    for await (const item of source) {
      while (buffer.length >= bufferSize) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      buffer.push(item);
    }
    done = true;
  })();
  
  // Consumer
  while (!done || buffer.length > 0) {
    if (buffer.length > 0) {
      yield buffer.shift()!;
    } else {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}
```

### 2. Memory Management

Large books are handled efficiently:

```typescript
// Virtual scrolling for large content
export function VirtualBookViewer({ book }: { book: Book }) {
  const rowVirtualizer = useVirtualizer({
    count: book.chapters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <ChapterView
            key={virtualRow.index}
            chapter={book.chapters[virtualRow.index]}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 3. Caching Strategy

Intelligent caching for API responses:

```typescript
class CacheService {
  private cache = new Map<string, CacheEntry>();
  
  async get<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    
    const data = await fetcher();
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
    
    return data;
  }
}
```

## Testing Architecture

### Unit Testing

```typescript
// src/main/services/__tests__/BookService.test.ts
describe('BookService', () => {
  let bookService: BookService;
  let mockProvider: jest.Mocked<IProvider>;
  
  beforeEach(() => {
    mockProvider = createMockProvider();
    bookService = new BookService(mockProvider);
  });
  
  test('generates book structure', async () => {
    mockProvider.generate.mockResolvedValue({
      content: JSON.stringify({ chapters: [...] }),
    });
    
    const structure = await bookService.generateStructure({
      topic: 'Test Book',
      style: 'casual',
    });
    
    expect(structure.chapters).toHaveLength(10);
  });
});
```

### Integration Testing

```typescript
// e2e/book-generation.spec.ts
import { test, expect } from '@playwright/test';

test('generates a book end-to-end', async ({ page }) => {
  // Navigate to app
  await page.goto('/');
  
  // Configure provider
  await page.click('[data-testid="settings-button"]');
  await page.fill('[data-testid="api-key-input"]', process.env.TEST_API_KEY);
  
  // Generate book
  await page.click('[data-testid="generate-button"]');
  await page.fill('[data-testid="topic-input"]', 'Introduction to Testing');
  await page.click('[data-testid="start-generation"]');
  
  // Wait for generation
  await expect(page.locator('[data-testid="chapter-1"]')).toBeVisible({
    timeout: 30000,
  });
});
```

## Deployment Architecture

### Build Pipeline

```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
        
      - name: Package
        run: pnpm package
        env:
          CSC_LINK: ${{ secrets.CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
```

### Auto-Update System

```typescript
// src/main/services/UpdateService.ts
import { autoUpdater } from 'electron-updater';

export class UpdateService {
  initialize() {
    autoUpdater.checkForUpdatesAndNotify();
    
    autoUpdater.on('update-available', () => {
      this.notifyUser('Update available');
    });
    
    autoUpdater.on('update-downloaded', () => {
      this.promptRestart();
    });
  }
}
```

## Monitoring and Analytics

### Performance Monitoring

```typescript
// src/renderer/lib/monitoring.ts
export function trackPerformance(name: string, fn: () => Promise<void>) {
  const start = performance.now();
  
  return fn().finally(() => {
    const duration = performance.now() - start;
    
    // Send to analytics
    analytics.track('performance', {
      operation: name,
      duration,
      timestamp: Date.now(),
    });
  });
}
```

### Error Tracking

```typescript
// src/main/services/ErrorService.ts
export class ErrorService {
  captureError(error: Error, context?: Record<string, any>) {
    console.error('Error captured:', error);
    
    // Send to error tracking service
    if (this.isProduction()) {
      this.sendToSentry(error, context);
    }
  }
}
```

This architecture provides a solid foundation for building a scalable, maintainable, and secure desktop application for AI-powered book generation.