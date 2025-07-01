/**
 * ProviderRegistry - Manages all AI providers in BookForge
 * 
 * This class handles:
 * - Provider registration and discovery
 * - Provider lifecycle management
 * - Provider factory pattern implementation
 * - Global provider events and monitoring
 */

import { EventEmitter } from 'events';
import type {
  IProvider,
  ProviderFactory,
  ProviderInfo,
  ProviderConfig,
  ProviderStatus,
  ProviderError,
} from '../../../shared/types';

import {
  ERROR_CODES,
  createProviderError,
} from '../../../shared/types';

// Provider constructor type
export type ProviderConstructor = new () => IProvider;

// Registry events
interface RegistryEvents {
  'provider-registered': (providerId: string) => void;
  'provider-created': (providerId: string, provider: IProvider) => void;
  'provider-disposed': (providerId: string) => void;
  'provider-error': (providerId: string, error: ProviderError) => void;
  'status-changed': (providerId: string, status: ProviderStatus) => void;
}

export class ProviderRegistry extends EventEmitter implements ProviderFactory {
  private readonly registeredProviders = new Map<string, ProviderConstructor>();
  private readonly activeProviders = new Map<string, IProvider>();
  private readonly providerConfigs = new Map<string, ProviderConfig>();
  private isDisposed = false;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // =====================
  // Provider Registration
  // =====================

  /**
   * Register a provider class with the registry
   */
  registerProvider(ProviderClass: ProviderConstructor): void {
    if (this.isDisposed) {
      throw new Error('Registry has been disposed');
    }

    // Create a temporary instance to get provider info
    const tempInstance = new ProviderClass();
    const providerId = tempInstance.info.id;

    // Validate provider
    this.validateProvider(tempInstance);

    // Store the constructor
    this.registeredProviders.set(providerId, ProviderClass);

    // Clean up temporary instance
    tempInstance.dispose().catch(console.error);

    this.emit('provider-registered', providerId);
    console.log(`Provider registered: ${providerId}`);
  }

  /**
   * Get all supported provider information
   */
  getSupportedProviders(): ProviderInfo[] {
    return Array.from(this.registeredProviders.entries()).map(([id, ProviderClass]) => {
      const tempInstance = new ProviderClass();
      const info = tempInstance.info;
      tempInstance.dispose().catch(console.error);
      return info;
    });
  }

  /**
   * Check if a provider is registered
   */
  isProviderRegistered(providerId: string): boolean {
    return this.registeredProviders.has(providerId);
  }

  /**
   * Get provider information by ID
   */
  getProviderInfo(providerId: string): ProviderInfo | null {
    const ProviderClass = this.registeredProviders.get(providerId);
    if (!ProviderClass) return null;

    const tempInstance = new ProviderClass();
    const info = tempInstance.info;
    tempInstance.dispose().catch(console.error);
    return info;
  }

  // =====================
  // Provider Factory
  // =====================

  /**
   * Create and configure a provider instance
   */
  async createProvider(providerId: string, config?: ProviderConfig): Promise<IProvider> {
    if (this.isDisposed) {
      throw new Error('Registry has been disposed');
    }

    const ProviderClass = this.registeredProviders.get(providerId);
    if (!ProviderClass) {
      throw createProviderError(
        providerId,
        `Provider '${providerId}' is not registered`,
        ERROR_CODES.PROVIDER_NOT_FOUND,
        { userMessage: `The provider '${providerId}' is not available. Please check your installation.` }
      );
    }

    try {
      // Create new provider instance
      const provider = new ProviderClass();

      // Set up event forwarding
      this.setupProviderEventHandlers(provider);

      // Initialize with config if provided
      if (config) {
        await provider.initialize(config);
        this.providerConfigs.set(providerId, config);
      }

      // Store active provider
      this.activeProviders.set(providerId, provider);

      this.emit('provider-created', providerId, provider);
      return provider;

    } catch (error) {
      const providerError = error instanceof Error 
        ? createProviderError(providerId, error.message, ERROR_CODES.PROVIDER_API_ERROR, { cause: error })
        : createProviderError(providerId, String(error), ERROR_CODES.PROVIDER_API_ERROR);

      this.emit('provider-error', providerId, providerError);
      throw providerError;
    }
  }

  /**
   * Get an existing active provider
   */
  getProvider(providerId: string): IProvider | null {
    return this.activeProviders.get(providerId) || null;
  }

  /**
   * Get all active providers
   */
  getActiveProviders(): Map<string, IProvider> {
    return new Map(this.activeProviders);
  }

  /**
   * Check if a provider is active and ready
   */
  isProviderReady(providerId: string): boolean {
    const provider = this.activeProviders.get(providerId);
    return provider?.getStatus() === 'ready';
  }

  /**
   * Dispose of a specific provider
   */
  async disposeProvider(providerId: string): Promise<void> {
    const provider = this.activeProviders.get(providerId);
    if (provider) {
      try {
        await provider.dispose();
        this.activeProviders.delete(providerId);
        this.providerConfigs.delete(providerId);
        this.emit('provider-disposed', providerId);
      } catch (error) {
        console.error(`Error disposing provider ${providerId}:`, error);
      }
    }
  }

  // =====================
  // Provider Management
  // =====================

