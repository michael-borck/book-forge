/**
 * Typed wrapper around the Electron preload bridge (`window.electronAPI`).
 *
 * Every main-process handler returns a `{ success, error }` envelope; this
 * module unwraps it — resolving with the payload on success and throwing a
 * structured `ApiError` on failure — so callers can use plain try/catch and
 * never touch `window` directly.
 */

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  website?: string;
  supportsStreaming: boolean;
  supportsLocalModels: boolean;
  requiresApiKey: boolean;
  /** True when an API key for this provider is available in the environment. */
  envKeyAvailable?: boolean;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
}

export interface RedactedProviderConfig {
  hasApiKey: boolean;
  hasBearerToken: boolean;
  endpoint?: string;
  organizationId?: string;
  timeout?: number;
  maxRetries?: number;
  model?: string;
}

export interface ProviderConfigInput {
  apiKey?: string;
  endpoint?: string;
  organizationId?: string;
  bearerToken?: string;
}

export type BookStatus =
  | 'draft'
  | 'planned'
  | 'generating'
  | 'completed'
  | 'error'
  | 'cancelled';
export type ChapterStatus = 'pending' | 'generating' | 'completed' | 'error';

export interface BookChapter {
  id: string;
  number: number;
  title: string;
  content: string;
  status: ChapterStatus;
  tokens: number;
}

export interface Book {
  id: string;
  title: string;
  description: string;
  topic: string;
  style: string;
  length: string;
  provider: string;
  model: string;
  status: BookStatus;
  error?: string;
  chapters: BookChapter[];
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  modifiedAt: string;
}

export interface BookRequestInput {
  topic: string;
  style: string;
  length: string;
  providerId?: string;
  model?: string;
}

// ===== Workbench projects =====

export type ProjectStatus =
  | 'draft'
  | 'planned'
  | 'generating'
  | 'completed'
  | 'error'
  | 'cancelled';

export type NodeKind =
  | 'part'
  | 'chapter'
  | 'scene'
  | 'front-matter'
  | 'back-matter'
  | 'research';
export type NodeStatus = 'pending' | 'generating' | 'completed' | 'error';

