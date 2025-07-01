# BookForge - Project Development Plan

## Project Overview

BookForge is a cross-platform desktop application that enables users to generate complete books using various AI providers (Groq, Claude, OpenAI, Gemini, Ollama). Built with Electron and Next.js, it provides a user-friendly interface for non-technical users while offering advanced features for power users.

## Technology Stack

### Core Technologies
- **Desktop Framework**: Electron 28+
- **Frontend**: Next.js 14+ with React 18+
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Build Tools**: Vite/Webpack (via Next.js)
- **Package Manager**: pnpm (recommended) or npm

### Key Libraries
- **AI SDKs**: 
  - `@anthropic-ai/sdk` (Claude)
  - `openai` (OpenAI/Groq)
  - `@google/generative-ai` (Gemini)
  - Custom adapter for Ollama
- **Export Libraries**:
  - `markdown-pdf` or `puppeteer` for PDF
  - `marked` for Markdown processing
  - `html-to-text` for format conversion
- **UI Components**: `shadcn/ui` components
- **Icons**: `lucide-react`
- **Forms**: `react-hook-form` + `zod`

## Development Phases

### Phase 1: Project Foundation (Week 1)
1. **Initial Setup**
   ```bash
   npx create-electron-app bookforge --template=typescript-webpack
   cd bookforge
   npx create-next-app@latest renderer --typescript --tailwind --app
   ```

2. **Configure Electron + Next.js Integration**
   - Set up main process
   - Configure renderer process with Next.js
   - Enable hot reload for development
   - Set up IPC communication

3. **Development Environment**
   - ESLint + Prettier configuration
   - Husky for pre-commit hooks
   - GitHub Actions for CI/CD
   - VS Code workspace settings

4. **UI Framework Setup**
   - Install and configure Tailwind CSS
   - Set up shadcn/ui
   - Create base layout components
   - Configure dark mode support

### Phase 2: Core Architecture (Week 2-3)

1. **LLM Provider System**
   ```typescript
   interface LLMProvider {
     name: string;
     generateStream(prompt: string, options: GenerationOptions): AsyncGenerator<string>;
     countTokens(text: string): Promise<number>;
     estimateCost(tokens: number): number;
   }
   ```

2. **Provider Implementations**
   - Base provider class
   - Groq provider (via OpenAI SDK)
   - Claude provider
   - OpenAI provider
   - Gemini provider
   - Ollama provider (with local model detection)

3. **Configuration Management**
   - Electron store for persistent settings
   - API key encryption
   - Provider endpoint configuration
   - Model selection per provider

4. **Token Tracking System**
   - Real-time token counting
   - Cost calculation engine
   - Usage history database (SQLite)
   - Budget alerts and limits

### Phase 3: User Interface (Week 3-4)

1. **Application Layout**
   - Main window with sidebar navigation
   - Settings page
   - Book generation page
   - Library/History page
   - About/Help page

2. **Settings Page**
   - API configuration for each provider
   - Model selection
   - Default generation parameters
   - Export preferences
   - Theme customization

3. **Book Generation Interface**
   - Topic input with suggestions
   - Advanced options panel:
     - Writing style selector
     - Tone adjustment
     - Length specification
     - Audience level
     - Language selection
   - Provider selection with model dropdown
   - Real-time cost estimation

4. **Progress View**
   - Streaming text display
   - Chapter progress indicators
   - Token usage meter
   - Cancel/Pause functionality
   - Auto-save indicator

### Phase 4: Book Generation Engine (Week 4-5)

1. **Generation Pipeline**
   ```typescript
   interface BookStructure {
     title: string;
     chapters: Chapter[];
     metadata: BookMetadata;
   }
   
   interface Chapter {
     title: string;
     sections: Section[];
     estimatedTokens: number;
   }
   ```

2. **Generation Strategy**
   - Two-phase generation:
     1. Structure generation (outline)
     2. Content generation (streaming)
   - Chunking for long books
   - Context management
   - Error recovery

3. **Template System**
   - Predefined book templates
   - Custom prompt engineering
   - Genre-specific structures
   - User template saving

4. **Quality Enhancements**
   - Consistency checking
   - Fact verification prompts
   - Style consistency
   - Chapter summaries for context

### Phase 5: Export System (Week 5-6)

1. **Markdown Export**
   - Clean markdown formatting
   - Front matter support
   - Image placeholder handling
   - Pandoc-compatible output

2. **HTML Export**
   - Responsive HTML template
   - Multiple theme options
   - Syntax highlighting for code
   - Print-friendly CSS

