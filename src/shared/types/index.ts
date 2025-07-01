/**
 * Central export for all BookForge types
 * This file provides a single import point for all type definitions
 */

// Provider system types
export type {
  // Core provider interfaces
  IProvider,
  ProviderFactory,
  ProviderInfo,
  ProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderStatus,
  ProviderEvents,
  ConfigValidationResult,
  
  // Models and generation
  Model,
  GenerationParams,
  GenerationChunk,
  Message,
  TokenUsage,
  CostEstimate,
  
  // Book generation specific
  BookGenerationParams,
  Chapter,
  BookStructure,
  GenerationProgress,
} from './provider';

// Book and content types
export type {
  // Core book types
  Book,
  BookStatus,
  BookChapter,
  ChapterStatus,
  TableOfContentsEntry,
  
  // Generation settings
  BookGenerationSettings,
  WritingStyle,
  WritingTone,
  BookLength,
  TargetAudience,
  
  // Export system
  ExportFormat,
  ExportOptions,
  ExportResult,
  
  // Template system
  BookTemplate,
  TemplateCategory,
  ChapterTemplate,
  
  // Search and filtering
  BookSearchCriteria,
  BookSearchResult,
} from './book';

// Configuration types
export type {
  // Main configuration
  AppConfig,
  UserPreferences,
  DefaultSettings,
  AppSettings,
  ExportPreferences,
  SecuritySettings,
  
  // Specialized configurations
  BudgetSettings,
  KeyboardShortcuts,
  WorkspaceSettings,
  WorkspaceConfig,
  PluginConfig,
  InstalledPlugin,
  
  // Configuration management
  ConfigMigration,
  ConfigValidationResult as AppConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './config';

// Error handling types
export {
  // Error classes
  BookForgeError,
  ProviderError,
  NetworkError,
  ConfigurationError,
  ValidationError,
  RateLimitError,
  QuotaExceededError,
  FileSystemError,
  ExportError,
  GenerationError,
  
  // Error constants and utilities
  ERROR_CODES,
  createProviderError,
  createValidationError,
  isRetryableError,
  getErrorSeverity,
} from './errors';

export type {
  ErrorCategory,
  ErrorCode,
  FieldError,
  ErrorContext,
  ErrorReport,
  RecoveryAction,
  ErrorHandler,
  ErrorHandlerResult,
} from './errors';

// Utility types for the application
export interface AsyncResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SortOptions<T> {
  field: keyof T;
  direction: 'asc' | 'desc';
}

export interface FilterOptions<T> {
  field: keyof T;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  value: any;
}

// Event system types
export interface AppEvent<T = any> {
  type: string;
  payload: T;
  timestamp: Date;
  source?: string;
}

export type EventHandler<T = any> = (event: AppEvent<T>) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
}

// API and IPC types
export interface IPCRequest<T = any> {
  id: string;
  method: string;
  params: T;
  timestamp: Date;
}

export interface IPCResponse<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

// File system types
export interface FileInfo {
  path: string;
  name: string;
  size: number;
  extension: string;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

export interface DirectoryInfo extends FileInfo {
  children?: FileInfo[];
  childCount: number;
}

// Logging and debugging types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  source?: string;
  metadata?: Record<string, unknown>;
  stack?: string;
}

// Performance monitoring types
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface MemoryUsage {
  used: number;
  total: number;
  percentage: number;
  timestamp: Date;
}

// Update and versioning types
export interface UpdateInfo {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: Date;
  isSecurityUpdate: boolean;
  size: number;
  checksum: string;
}

export interface VersionInfo {
  app: string;
  electron: string;
  node: string;
  chrome: string;
  platform: string;
  arch: string;
}

// Analytics and telemetry types (if enabled)
export interface UsageStats {
  booksGenerated: number;
  totalTokensUsed: number;
  totalCostIncurred: number;
  averageBookLength: number;
  mostUsedProvider: string;
  mostUsedModel: string;
  exportFormatsUsed: Record<string, number>;
  sessionDuration: number;
  lastActive: Date;
}

export interface TelemetryEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: Date;
  sessionId: string;
  userId?: string;
}

// Constants and enums
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'
] as const;

export const SUPPORTED_EXPORT_FORMATS = [
  'markdown', 'html', 'pdf', 'docx', 'epub', 'txt'
] as const;

export const DEFAULT_GENERATION_SETTINGS = {
  topic: '',
  style: 'educational',
  tone: 'neutral',
  length: 'medium',
  audience: 'general',
  language: 'en',
  includeTableOfContents: true,
  includeIndex: false,
  includeGlossary: false,
  includeBibliography: false,
  temperature: 0.7,
  maxTokensPerChapter: 2000,
  contextWindow: 4000,
};

export const PROVIDER_IDS = {
  GROQ: 'groq',
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
} as const;

// Type guards and utility functions
export function isProviderError(error: unknown): boolean {
  return error instanceof Error && 'providerId' in error && 'code' in error;
}

export function isBookGenerationParams(params: unknown): boolean {
  return typeof params === 'object' && 
         params !== null && 
         'topic' in params && 
         'style' in params;
}

export function isValidExportFormat(format: string): boolean {
  return (SUPPORTED_EXPORT_FORMATS as readonly string[]).includes(format);
}