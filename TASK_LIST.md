# Task List: BookForge - AI-Powered Book Generation Desktop Application

## Relevant Files

### Main Process (Electron)
- `src/main/index.ts` - Main process entry point
- `src/main/window/WindowManager.ts` - Window management
- `src/main/ipc/handlers.ts` - IPC communication handlers
- `src/main/menu/MenuBuilder.ts` - Application menu
- `src/main/services/ConfigService.ts` - Configuration and API key management
- `src/main/services/UpdateService.ts` - Auto-update functionality

### Renderer Process (Next.js)
- `src/renderer/app/layout.tsx` - Root application layout
- `src/renderer/app/page.tsx` - Home page
- `src/renderer/app/generate/page.tsx` - Book generation page
- `src/renderer/app/settings/page.tsx` - Settings page
- `src/renderer/app/library/page.tsx` - Book library page

### Provider System
- `src/shared/types/provider.ts` - Provider interfaces and types
- `src/main/services/providers/BaseProvider.ts` - Base provider class
- `src/main/services/providers/GroqProvider.ts` - Groq implementation
- `src/main/services/providers/ClaudeProvider.ts` - Claude implementation
- `src/main/services/providers/OpenAIProvider.ts` - OpenAI implementation
- `src/main/services/providers/GeminiProvider.ts` - Gemini implementation
- `src/main/services/providers/OllamaProvider.ts` - Ollama implementation

### Book Generation
- `src/main/services/BookService.ts` - Book generation orchestration
- `src/main/services/TokenService.ts` - Token counting and cost calculation
- `src/renderer/lib/store/bookStore.ts` - Book state management
- `src/renderer/components/BookGenerator.tsx` - Generation UI component
- `src/renderer/components/ProgressView.tsx` - Generation progress display

### Export System
- `src/main/services/ExportService.ts` - Export orchestration
- `src/main/services/export/MarkdownExporter.ts` - Markdown export
- `src/main/services/export/HTMLExporter.ts` - HTML export
- `src/main/services/export/PDFExporter.ts` - PDF export

### Testing Files
- `src/main/services/__tests__/` - Main process unit tests
- `src/renderer/__tests__/` - Renderer process unit tests
- `e2e/` - End-to-end tests with Playwright

### Notes

- Use TypeScript for all source files
- Follow the existing shadcn/ui component patterns
- Implement proper error boundaries for React components
- Use `pnpm` as the package manager
- Run tests with `pnpm test` for unit tests and `pnpm test:e2e` for end-to-end tests

## Testing Strategy

- **Unit Tests:** Jest for isolated component and service testing
- **Integration Tests:** Test provider integrations with mock APIs
- **End-to-End Tests:** Playwright for complete user workflows
- **Performance Tests:** Measure generation speed and memory usage
- **Security Tests:** Verify API key encryption and IPC validation

## Tasks

### Phase 1: Foundation and Setup [Week 1]

- [ ] 1.0 Initial project setup and configuration [Effort: L] [Priority: High]
  - [ ] 1.1 Initialize Electron + Next.js project structure [Definition of Done: Project runs in dev mode with hot reload]
  - [ ] 1.2 Configure TypeScript, ESLint, and Prettier [Definition of Done: Linting passes on all files]
  - [ ] 1.3 Set up GitHub repository and CI/CD pipeline [Definition of Done: GitHub Actions run on every push]
  - [ ] 1.4 Install and configure shadcn/ui components [Definition of Done: Example components render correctly]
  - [ ] 1.5 Create base window management and IPC setup [Definition of Done: Main and renderer can communicate]

### Phase 2: Core Architecture [Week 2-3]

- [ ] 2.0 Implement provider system architecture [Effort: XL] [Priority: High]
  - [ ] 2.1 Create base provider interface and types [Definition of Done: TypeScript interfaces defined]
  - [ ] 2.2 Implement BaseProvider abstract class [Definition of Done: Common functionality abstracted]
  - [ ] 2.3 Build Groq provider implementation [Definition of Done: Can generate text with Groq API]
  - [ ] 2.4 Build Claude provider implementation [Prerequisites: BaseProvider complete]
  - [ ] 2.5 Build OpenAI provider implementation [Definition of Done: Supports GPT-4 and GPT-3.5]
  - [ ] 2.6 Build Gemini provider implementation [Definition of Done: Connects to Google AI API]
  - [ ] 2.7 Build Ollama provider with local model detection [Definition of Done: Lists and uses local models]

