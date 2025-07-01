/**
 * ProviderManager - High-level service for managing AI providers
 * 
 * This service provides:
 * - Simplified provider management API
 * - Configuration persistence
 * - Provider health monitoring
 * - Automatic failover and retry logic
 * - Usage tracking and analytics
 */

import { EventEmitter } from 'events';
import { providerRegistry, type ProviderRegistry } from './ProviderRegistry';
import type {
  IProvider,
  ProviderInfo,
  ProviderConfig,
  ProviderStatus,
  GenerationParams,
  GenerationChunk,
  Model,
  CostEstimate,
  TokenUsage,
  ProviderError,
} from '../../../shared/types';

import {
  ERROR_CODES,
  createProviderError,
} from '../../../shared/types';

// Manager-specific types
export interface ProviderManagerConfig {
  defaultProvider?: string;
  fallbackProviders?: string[];
  healthCheckInterval?: number;
  enableAutoFailover?: boolean;
  maxConcurrentRequests?: number;
}

export interface ProviderUsageStats {
  providerId: string;
  requestCount: number;
  tokenCount: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  lastUsed: Date;
}

interface ManagerEvents {
  'provider-switched': (from: string, to: string, reason: string) => void;
  'health-check-completed': (results: Record<string, any>) => void;
  'usage-updated': (providerId: string, stats: ProviderUsageStats) => void;
  'error': (error: ProviderError) => void;
}

export class ProviderManager extends EventEmitter {
  private config: ProviderManagerConfig;
  private currentProvider: string | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private usageStats = new Map<string, ProviderUsageStats>();
  private activeRequests = new Map<string, number>();
  private isDisposed = false;

  constructor(
    config: ProviderManagerConfig = {},
    private registry: ProviderRegistry = providerRegistry
  ) {
    super();
    
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      enableAutoFailover: true,
      maxConcurrentRequests: 10,
      ...config,
    };

