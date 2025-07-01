/**
 * Core provider system types for BookForge
 * These types define the contract that all AI providers must implement
 */

// Provider identification and status
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  website?: string;
  supportsStreaming: boolean;
  supportsLocalModels: boolean;
  requiresApiKey: boolean;
}

// Configuration for each provider
export interface ProviderConfig {
  apiKey?: string;
  endpoint?: string;
  organizationId?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}

// Available models for a provider
export interface Model {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  inputPricing: number; // Cost per 1K input tokens
  outputPricing: number; // Cost per 1K output tokens
  currency: string;
  isLocal?: boolean;
  isInstalled?: boolean;
}

// Generation parameters
export interface GenerationParams {
  messages: Message[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  systemPrompt?: string;
}

// Message structure for conversations
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  timestamp?: Date;
}

// Streaming generation chunks
export interface GenerationChunk {
  id: string;
  content: string;
  tokens: number;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error' | 'function_call';
  usage?: TokenUsage;
  model: string;
  timestamp: Date;
}

// Token usage tracking
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Cost estimation
export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  breakdown?: {
    promptTokens: number;
    completionTokens: number;
    inputRate: number;
    outputRate: number;
  };
}

// Provider capability flags
export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  imageInput: boolean;
  imageOutput: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  localExecution: boolean;
  customEndpoints: boolean;
}

// Provider status and health
export type ProviderStatus = 'ready' | 'configuring' | 'error' | 'disconnected' | 'rate_limited';

export interface ProviderHealth {
  status: ProviderStatus;
  lastChecked: Date;
  latency?: number;
  errorMessage?: string;
  rateLimit?: {
    remaining: number;
    resetTime: Date;
  };
}

// Re-export ProviderError from errors.ts to maintain backward compatibility
export type { ProviderError } from './errors';

// Main provider interface that all providers must implement
export interface IProvider {
  // Provider identification
  readonly info: ProviderInfo;
  readonly capabilities: ProviderCapabilities;
  
  // Configuration and setup
  initialize(config: ProviderConfig): Promise<void>;
  configure(config: Partial<ProviderConfig>): Promise<void>;
  validateConfig(config: ProviderConfig): Promise<ConfigValidationResult>;
  
  // Model management
  getAvailableModels(): Promise<Model[]>;
  getModel(modelId: string): Promise<Model | null>;
  
  // Generation methods
  generate(params: GenerationParams): Promise<GenerationChunk>;
  generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk>;
  
  // Token and cost utilities
  countTokens(text: string, model?: string): Promise<number>;
  estimateCost(usage: TokenUsage, model: string): CostEstimate;
  
  // Health and status
  checkHealth(): Promise<ProviderHealth>;
  getStatus(): ProviderStatus;
  
  // Cleanup
  dispose(): Promise<void>;
  
  // Event handling
  on<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this;
  off<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this;
  once<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this;
  emit<K extends keyof ProviderEvents>(event: K, ...args: Parameters<ProviderEvents[K]>): boolean;
}

// Provider factory interface for creating providers
export interface ProviderFactory {
  createProvider(providerId: string, config?: ProviderConfig): Promise<IProvider>;
  getSupportedProviders(): ProviderInfo[];
}

// Import ProviderError for event typing
import type { ProviderError } from './errors';

// Events that providers can emit
export interface ProviderEvents {
  'status-changed': (status: ProviderStatus) => void;
  'error': (error: ProviderError) => void;
  'config-updated': (config: ProviderConfig) => void;
  'model-list-updated': (models: Model[]) => void;
}

// Configuration validation result
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Book generation specific types
export interface BookGenerationParams extends GenerationParams {
  topic: string;
  style: 'educational' | 'casual' | 'professional' | 'creative';
  length: 'short' | 'medium' | 'long';
  audience: 'general' | 'technical' | 'academic' | 'children';
  language: string;
  includeTableOfContents: boolean;
  includeIndex: boolean;
  customInstructions?: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  summary?: string;
  estimatedTokens: number;
  actualTokens?: number;
  generatedAt?: Date;
  status: 'pending' | 'generating' | 'completed' | 'error';
}

export interface BookStructure {
  title: string;
  description: string;
  chapters: Chapter[];
  metadata: {
    author: string;
    language: string;
    genre: string;
    targetAudience: string;
    estimatedLength: number;
    createdAt: Date;
    modifiedAt: Date;
  };
}

export interface GenerationProgress {
  bookId: string;
  currentPhase: 'structure' | 'content' | 'finalization';
  currentChapter: number;
  totalChapters: number;
  completedChapters: number;
  estimatedTimeRemaining?: number;
  tokensUsed: number;
  estimatedCost: CostEstimate;
}