3. **PDF Export**
   - Cover page generation
   - Table of contents
   - Page numbering
   - Custom styling options

4. **Advanced Export Features**
   - Batch export
   - Custom CSS injection
   - Export presets
   - Format conversion tips

### Phase 6: Polish & Distribution (Week 6-7)

1. **Auto-updater**
   - Electron updater integration
   - Update channels (stable/beta)
   - Release notes display
   - Rollback capability

2. **Platform Packages**
   - Windows: MSI/EXE installer
   - macOS: DMG with code signing
   - Linux: AppImage, Snap, Flatpak
   - Auto-update for all platforms

3. **Performance Optimization**
   - Lazy loading of components
   - Virtual scrolling for long texts
   - Memory usage optimization
   - Background task management

4. **User Experience**
   - Onboarding flow
   - Interactive tutorials
   - Keyboard shortcuts
   - Accessibility features

## File Structure

```
bookforge/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts
│   │   ├── ipc/
│   │   ├── menu/
│   │   └── window/
│   ├── renderer/          # Next.js app
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── settings/
│   │   │   ├── generate/
│   │   │   └── library/
│   │   ├── components/
│   │   │   ├── ui/       # shadcn components
│   │   │   ├── layout/
│   │   │   └── features/
│   │   ├── lib/
│   │   │   ├── providers/
│   │   │   ├── export/
│   │   │   └── store/
│   │   └── styles/
│   ├── shared/           # Shared types/utils
│   └── preload/          # Electron preload scripts
├── resources/            # App resources
├── build/               # Build configs
└── dist/                # Build output
```

## API Integration Specifications

### Provider Adapter Pattern
```typescript
// Base adapter
abstract class LLMAdapter {
  abstract async initialize(config: ProviderConfig): Promise<void>;
  abstract async generateStream(
    messages: Message[],
    options: GenerationOptions
  ): AsyncGenerator<GenerationChunk>;
  abstract async countTokens(text: string): Promise<number>;
  abstract getModelList(): Promise<Model[]>;
  abstract estimateCost(tokens: TokenUsage): CostEstimate;
}

// Example implementation
class ClaudeAdapter extends LLMAdapter {
  private client: Anthropic;
  
  async initialize(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }
  // ... implementation
}
```

### Cost Tracking
```typescript
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}
```

## Security Considerations

1. **API Key Storage**
   - Encrypted storage using Electron safeStorage
   - Never exposed to renderer process
   - Optional keychain integration

2. **Content Security**
   - CSP headers for web content
   - Input sanitization
   - XSS prevention

3. **Update Security**
   - Code signing for all platforms
   - HTTPS-only updates
   - Certificate pinning

## Testing Strategy

1. **Unit Tests**: Jest + React Testing Library
2. **Integration Tests**: Playwright for E2E
3. **API Mocking**: MSW for provider testing
4. **Performance Tests**: Lighthouse CI

## MVP Features

For initial release:
1. Single provider support (start with Groq)
2. Basic book generation (no templates)
3. Markdown export only
4. Simple settings page
5. Basic token tracking

## Future Enhancements

1. **Collaboration Features**
   - Multi-user editing
   - Comments and suggestions
   - Version control integration

2. **Advanced AI Features**
   - Image generation integration
   - Fact-checking service
   - Citation management
   - Translation support

3. **Publishing Integration**
   - Direct upload to platforms
   - ISBN generation
   - Copyright registration
   - Print-on-demand integration

## Success Metrics

1. Generation speed: <5 seconds for structure
2. Export time: <2 seconds for 100-page book
3. Memory usage: <500MB during generation
4. Crash rate: <0.1%
5. User satisfaction: >4.5/5 stars

## Timeline

- **Week 1**: Foundation and setup
- **Week 2-3**: Core architecture
- **Week 3-4**: UI development
- **Week 4-5**: Generation engine
- **Week 5-6**: Export system
- **Week 6-7**: Polish and distribution
- **Week 8**: Beta testing and bug fixes
- **Week 9**: Public release

## Resources Needed

1. **Development**
   - 1-2 developers
   - UI/UX designer (part-time)
   - Technical writer for docs

2. **Infrastructure**
   - GitHub repository
   - CI/CD pipeline
   - Code signing certificates
   - Distribution hosting

3. **Testing**
   - Beta testers group
   - Various OS versions for testing
   - API credits for testing

This plan provides a solid foundation for building BookForge as a professional, user-friendly desktop application for AI-powered book generation.