export interface BookNode {
  id: string;
  kind: NodeKind;
  title: string;
  synopsis: string;
  content: string;
  parentId: string | null;
  order: number;
  status: NodeStatus;
  wordCount: number;
  tokensIn: number;
  tokensOut: number;
  keywords: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectBook {
  id: string;
  status: ProjectStatus;
  provider: string;
  model: string;
  error?: string;
  topic: string;
  style: string;
  length: string;
  nodes: BookNode[];
  artworks: Artwork[];
  artPlan: ArtPlanMeta | null;
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectSettings {
  topic: string;
  style: string;
  length: string;
  audience?: string;
  customInstructions?: string;
  artStylePreset?: string;
}

export type ArtworkPlacement =
  | 'cover'
  | 'frontispiece'
  | 'chapter-opener'
  | 'inline'
  | 'full-page';

export type ArtworkStatus =
  | 'planned'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'error'
  | 'disabled';

export interface ArtworkAsset {
  relativePath: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Artwork {
  id: string;
  nodeId: string | null;
  placement: ArtworkPlacement;
  prompt: string;
  negativePrompt?: string;
  stylePreset: string;
  styleBibleSnapshot?: string;
  source: 'generated' | 'uploaded';
  status: ArtworkStatus;
  asset?: ArtworkAsset;
  alt: string;
  caption?: string;
  attribution?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  error?: string;
  order?: number;
  createdAt: string;
  generatedAt?: string;
}

export interface ArtPlanMeta {
  stylePreset: string;
  styleBible: string;
  origin: { provider: string; model: string; at: string };
}

export interface ContinuityIssue {
  chapters: number[];
  issue: string;
  suggestion?: string;
}

export interface ContinuityResult {
  summary: string;
  issues: ContinuityIssue[];
}

export interface ArtworkProgress {
  projectId: string;
  artworkId?: string;
  index?: number;
  total?: number;
  status: 'planning' | 'generating' | 'ready' | 'error' | 'done';
  message?: string;
}

export interface ImageProviderInfo {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  defaultModel: string;
  defaultSize: string;
  sizes: string[];
}

export interface ImageProviderConfigInput {
  apiKey?: string;
  bearerToken?: string;
  baseUrl?: string;
  model?: string;
  size?: string;
  timeout?: number;
  lora?: string;
}

export interface RedactedImageProviderConfig {
  baseUrl?: string;
  model?: string;
  size?: string;
  timeout?: number;
  lora?: string;
  hasApiKey: boolean;
  hasBearerToken: boolean;
}

export interface ImageProviderState {
  providers: ImageProviderInfo[];
  configured: Record<string, RedactedImageProviderConfig>;
  current: string | null;
}

export interface CompileProfile {
  id: string;
  name: string;
  format: CompileFormat;
  includeKinds: NodeKind[];
  toc: boolean;
  metadata: { title: string; author: string; language: string };
}

export interface Project {
  schemaVersion: 2;
  id: string;
  title: string;
  author: string;
  language: string;
  genre: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  lastOpenedAt: string;
  settings: ProjectSettings;
  book: ProjectBook;
  compileProfiles: CompileProfile[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  author: string;
  description: string;
  status: ProjectStatus;
  wordCount: number;
  nodeCount: number;
  modifiedAt: string;
}

export interface Snapshot {
  id: string;
  projectId: string;
  nodeId: string;
  createdAt: string;
  reason: string;
  label?: string;
  title: string;
  content: string;
  wordCount: number;
}

export interface CreateProjectInput {
  title: string;
  author?: string;
  language?: string;
  genre?: string;
  topic?: string;
  style?: string;
  length?: string;
  templateId?: string;
}

export interface BookTemplateChapter {
  title: string;
  synopsis: string;
}

export interface BookTemplateDefinition {
  id: string;
  name: string;
  description: string;
  settings: { style: string; length: string; artStylePreset?: string };
  chapters: BookTemplateChapter[];
}

export type CompileFormat = 'markdown' | 'html' | 'pdf' | 'docx' | 'epub';

export interface CompileOptions {
  toc?: boolean;
  frontMatter?: boolean;
  backMatter?: boolean;
  numbering?: boolean;
  includeEmpty?: boolean;
  title?: string;
  author?: string;
  language?: string;
}

export type EditAction = 'refine' | 'expand' | 'shorten' | 'continue' | 'regenerate';

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

export interface SnapshotDiff {
  snapshotId: string;
  nodeId: string;
  lines: DiffLine[];
}

export interface BookEstimate {
  providerId: string;
  model: string;
  chapters: number;
  tokensIn: number;
  tokensOut: number;
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
}

export type ExportFormat = 'markdown' | 'html' | 'pdf';

export interface BookProgress {
  bookId: string;
  status: BookStatus;
  phase: 'outline' | 'chapter' | 'done' | 'error';
  currentChapter?: number;
  totalChapters?: number;
  chapterTitle?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True when running inside the desktop app (preload bridge present). */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

function bridge() {
  if (!isDesktop()) {
    throw new ApiError(
      'NO_BRIDGE',
      'This feature is only available in the BookForge desktop app.'
    );
  }
  return window.electronAPI;
}

// Unwrap the IPC result envelope: return the payload, or throw on failure.
async function unwrap<T>(promise: Promise<unknown>): Promise<T> {
  const res = (await promise) as
    | ({ success: true } & Record<string, unknown>)
    | { success: false; error?: { code?: string; message?: string } };

  if (!res || typeof res !== 'object') {
    throw new ApiError('INVALID_RESPONSE', 'Malformed response from main process');
  }
  if (res.success) {
    const data = { ...res } as Record<string, unknown>;
    delete data.success;
    return data as T;
  }
  throw new ApiError(res.error?.code ?? 'UNKNOWN', res.error?.message ?? 'Unknown error');
}

export const api = {
  isDesktop,

  async listProviders(): Promise<ProviderInfo[]> {
    const { providers } = await unwrap<{ providers: ProviderInfo[] }>(
      bridge().provider.list()
    );
    return providers;
  },

  async providerStatus(): Promise<{ statuses: Record<string, string>; current: string | null }> {
    return unwrap(bridge().provider.status());
  },

  async configuredProviders(): Promise<Record<string, RedactedProviderConfig>> {
    const { configured } = await unwrap<{ configured: Record<string, RedactedProviderConfig> }>(
      bridge().provider.configured()
    );
    return configured;
  },

  async initializeProvider(
    providerId: string,
    config: ProviderConfigInput
  ): Promise<{ providerId: string; status: string }> {
    return unwrap(bridge().provider.initialize(providerId, config));
  },

  async setCurrentProvider(providerId: string): Promise<void> {
    await unwrap(bridge().provider.setCurrent(providerId));
  },

  async listModels(providerId: string): Promise<Model[]> {
    const { models } = await unwrap<{ models: Model[] }>(bridge().provider.models(providerId));
    return models;
  },

  async setProviderModel(providerId: string, model: string): Promise<void> {
    await unwrap(bridge().provider.setModel(providerId, model));
  },

  async removeProvider(providerId: string): Promise<void> {
    await unwrap(bridge().provider.remove(providerId));
  },

  async estimateBook(req: BookRequestInput): Promise<BookEstimate> {
    return unwrap<BookEstimate>(bridge().book.estimate(req));
  },

  async generateBook(req: BookRequestInput): Promise<Book> {
    const { book } = await unwrap<{ book: Book }>(bridge().book.generate(req));
    return book;
  },

  async cancelBook(bookId: string): Promise<void> {
    await unwrap(bridge().book.cancel(bookId));
  },

  async retryBook(bookId: string): Promise<Book> {
    const { book } = await unwrap<{ book: Book }>(bridge().book.retry(bookId));
    return book;
  },

  async listBooks(): Promise<Book[]> {
    const { books } = await unwrap<{ books: Book[] }>(bridge().book.list());
    return books;
  },

  async getBook(id: string): Promise<Book> {
    const { book } = await unwrap<{ book: Book }>(bridge().book.get(id));
    return book;
  },

  async deleteBook(id: string): Promise<void> {
    await unwrap(bridge().book.delete(id));
  },

  async exportBook(
    bookId: string,
    format: ExportFormat
  ): Promise<{ canceled: boolean; path?: string }> {
    return unwrap(bridge().export[format](bookId));
  },

  // ===== Projects =====

  async listTemplates(): Promise<BookTemplateDefinition[]> {
    const { templates } = await unwrap<{ templates: BookTemplateDefinition[] }>(
      bridge().project.templates()
    );
    return templates;
  },

  async listProjects(): Promise<ProjectSummary[]> {
    const { projects } = await unwrap<{ projects: ProjectSummary[] }>(bridge().project.list());
    return projects;
  },

  async getProject(id: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(bridge().project.get(id));
    return project;
  },

  async createProject(input: CreateProjectInput): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(bridge().project.create(input));
    return project;
  },

  async updateProjectMeta(id: string, patch: Partial<CreateProjectInput>): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().project.updateMeta(id, patch)
    );
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    await unwrap(bridge().project.delete(id));
  },

  async duplicateProject(id: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(bridge().project.duplicate(id));
    return project;
  },

  async planProject(id: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(bridge().project.plan(id));
    return project;
  },

  async runContinuity(id: string): Promise<{ project: Project; result: ContinuityResult }> {
    return unwrap(bridge().project.continuity(id));
  },

  async generateProject(id: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(bridge().project.generate(id));
    return project;
  },

  async cancelProject(id: string): Promise<void> {
    await unwrap(bridge().project.cancel(id));
  },

  async createNode(
    projectId: string,
    input: { kind: NodeKind; title: string; parentId?: string | null; synopsis?: string; content?: string }
  ): Promise<{ project: Project; nodeId: string }> {
    return unwrap(bridge().node.create(projectId, input));
  },

  async updateNode(
    projectId: string,
    nodeId: string,
    patch: { title?: string; synopsis?: string; content?: string; kind?: NodeKind; keywords?: string[] }
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().node.update(projectId, nodeId, patch)
    );
    return project;
  },

  async moveNode(
    projectId: string,
    nodeId: string,
    move: { parentId: string | null; order?: number }
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().node.move(projectId, nodeId, move)
    );
    return project;
  },

