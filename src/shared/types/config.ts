/**
 * Application configuration types for BookForge
 */

import type { ProviderConfig } from './provider';
import type { ExportFormat } from './book';
import type { WritingStyle, WritingTone, BookLength, TargetAudience } from './book';

// Main application configuration
export interface AppConfig {
  version: string;
  
  // User preferences
  user: UserPreferences;
  
  // Provider configurations
  providers: Record<string, ProviderConfig>;
  
  // Default generation settings
  defaults: DefaultSettings;
  
  // Application behavior
  app: AppSettings;
  
  // Export preferences
  export: ExportPreferences;
  
  // Security and privacy
  security: SecuritySettings;
}

export interface UserPreferences {
  // UI preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  fontSize: 'small' | 'medium' | 'large';
  sidebarWidth: number;
  
  // Workflow preferences
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
  confirmBeforeDelete: boolean;
  showTipsAndTutorials: boolean;
  
  // Notifications
  notifications: {
    enabled: boolean;
    generationComplete: boolean;
    errorOccurred: boolean;
    exportComplete: boolean;
    budgetWarnings: boolean;
  };
  
  // Recent items
  recentBooks: string[]; // Book IDs
  recentProviders: string[];
  recentTemplates: string[];
}

export interface DefaultSettings {
  // Generation defaults
  generation: {
    style: WritingStyle;
    tone: WritingTone;
    length: BookLength;
    audience: TargetAudience;
    language: string;
    temperature: number;
    maxTokensPerChapter: number;
    includeTableOfContents: boolean;
  };
  
  // Provider defaults
  provider: {
    preferred: string;
    model: string;
    fallbackProviders: string[];
  };
  
  // Quality settings
  quality: {
    enableSpellCheck: boolean;
    enableGrammarCheck: boolean;
    enableConsistencyCheck: boolean;
    minChapterLength: number;
    maxChapterLength: number;
  };
}

export interface AppSettings {
  // Performance
  maxConcurrentGenerations: number;
  requestTimeout: number;
  retryAttempts: number;
  cacheSize: number; // in MB
  
  // Directories
  dataDirectory: string;
  exportDirectory: string;
  templateDirectory: string;
  logDirectory: string;
  
  // Backup and recovery
  autoBackup: boolean;
  backupInterval: number; // in hours
  maxBackups: number;
  
  // Monitoring
  enableAnalytics: boolean;
  enableCrashReporting: boolean;
  enablePerformanceMetrics: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  
  // Updates
  checkForUpdates: boolean;
  autoInstallUpdates: boolean;
  updateChannel: 'stable' | 'beta' | 'alpha';
}

export interface ExportPreferences {
  // Default format and options
  defaultFormat: ExportFormat;
  
  // Format-specific defaults
  markdown: {
    includeYAMLFrontMatter: boolean;
    lineBreaks: 'LF' | 'CRLF';
  };
  
  html: {
    defaultTheme: string;
    includeCSS: boolean;
    singleFile: boolean;
  };
  
  pdf: {
    pageSize: 'A4' | 'Letter' | 'Legal';
    fontSize: number;
    fontFamily: string;
    includePageNumbers: boolean;
    includeCoverPage: boolean;
  };
  
  // Output preferences
  includeMetadata: boolean;
  includeTableOfContents: boolean;
  openAfterExport: boolean;
  showExportPreview: boolean;
}

export interface SecuritySettings {
  // API key management
  encryptApiKeys: boolean;
  keyRotationInterval: number; // in days
  
  // Data protection
  encryptLocalData: boolean;
  clearDataOnExit: boolean;
  sessionTimeout: number; // in minutes
  
  // Network security
  allowInsecureConnections: boolean;
  proxySettings?: {
    enabled: boolean;
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  
  // Content filtering
  enableContentFilter: boolean;
  restrictedTopics: string[];
  
  // Privacy
  shareUsageStatistics: boolean;
  allowTelemetry: boolean;
}

// Budget and cost management
export interface BudgetSettings {
  // Global limits
  monthlyLimit: number;
  dailyLimit: number;
  perBookLimit: number;
  currency: string;
  
  // Warnings
  warningThresholds: {
    monthly: number; // percentage of monthly limit
    daily: number;   // percentage of daily limit
    perBook: number; // percentage of per-book limit
  };
  
  // Tracking
  trackingEnabled: boolean;
  includeFreeTier: boolean; // Include free tier usage in calculations
  
  // Provider-specific limits
  providerLimits: Record<string, {
    monthlyLimit: number;
    dailyLimit: number;
    enabled: boolean;
  }>;
}

// Keyboard shortcuts
export interface KeyboardShortcuts {
  // Global shortcuts
  newBook: string;
  openBook: string;
  saveBook: string;
  exportBook: string;
  settings: string;
  
  // Generation shortcuts
  startGeneration: string;
  pauseGeneration: string;
  stopGeneration: string;
  regenerateChapter: string;
  
  // Navigation shortcuts
  nextChapter: string;
  previousChapter: string;
  goToChapter: string;
  
  // UI shortcuts
  toggleSidebar: string;
  togglePreview: string;
  toggleFullscreen: string;
  search: string;
}

// Workspace and project settings
export interface WorkspaceSettings {
  // Project organization
  defaultWorkspace: string;
  workspaces: WorkspaceConfig[];
  
  // File management
  autoOrganizeFiles: boolean;
  fileNamingPattern: string;
  
  // Collaboration (future feature)
  shareableWorkspaces: boolean;
  collaborationEnabled: boolean;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
  path: string;
  isDefault: boolean;
  
  // Workspace-specific settings
  settings: Partial<AppConfig>;
  
  // Metadata
  createdAt: Date;
  lastAccessed: Date;
}

// Plugin and extension system (future feature)
export interface PluginConfig {
  enabled: boolean;
  installedPlugins: InstalledPlugin[];
  allowedSources: string[];
  autoUpdate: boolean;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  installedAt: Date;
  lastUpdated: Date;
}

// Configuration validation and migration
export interface ConfigMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (oldConfig: any) => AppConfig;
  validate: (config: any) => ConfigValidationResult;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}