- [ ] 3.0 Configuration and security system [Effort: L] [Priority: High]
  - [ ] 3.1 Implement secure API key storage with encryption [Definition of Done: Keys encrypted with safeStorage]
  - [ ] 3.2 Create configuration service for app settings [Definition of Done: Settings persist between sessions]
  - [ ] 3.3 Build IPC handlers with validation [Definition of Done: All IPC calls validated]
  - [ ] 3.4 Implement provider endpoint configuration [Definition of Done: Custom endpoints supported]

- [ ] 4.0 Token tracking and cost management [Effort: M] [Priority: High]
  - [ ] 4.1 Create token counting service [Definition of Done: Accurate token counts for all providers]
  - [ ] 4.2 Implement cost calculation engine [Definition of Done: Real-time cost estimates displayed]
  - [ ] 4.3 Build usage history database (SQLite) [Definition of Done: Historical data persisted]
  - [ ] 4.4 Add budget limits and warnings [Definition of Done: Users warned before exceeding limits]

### Phase 3: User Interface [Week 3-4]

- [ ] 5.0 Application layout and navigation [Effort: L] [Priority: High]
  - [ ] 5.1 Create main application layout with sidebar [Definition of Done: Responsive sidebar navigation]
  - [ ] 5.2 Implement routing between pages [Definition of Done: Navigation works without refresh]
  - [ ] 5.3 Add keyboard shortcuts support [Definition of Done: Common actions have shortcuts]
  - [ ] 5.4 Build theme system (dark/light) [Definition of Done: Theme persists and applies correctly]

- [ ] 6.0 Settings page implementation [Effort: L] [Priority: High]
  - [ ] 6.1 Create API configuration UI for each provider [Definition of Done: API keys can be saved]
  - [ ] 6.2 Build model selection interface [Definition of Done: Available models shown per provider]
  - [ ] 6.3 Add generation parameter settings [Definition of Done: Default values configurable]
  - [ ] 6.4 Implement export preferences UI [Definition of Done: Export formats configurable]

- [ ] 7.0 Book generation interface [Effort: XL] [Priority: High]
  - [ ] 7.1 Create topic input with auto-suggestions [Definition of Done: Suggestions appear as user types]
  - [ ] 7.2 Build advanced options panel [Definition of Done: All generation params accessible]
  - [ ] 7.3 Implement provider/model selection [Definition of Done: Dropdown shows available options]
  - [ ] 7.4 Add real-time cost estimation display [Definition of Done: Cost updates before generation]
  - [ ] 7.5 Create generation start/stop controls [Definition of Done: Generation can be cancelled]

- [ ] 8.0 Progress view and streaming display [Effort: L] [Priority: High]
  - [ ] 8.1 Build streaming text display component [Definition of Done: Text appears smoothly]
  - [ ] 8.2 Create chapter progress indicators [Definition of Done: Visual progress per chapter]
  - [ ] 8.3 Implement token usage meter [Definition of Done: Real-time token count display]
  - [ ] 8.4 Add auto-save indicator [Definition of Done: Users see when content is saved]

### Phase 4: Book Generation Engine [Week 4-5]

- [ ] 9.0 Core generation pipeline [Effort: XL] [Priority: High]
  - [ ] 9.1 Implement two-phase generation strategy [Definition of Done: Structure then content]
  - [ ] 9.2 Create book structure parser [Definition of Done: AI output parsed into chapters]
  - [ ] 9.3 Build streaming content generator [Definition of Done: Chapter content streams smoothly]
  - [ ] 9.4 Add context management for long books [Definition of Done: Maintains consistency]
  - [ ] 9.5 Implement error recovery and retry logic [Definition of Done: Graceful failure handling]