  async deleteNode(projectId: string, nodeId: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().node.delete(projectId, nodeId)
    );
    return project;
  },

  async editNode(
    projectId: string,
    nodeId: string,
    action: EditAction,
    instruction?: string
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().node.aiEdit(projectId, nodeId, { action, instruction })
    );
    return project;
  },

  async listSnapshots(projectId: string, nodeId?: string): Promise<Snapshot[]> {
    const { snapshots } = await unwrap<{ snapshots: Snapshot[] }>(
      bridge().snapshot.list(projectId, nodeId)
    );
    return snapshots;
  },

  async importResearch(
    projectId: string
  ): Promise<{ project: Project; nodeId?: string; canceled: boolean }> {
    return unwrap(bridge().research.import(projectId));
  },

  async createSnapshot(projectId: string, nodeId: string, reason = 'manual'): Promise<Snapshot> {
    const { snapshot } = await unwrap<{ snapshot: Snapshot }>(
      bridge().snapshot.create(projectId, nodeId, reason)
    );
    return snapshot;
  },

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().snapshot.restore(projectId, snapshotId)
    );
    return project;
  },

  async diffSnapshot(projectId: string, snapshotId: string): Promise<SnapshotDiff> {
    return unwrap<SnapshotDiff>(bridge().snapshot.diff(projectId, snapshotId));
  },

  async compileProject(
    projectId: string,
    format: CompileFormat,
    options: CompileOptions = {}
  ): Promise<{ canceled: boolean; path?: string; warnings?: string[] }> {
    return unwrap(bridge().compile.run({ projectId, format, options }));
  },

  async batchCompile(
    projectIds: string[],
    format: CompileFormat,
    options: CompileOptions = {}
  ): Promise<{
    canceled: boolean;
    results: Array<{
      projectId: string;
      title: string;
      path?: string;
      error?: string;
      warnings?: string[];
    }>;
  }> {
    return unwrap(bridge().compile.batch({ projectIds, format, options }));
  },

  // ===== Image providers =====

  async listImageProviders(): Promise<ImageProviderState> {
    return unwrap<ImageProviderState>(bridge().imageProvider.list());
  },

  async configureImageProvider(
    id: string,
    config: ImageProviderConfigInput
  ): Promise<ImageProviderState> {
    return unwrap<ImageProviderState>(bridge().imageProvider.configure(id, config));
  },

  async setCurrentImageProvider(id: string): Promise<void> {
    await unwrap(bridge().imageProvider.setCurrent(id));
  },

  async removeImageProvider(id: string): Promise<ImageProviderState> {
    return unwrap<ImageProviderState>(bridge().imageProvider.remove(id));
  },

  async listImageStyles(): Promise<Array<{ id: string; label: string }>> {
    const { styles } = await unwrap<{ styles: Array<{ id: string; label: string }> }>(
      bridge().imageProvider.styles()
    );
    return styles;
  },

  // ===== Artwork =====

  async planArtwork(
    projectId: string,
    stylePreset?: string
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().artwork.plan(projectId, { stylePreset })
    );
    return project;
  },

  async updateArtwork(
    projectId: string,
    artworkId: string,
    patch: {
      prompt?: string;
      alt?: string;
      caption?: string;
      status?: 'planned' | 'disabled';
    }
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().artwork.update(projectId, artworkId, patch)
    );
    return project;
  },

  async deleteArtwork(projectId: string, artworkId: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().artwork.remove(projectId, artworkId)
    );
    return project;
  },

  async generateArtwork(projectId: string, artworkId: string): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().artwork.generate(projectId, artworkId)
    );
    return project;
  },

  async generateAllArtwork(
    projectId: string,
    options: { maxImages?: number; maxCostUsd?: number } = {}
  ): Promise<Project> {
    const { project } = await unwrap<{ project: Project }>(
      bridge().artwork.generateAll(projectId, options)
    );
    return project;
  },

  async uploadArtwork(
    projectId: string,
    payload: { nodeId?: string | null; placement?: ArtworkPlacement; alt?: string }
  ): Promise<{ project: Project; canceled: boolean; artworkId?: string }> {
    return unwrap(bridge().artwork.upload(projectId, payload));
  },

  async artworkAsset(
    projectId: string,
    artworkId: string,
    variant: 'thumb' | 'full'
  ): Promise<string> {
    const { dataUrl } = await unwrap<{ dataUrl: string }>(
      bridge().artwork.asset(projectId, artworkId, variant)
    );
    return dataUrl;
  },

  onArtworkProgress(callback: (progress: ArtworkProgress) => void): () => void {
    if (!isDesktop()) return () => {};
    return window.electronAPI.artwork.onProgress((progress) =>
      callback(progress as ArtworkProgress)
    );
  },

  /** Subscribe to generation progress. Returns an unsubscribe function. */
  onBookProgress(callback: (progress: BookProgress) => void): () => void {
    if (!isDesktop()) return () => {};
    return window.electronAPI.book.onProgress((p) => callback(p as BookProgress));
  },
};
