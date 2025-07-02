/**
 * Provider system exports for BookForge
 * 
 * This file provides a unified export point for all provider-related classes,
 * making it easy to import provider functionality throughout the application.
 */

// Base classes and core functionality
export { BaseProvider } from './BaseProvider';
export { ProviderRegistry, providerRegistry } from './ProviderRegistry';
export { ProviderManager } from './ProviderManager';

// Re-export types for convenience
export type {
  IProvider,
  ProviderInfo,
  ProviderConfig,
  ProviderCapabilities,
  ProviderStatus,
  ProviderHealth,
  ProviderError,
  Model,
  GenerationParams,
  GenerationChunk,
  TokenUsage,
  CostEstimate,
} from '../../../shared/types';

// Provider-specific exports
export { MockProvider } from './MockProvider';

// Real providers
export { GroqProvider } from './GroqProvider';
export { ClaudeProvider } from './ClaudeProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { GeminiProvider } from './GeminiProvider';
export { OllamaProvider } from './OllamaProvider';

// Note: Utility functions removed to avoid circular imports
// Use direct imports instead:
// import { ProviderManager, providerRegistry } from './providers';

// Provider constants
export const PROVIDER_CONSTANTS = {
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_HEALTH_CHECK_INTERVAL: 30000,
  MAX_CONCURRENT_REQUESTS: 10,
  
  // Common model context lengths
  CONTEXT_LENGTHS: {
    SMALL: 4096,
    MEDIUM: 8192,
    LARGE: 16384,
    XLARGE: 32768,
    XXLARGE: 128000,
  },
  
  // Default pricing (fallback values)
  DEFAULT_PRICING: {
    INPUT_COST_PER_1K: 0.001,
    OUTPUT_COST_PER_1K: 0.002,
    CURRENCY: 'USD',
  },
} as const;