/**
 * BaseProvider - Abstract base class for all AI providers in BookForge
 * 
 * This class provides common functionality that all providers share:
 * - Configuration management and validation
 * - Event handling and status tracking
 * - Token counting utilities
 * - Error handling and retry logic
 * - Health monitoring
 */

import { EventEmitter } from 'events';
import type {
  IProvider,
  ProviderInfo,
  ProviderConfig,
  ProviderCapabilities,
  ProviderStatus,
  ProviderHealth,
  Model,
  GenerationParams,
  GenerationChunk,
  TokenUsage,
  CostEstimate,
  ProviderEvents,
  ConfigValidationResult,
} from '../../../shared/types';

import {
  ProviderError,
  ERROR_CODES,
  createProviderError,
} from '../../../shared/types';

export abstract class BaseProvider extends EventEmitter implements IProvider {
  // Abstract properties that concrete providers must implement
  abstract readonly info: ProviderInfo;
  abstract readonly capabilities: ProviderCapabilities;

  // Provider state
  protected config: ProviderConfig | null = null;
  protected status: ProviderStatus = 'disconnected';
  protected lastHealthCheck: Date | null = null;
  protected isInitialized = false;
  protected isDisposed = false;

  // Rate limiting and retry configuration
  protected maxRetries = 3;
  protected baseRetryDelay = 1000; // 1 second
  protected maxRetryDelay = 30000; // 30 seconds

  constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple listeners for events
  }

  // =====================
  // Configuration Methods
  // =====================

  async initialize(config: ProviderConfig): Promise<void> {
    this.validateNotDisposed();
    
    try {
      this.setStatus('configuring');

      // Validate configuration
      const validation = await this.validateConfig(config);
      if (!validation.isValid) {
        throw createProviderError(
          this.info.id,
          `Configuration validation failed: ${validation.errors.join(', ')}`,
          ERROR_CODES.PROVIDER_INVALID_CONFIG,
          { userMessage: 'Please check your provider configuration settings.' }
        );
      }

      // Store configuration
      this.config = { ...config };
      
      // Perform provider-specific initialization
      await this.doInitialize(config);
      
      this.isInitialized = true;
      this.setStatus('ready');
      
      this.emit('config-updated', config);
      
    } catch (error) {
      this.setStatus('error');
      const providerError = this.wrapError(error, 'Failed to initialize provider');
      this.emit('error', providerError);
      throw providerError;
    }
  }

  async configure(partialConfig: Partial<ProviderConfig>): Promise<void> {
    this.validateNotDisposed();
    
    if (!this.config) {
      throw createProviderError(
        this.info.id,
        'Provider must be initialized before configuration updates',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    const newConfig = { ...this.config, ...partialConfig };
    await this.initialize(newConfig);
  }

  async validateConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields based on provider capabilities
    if (this.info.requiresApiKey && !config.apiKey?.trim()) {
      errors.push('API key is required for this provider');
    }

    if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 300000)) {
      errors.push('Timeout must be between 1 second and 5 minutes');
    }

    if (config.maxRetries !== undefined && (config.maxRetries < 0 || config.maxRetries > 10)) {
      warnings.push('Max retries should be between 0 and 10');
    }

    // Provider-specific validation
    const providerValidation = await this.validateProviderConfig(config);
    errors.push(...providerValidation.errors);
    warnings.push(...providerValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // =====================
  // Model Management
  // =====================

  abstract getAvailableModels(): Promise<Model[]>;

  async getModel(modelId: string): Promise<Model | null> {
    try {
      const models = await this.getAvailableModels();
      return models.find(model => model.id === modelId) || null;
    } catch (error) {
      this.emit('error', this.wrapError(error, `Failed to get model: ${modelId}`));
      return null;
    }
  }

  // =====================
  // Generation Methods
  // =====================

  async generate(params: GenerationParams): Promise<GenerationChunk> {
    this.validateReadyState();

    try {
      // Validate generation parameters
      this.validateGenerationParams(params);

      // Perform the generation
      const result = await this.doGenerate(params);
      
      return result;
    } catch (error) {
      const providerError = this.wrapError(error, 'Generation failed');
      this.emit('error', providerError);
      throw providerError;
    }
  }

  async *generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    this.validateReadyState();

    if (!this.capabilities.streaming) {
      throw createProviderError(
        this.info.id,
        'Streaming is not supported by this provider',
        ERROR_CODES.PROVIDER_API_ERROR,
        { userMessage: 'Please use non-streaming generation for this provider.' }
      );
    }

    try {
      this.validateGenerationParams(params);

      // Use provider-specific streaming implementation
      yield* this.doGenerateStream(params);
      
    } catch (error) {
      const providerError = this.wrapError(error, 'Streaming generation failed');
      this.emit('error', providerError);
      throw providerError;
    }
  }

  // =====================
  // Token and Cost Utils
  // =====================

  async countTokens(text: string, model?: string): Promise<number> {
    if (!text) return 0;
    
    try {
      return await this.doCountTokens(text, model);
    } catch (error) {
      // Fallback to simple estimation if provider doesn't support token counting
      return this.estimateTokenCount(text);
    }
  }

  estimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    try {
      return this.doEstimateCost(usage, modelId);
    } catch (error) {
      // Return zero cost if estimation fails
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }
  }

  // =====================
  // Health and Status
  // =====================

  async checkHealth(): Promise<ProviderHealth> {
    const now = new Date();
    
    try {
      const startTime = Date.now();
      
      // Provider-specific health check
      await this.doHealthCheck();
      
      const latency = Date.now() - startTime;
      this.lastHealthCheck = now;
      
      const health: ProviderHealth = {
        status: this.status,
        lastChecked: now,
        latency,
      };

      return health;
      
    } catch (error) {
      this.setStatus('error');
      
      return {
        status: 'error',
        lastChecked: now,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  // =====================
  // Lifecycle Management
  // =====================

  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    try {
      // Perform provider-specific cleanup
      await this.doDispose();
      
      // Clean up event listeners
      this.removeAllListeners();
      
      // Reset state
      this.config = null;
      this.isInitialized = false;
      this.isDisposed = true;
      this.setStatus('disconnected');
      
    } catch (error) {
      console.error(`Error disposing provider ${this.info.id}:`, error);
    }
  }

  // =====================
  // Protected Methods (to be implemented by concrete providers)
  // =====================

  protected abstract doInitialize(config: ProviderConfig): Promise<void>;
  protected abstract doGenerate(params: GenerationParams): Promise<GenerationChunk>;
  protected abstract doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk>;
  protected abstract doCountTokens(text: string, model?: string): Promise<number>;
  protected abstract doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate;
  protected abstract doHealthCheck(): Promise<void>;

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    // Default implementation - providers can override
    return { isValid: true, errors: [], warnings: [] };
  }

  protected async doDispose(): Promise<void> {
    // Default implementation - providers can override
  }

  // =====================
  // Protected Utility Methods
  // =====================

  protected setStatus(status: ProviderStatus): void {
    if (this.status !== status) {
      const oldStatus = this.status;
      this.status = status;
      this.emit('status-changed', status);
      
      console.log(`Provider ${this.info.id} status changed: ${oldStatus} -> ${status}`);
    }
  }

  protected validateReadyState(): void {
    this.validateNotDisposed();
    
    if (!this.isInitialized) {
      throw createProviderError(
        this.info.id,
        'Provider is not initialized',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    if (this.status !== 'ready') {
      throw createProviderError(
        this.info.id,
        `Provider is not ready (status: ${this.status})`,
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }
  }

  protected validateNotDisposed(): void {
    if (this.isDisposed) {
      throw createProviderError(
        this.info.id,
        'Provider has been disposed',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }
  }

  protected validateGenerationParams(params: GenerationParams): void {
    if (!params.messages || params.messages.length === 0) {
      throw createProviderError(
        this.info.id,
        'Messages are required for generation',
        ERROR_CODES.VALIDATION_REQUIRED_FIELD
      );
    }

    if (!params.model) {
      throw createProviderError(
        this.info.id,
        'Model is required for generation',
        ERROR_CODES.VALIDATION_REQUIRED_FIELD
      );
    }

    if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
      throw createProviderError(
        this.info.id,
        'Temperature must be between 0 and 2',
        ERROR_CODES.VALIDATION_OUT_OF_RANGE
      );
    }

    if (params.maxTokens !== undefined && params.maxTokens < 1) {
      throw createProviderError(
        this.info.id,
        'Max tokens must be positive',
        ERROR_CODES.VALIDATION_OUT_OF_RANGE
      );
    }
  }

  protected wrapError(error: unknown, message: string): ProviderError {
    if (error instanceof Error && 'providerId' in error && 'code' in error) {
      return error as ProviderError;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return createProviderError(
      this.info.id,
      `${message}: ${errorMessage}`,
      ERROR_CODES.PROVIDER_API_ERROR,
      {
        cause: error instanceof Error ? error : undefined,
        retryable: this.isRetryableError(error),
      }
    );
  }

  protected isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('rate limit') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.maxRetries || !this.isRetryableError(error)) {
          break;
        }

        const delay = Math.min(
          this.baseRetryDelay * Math.pow(2, attempt),
          this.maxRetryDelay
        );
        
        console.log(
          `Provider ${this.info.id}: ${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms...`
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw this.wrapError(lastError!, `${context} failed after ${this.maxRetries + 1} attempts`);
  }

  protected estimateTokenCount(text: string): number {
    // Simple estimation: roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  protected createGenerationChunk(
    content: string,
    options: {
      id?: string;
      tokens?: number;
      finishReason?: GenerationChunk['finishReason'];
      usage?: TokenUsage;
      model: string;
    }
  ): GenerationChunk {
    return {
      id: options.id || `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      tokens: options.tokens || this.estimateTokenCount(content),
      finishReason: options.finishReason,
      usage: options.usage,
      model: options.model,
      timestamp: new Date(),
    };
  }

  // =====================
  // Event Handling
  // =====================

  // Typed event emitter methods
  emit<K extends keyof ProviderEvents>(event: K, ...args: Parameters<ProviderEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this {
    return super.on(event, listener);
  }

  off<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this {
    return super.off(event, listener);
  }

  once<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this {
    return super.once(event, listener);
  }
}