    this.setupEventHandlers();
    this.startHealthMonitoring();
  }

  // =====================
  // Provider Management
  // =====================

  /**
   * Initialize a provider with configuration
   */
  async initializeProvider(providerId: string, config: ProviderConfig): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Provider manager has been disposed');
    }

    try {
      // Create or get existing provider
      let provider = this.registry.getProvider(providerId);
      if (!provider) {
        provider = await this.registry.createProvider(providerId, config);
      } else {
        await provider.configure(config);
      }

      // Initialize usage stats if not exists
      if (!this.usageStats.has(providerId)) {
        this.usageStats.set(providerId, {
          providerId,
          requestCount: 0,
          tokenCount: 0,
          totalCost: 0,
          averageLatency: 0,
          errorRate: 0,
          lastUsed: new Date(),
        });
      }

      // Set as current provider if none is set
      if (!this.currentProvider) {
        this.currentProvider = providerId;
      }

    } catch (error) {
      const providerError = (error instanceof Error && 'providerId' in error && 'code' in error)
        ? error as ProviderError
        : createProviderError(providerId, `Failed to initialize provider: ${error}`, ERROR_CODES.PROVIDER_API_ERROR);
      
      this.emit('error', providerError);
      throw providerError;
    }
  }

  /**
   * Set the current active provider
   */
  async setCurrentProvider(providerId: string): Promise<void> {
    if (!this.registry.isProviderRegistered(providerId)) {
      throw createProviderError(
        providerId,
        'Provider is not registered',
        ERROR_CODES.PROVIDER_NOT_FOUND
      );
    }

    const provider = this.registry.getProvider(providerId);
    if (!provider) {
      throw createProviderError(
        providerId,
        'Provider is not initialized',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    if (provider.getStatus() !== 'ready') {
      throw createProviderError(
        providerId,
        `Provider is not ready (status: ${provider.getStatus()})`,
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    const oldProvider = this.currentProvider;
    this.currentProvider = providerId;

    if (oldProvider && oldProvider !== providerId) {
      this.emit('provider-switched', oldProvider, providerId, 'manual');
    }
  }

  /**
   * Get the current active provider
   */
  getCurrentProvider(): IProvider | null {
    if (!this.currentProvider) return null;
    return this.registry.getProvider(this.currentProvider);
  }

  /**
   * Get current provider ID
   */
  getCurrentProviderId(): string | null {
    return this.currentProvider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): ProviderInfo[] {
    return this.registry.getSupportedProviders();
  }

  /**
   * Get all active providers
   */
  getActiveProviders(): Map<string, IProvider> {
    return this.registry.getActiveProviders();
  }

  /**
   * Check if a provider is ready for use
   */
  isProviderReady(providerId: string): boolean {
    return this.registry.isProviderReady(providerId);
  }

  // =====================
  // Generation Methods
  // =====================

  /**
   * Generate content using the current provider
   */
  async generate(params: GenerationParams): Promise<GenerationChunk> {
    const provider = this.getCurrentProvider();
    if (!provider) {
      throw createProviderError(
        'unknown',
        'No provider is currently active',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    return this.executeWithProvider(provider, async () => {
      return await provider.generate(params);
    });
  }

  /**
   * Generate streaming content using the current provider
   */
  async *generateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const provider = this.getCurrentProvider();
    if (!provider) {
      throw createProviderError(
        'unknown',
        'No provider is currently active',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    if (!provider.capabilities.streaming) {
      throw createProviderError(
        provider.info.id,
        'Current provider does not support streaming',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    yield* this.executeStreamWithProvider(provider, async function* () {
      yield* provider.generateStream(params);
    });
  }

  /**
   * Generate with automatic failover
   */
  async generateWithFailover(params: GenerationParams): Promise<GenerationChunk> {
    const providers = this.getFailoverProviders();
    let lastError: ProviderError | null = null;

    for (const providerId of providers) {
      try {
        const provider = this.registry.getProvider(providerId);
        if (!provider || !this.isProviderReady(providerId)) {
          continue;
        }

        const result = await this.executeWithProvider(provider, async () => {
          return await provider.generate(params);
        });

        // Switch to this provider if it's not current
        if (this.currentProvider !== providerId) {
          this.currentProvider = providerId;
          this.emit('provider-switched', this.currentProvider || 'none', providerId, 'failover');
        }

        return result;

      } catch (error) {
        lastError = (error instanceof Error && 'providerId' in error && 'code' in error) 
          ? error as ProviderError
          : createProviderError(providerId, String(error), ERROR_CODES.PROVIDER_API_ERROR);
        
        console.warn(`Provider ${providerId} failed, trying next...`, error);
      }
    }

    throw lastError || createProviderError(
      'unknown',
      'All providers failed',
      ERROR_CODES.PROVIDER_API_ERROR
    );
  }

  // =====================
  // Model Management
  // =====================

  /**
   * Get available models from current provider
   */
  async getAvailableModels(): Promise<Model[]> {
    const provider = this.getCurrentProvider();
    if (!provider) {
      throw createProviderError(
        'unknown',
        'No provider is currently active',
        ERROR_CODES.PROVIDER_NOT_CONFIGURED
      );
    }

    return await provider.getAvailableModels();
  }

  /**
   * Get models from all active providers
   */
  async getAllAvailableModels(): Promise<Record<string, Model[]>> {
    const models: Record<string, Model[]> = {};
    const activeProviders = this.registry.getActiveProviders();

    const modelPromises = Array.from(activeProviders.entries()).map(
      async ([id, provider]) => {
        try {
          if (provider.getStatus() === 'ready') {
            models[id] = await provider.getAvailableModels();
          }
        } catch (error) {
          console.warn(`Failed to get models from provider ${id}:`, error);
          models[id] = [];
        }
      }
    );

    await Promise.allSettled(modelPromises);
    return models;
  }

  // =====================
  // Utility Methods
  // =====================

  /**
   * Count tokens using current provider
   */
  async countTokens(text: string, model?: string): Promise<number> {
    const provider = this.getCurrentProvider();
    if (!provider) {
      // Fallback to simple estimation
      return Math.ceil(text.length / 4);
    }

    try {
      return await provider.countTokens(text, model);
    } catch (error) {
      // Fallback to simple estimation
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Estimate cost using current provider
   */
  estimateCost(usage: TokenUsage, model: string): CostEstimate {
    const provider = this.getCurrentProvider();
    if (!provider) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    return provider.estimateCost(usage, model);
  }

  // =====================
  // Health and Monitoring
  // =====================

  /**
   * Check health of all providers
   */
  async checkProviderHealth(): Promise<Record<string, any>> {
    const results = await this.registry.checkAllProviderHealth();
    this.emit('health-check-completed', results);
    return results;
  }

  /**
   * Get provider statistics
   */
  getProviderStatistics(): Record<string, ProviderUsageStats> {
    const stats: Record<string, ProviderUsageStats> = {};
    for (const [id, stat] of this.usageStats) {
      stats[id] = { ...stat };
    }
    return stats;
  }

  /**
   * Get usage statistics for a specific provider
   */
  getProviderUsage(providerId: string): ProviderUsageStats | null {
    return this.usageStats.get(providerId) || null;
  }

  // =====================
  // Lifecycle Management
  // =====================

  /**
   * Dispose of the manager and all providers
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Clear data
    this.usageStats.clear();
    this.activeRequests.clear();
    this.currentProvider = null;

    // Remove all listeners
    this.removeAllListeners();

    console.log('Provider manager disposed');
  }

  // =====================
  // Private Methods
  // =====================

  private setupEventHandlers(): void {
    this.registry.on('provider-error', (providerId, error) => {
      this.updateErrorStats(providerId);
      
      // Auto-failover if enabled and this is the current provider
      if (this.config.enableAutoFailover && providerId === this.currentProvider) {
        this.handleProviderFailure(providerId, error);
      }
    });

    this.registry.on('status-changed', (providerId, status) => {
      // Handle provider status changes
      if (status === 'error' && providerId === this.currentProvider && this.config.enableAutoFailover) {
        this.handleProviderFailure(providerId, null);
      }
    });
  }

  private async handleProviderFailure(providerId: string, error: ProviderError | null): Promise<void> {
    const fallbackProviders = this.getFailoverProviders().filter(id => id !== providerId);
    
    for (const fallbackId of fallbackProviders) {
      if (this.isProviderReady(fallbackId)) {
        this.currentProvider = fallbackId;
        this.emit('provider-switched', providerId, fallbackId, 'automatic-failover');
        console.log(`Auto-failed over from ${providerId} to ${fallbackId}`);
        return;
      }
    }

    console.warn(`No healthy fallback provider available for ${providerId}`);
  }

  private getFailoverProviders(): string[] {
    const providers = [this.currentProvider, ...(this.config.fallbackProviders || [])].filter(Boolean) as string[];
    return [...new Set(providers)]; // Remove duplicates
  }

  private async executeWithProvider<T>(
    provider: IProvider, 
    operation: () => Promise<T>
  ): Promise<T> {
    const providerId = provider.info.id;
    const startTime = Date.now();

    // Check concurrent request limit
    const current = this.activeRequests.get(providerId) || 0;
    if (current >= this.config.maxConcurrentRequests!) {
      throw createProviderError(
        providerId,
        'Maximum concurrent requests exceeded',
        ERROR_CODES.RATE_LIMIT_EXCEEDED
      );
    }

    this.activeRequests.set(providerId, current + 1);

    try {
      const result = await operation();
      
      // Update usage stats
      this.updateUsageStats(providerId, Date.now() - startTime, true);
      
      return result;

    } catch (error) {
      this.updateUsageStats(providerId, Date.now() - startTime, false);
      throw error;

    } finally {
      const newCount = this.activeRequests.get(providerId)! - 1;
      if (newCount <= 0) {
        this.activeRequests.delete(providerId);
      } else {
        this.activeRequests.set(providerId, newCount);
      }
    }
  }

  private async *executeStreamWithProvider<T>(
    provider: IProvider,
    operation: () => AsyncGenerator<T>
  ): AsyncGenerator<T> {
    const providerId = provider.info.id;
    const startTime = Date.now();

    try {
      yield* operation();
      this.updateUsageStats(providerId, Date.now() - startTime, true);

    } catch (error) {
      this.updateUsageStats(providerId, Date.now() - startTime, false);
      throw error;
    }
  }

  private updateUsageStats(providerId: string, latency: number, success: boolean): void {
    const stats = this.usageStats.get(providerId);
    if (!stats) return;

    stats.requestCount++;
    stats.lastUsed = new Date();
    
    // Update average latency
    stats.averageLatency = (stats.averageLatency * (stats.requestCount - 1) + latency) / stats.requestCount;
    
    // Update error rate
    if (!success) {
      const errorCount = Math.floor(stats.errorRate * (stats.requestCount - 1)) + 1;
      stats.errorRate = errorCount / stats.requestCount;
    } else {
      const errorCount = Math.floor(stats.errorRate * (stats.requestCount - 1));
      stats.errorRate = errorCount / stats.requestCount;
    }

    this.emit('usage-updated', providerId, stats);
  }

  private updateErrorStats(providerId: string): void {
    // Error stats are updated in updateUsageStats
  }

  private startHealthMonitoring(): void {
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.checkProviderHealth().catch(console.error);
      }, this.config.healthCheckInterval);
    }
  }

  // =====================
  // Event Handling
  // =====================

  emit<K extends keyof ManagerEvents>(event: K, ...args: Parameters<ManagerEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ManagerEvents>(event: K, listener: ManagerEvents[K]): this {
    return super.on(event, listener);
  }

  off<K extends keyof ManagerEvents>(event: K, listener: ManagerEvents[K]): this {
    return super.off(event, listener);
  }

  once<K extends keyof ManagerEvents>(event: K, listener: ManagerEvents[K]): this {
    return super.once(event, listener);
  }
}