- [ ] 10.0 Template and prompt system [Effort: M] [Priority: Medium]
  - [ ] 10.1 Create prompt templates for different genres [Definition of Done: 5+ genre templates]
  - [ ] 10.2 Build custom prompt builder [Definition of Done: Users can customize prompts]
  - [ ] 10.3 Implement prompt optimization [Definition of Done: High-quality output prompts]
  - [ ] 10.4 Add user template saving [Definition of Done: Custom templates persist]

### Phase 5: Export System [Week 5-6]

- [ ] 11.0 Export implementation [Effort: L] [Priority: High]
  - [ ] 11.1 Build Markdown exporter with formatting [Definition of Done: Clean MD output]
  - [ ] 11.2 Create HTML exporter with themes [Definition of Done: 3+ professional themes]
  - [ ] 11.3 Implement PDF generation with styling [Definition of Done: Print-ready PDFs]
  - [ ] 11.4 Add batch export functionality [Definition of Done: Multiple books exported at once]
  - [ ] 11.5 Create export preset system [Definition of Done: Save/load export settings]

### Phase 6: Polish and Distribution [Week 6-7]

- [ ] 12.0 Performance optimization [Effort: M] [Priority: High]
  - [ ] 12.1 Implement lazy loading for components [Definition of Done: Fast initial load]
  - [ ] 12.2 Add virtual scrolling for long texts [Definition of Done: Smooth scrolling performance]
  - [ ] 12.3 Optimize memory usage during generation [Definition of Done: <500MB memory usage]
  - [ ] 12.4 Profile and fix performance bottlenecks [Definition of Done: All operations <2s]

- [ ] 13.0 Distribution setup [Effort: L] [Priority: High]
  - [ ] 13.1 Configure auto-updater [Definition of Done: Updates download and install]
  - [ ] 13.2 Set up code signing for all platforms [Definition of Done: No security warnings]
  - [ ] 13.3 Create installers for Windows/macOS/Linux [Definition of Done: One-click install]
  - [ ] 13.4 Configure release automation [Definition of Done: GitHub releases automated]

- [ ] 14.0 User experience polish [Effort: M] [Priority: Medium]
  - [ ] 14.1 Create onboarding flow for new users [Definition of Done: First-run experience]
  - [ ] 14.2 Add interactive tutorials [Definition of Done: Feature discovery improved]
  - [ ] 14.3 Implement comprehensive help system [Definition of Done: Context-sensitive help]
  - [ ] 14.4 Add accessibility features [Definition of Done: Screen reader compatible]

### Phase 7: Testing and Quality Assurance [Week 8]

- [ ] 15.0 Comprehensive testing [Effort: L] [Priority: High]
  - [ ] 15.1 Write unit tests for all services (>90% coverage) [Definition of Done: Tests pass]
  - [ ] 15.2 Create integration tests for providers [Definition of Done: Mock API tests work]
  - [ ] 15.3 Build E2E tests for critical paths [Definition of Done: User workflows tested]
  - [ ] 15.4 Perform security audit [Definition of Done: No vulnerabilities found]
  - [ ] 15.5 Conduct performance testing [Definition of Done: Meets performance targets]

### Phase 8: Beta and Release [Week 9]

- [ ] 16.0 Beta testing and release [Effort: M] [Priority: High]
  - [ ] 16.1 Deploy beta version to testers [Definition of Done: 50+ beta testers onboarded]
  - [ ] 16.2 Fix critical bugs from beta feedback [Definition of Done: All P0 bugs resolved]
  - [ ] 16.3 Create user documentation [Definition of Done: Complete user guide available]
  - [ ] 16.4 Prepare marketing materials [Definition of Done: Website and assets ready]
  - [ ] 16.5 Execute public release [Definition of Done: Available on all platforms]

### Task Legend
- **Effort:** S (Small: <4 hours), M (Medium: 4-8 hours), L (Large: 8-16 hours), XL (Extra Large: >16 hours)
- **Priority:** High (blocking/critical), Medium (important), Low (nice-to-have)
- **Definition of Done:** Specific criteria that must be met to consider the task complete
- **Prerequisites:** Other tasks that must be completed first

## Quick Start Commands

```bash
# Install dependencies
pnpm install

# Run in development
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Package for distribution
pnpm package
```