  /**
   * Get status of all active providers
   */
  getProviderStatuses(): Record<string, ProviderStatus> {
    const statuses: Record<string, ProviderStatus> = {};
    
    for (const [id, provider] of this.activeProviders) {
      statuses[id] = provider.getStatus();
    }
    
    return statuses;
  }

  /**
   * Health check all active providers
   */
  async checkAllProviderHealth(): Promise<Record<string, any>> {
    const healthResults: Record<string, any> = {};
    
    const healthChecks = Array.from(this.activeProviders.entries()).map(
      async ([id, provider]) => {
        try {
          const health = await provider.checkHealth();
          healthResults[id] = health;
        } catch (error) {
          healthResults[id] = {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            lastChecked: new Date(),
          };
        }
      }
    );

    await Promise.allSettled(healthChecks);
    return healthResults;
  }

  /**
   * Reconfigure a provider
   */
  async reconfigureProvider(providerId: string, config: ProviderConfig): Promise<void> {
    const provider = this.activeProviders.get(providerId);
    if (!provider) {
      throw createProviderError(
        providerId,
        'Provider is not active',
        ERROR_CODES.PROVIDER_NOT_FOUND
      );
    }

    await provider.configure(config);
    this.providerConfigs.set(providerId, config);
  }

  /**
   * Get stored configuration for a provider
   */
  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.providerConfigs.get(providerId) || null;
  }

  // =====================
  // Utility Methods
  // =====================

  /**
   * Find the best available provider for a specific capability
   */
  findBestProvider(requirements: {
    streaming?: boolean;
    localExecution?: boolean;
    functionCalling?: boolean;
    customEndpoints?: boolean;
  }): ProviderInfo | null {
    const supportedProviders = this.getSupportedProviders();
    
    return supportedProviders.find(provider => {
      const ProviderClass = this.registeredProviders.get(provider.id);
      if (!ProviderClass) return false;

      const tempInstance = new ProviderClass();
      const capabilities = tempInstance.capabilities;
      tempInstance.dispose().catch(console.error);

      return (
        (!requirements.streaming || capabilities.streaming) &&
        (!requirements.localExecution || capabilities.localExecution) &&
        (!requirements.functionCalling || capabilities.functionCalling) &&
        (!requirements.customEndpoints || capabilities.customEndpoints)
      );
    }) || null;
  }

  /**
   * Get provider statistics
   */
  getStatistics(): {
    registered: number;
    active: number;
    ready: number;
    error: number;
    byStatus: Record<ProviderStatus, string[]>;
  } {
    const statuses = this.getProviderStatuses();
    const byStatus: Record<ProviderStatus, string[]> = {
      ready: [],
      configuring: [],
      error: [],
      disconnected: [],
      rate_limited: [],
    };

    for (const [id, status] of Object.entries(statuses)) {
      byStatus[status].push(id);
    }

    return {
      registered: this.registeredProviders.size,
      active: this.activeProviders.size,
      ready: byStatus.ready.length,
      error: byStatus.error.length,
      byStatus,
    };
  }

  // =====================
  // Lifecycle Management
  // =====================

  /**
   * Dispose of all providers and clean up
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Dispose all active providers
    const disposePromises = Array.from(this.activeProviders.values()).map(
      provider => provider.dispose().catch(console.error)
    );

    await Promise.allSettled(disposePromises);

    // Clear all maps
    this.activeProviders.clear();
    this.providerConfigs.clear();
    this.registeredProviders.clear();

    // Remove all listeners
    this.removeAllListeners();

    console.log('Provider registry disposed');
  }

  // =====================
  // Private Methods
  // =====================

  private validateProvider(provider: IProvider): void {
    if (!provider.info) {
      throw new Error('Provider must have info property');
    }

    if (!provider.info.id) {
      throw new Error('Provider must have a unique ID');
    }

    if (!provider.info.name) {
      throw new Error('Provider must have a name');
    }

    if (!provider.capabilities) {
      throw new Error('Provider must define capabilities');
    }

    // Check for required methods
    const requiredMethods = [
      'initialize',
      'getAvailableModels',
      'generate',
      'countTokens',
      'estimateCost',
      'checkHealth',
      'dispose',
    ];

    for (const method of requiredMethods) {
      if (typeof (provider as any)[method] !== 'function') {
        throw new Error(`Provider must implement ${method} method`);
      }
    }
  }

  private setupProviderEventHandlers(provider: IProvider): void {
    const providerId = provider.info.id;

    provider.on('status-changed', (status) => {
      this.emit('status-changed', providerId, status);
    });

    provider.on('error', (error) => {
      this.emit('provider-error', providerId, error);
    });

    provider.on('config-updated', () => {
      // Could emit registry-level event if needed
    });
  }

  // =====================
  // Event Handling
  // =====================

  emit<K extends keyof RegistryEvents>(event: K, ...args: Parameters<RegistryEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof RegistryEvents>(event: K, listener: RegistryEvents[K]): this {
    return super.on(event, listener);
  }

  off<K extends keyof RegistryEvents>(event: K, listener: RegistryEvents[K]): this {
    return super.off(event, listener);
  }

  once<K extends keyof RegistryEvents>(event: K, listener: RegistryEvents[K]): this {
    return super.once(event, listener);
  }
}

// Global provider registry instance
export const providerRegistry = new ProviderRegistry();