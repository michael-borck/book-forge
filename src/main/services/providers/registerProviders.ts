/**
 * Provider Registration - Registers all available providers with the registry
 * 
 * This file should be imported early in the application lifecycle to ensure
 * all providers are available when needed.
 */

import { providerRegistry } from './ProviderRegistry';
import { MockProvider } from './MockProvider';
import { GroqProvider } from './GroqProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';

/**
 * Register all available providers
 */
export function registerAllProviders(): void {
  console.log('Registering AI providers...');
  
  try {
    // Register mock provider for testing
    providerRegistry.registerProvider(MockProvider);
    console.log('✓ Mock provider registered');

    // Register real providers
    providerRegistry.registerProvider(GroqProvider);
    console.log('✓ Groq provider registered');

    providerRegistry.registerProvider(ClaudeProvider);
    console.log('✓ Claude provider registered');

    providerRegistry.registerProvider(OpenAIProvider);
    console.log('✓ OpenAI provider registered');

    providerRegistry.registerProvider(GeminiProvider);
    console.log('✓ Gemini provider registered');

    // TODO: Uncomment as other providers are implemented
    
    // providerRegistry.registerProvider(OllamaProvider);
    // console.log('✓ Ollama provider registered');

    const registeredCount = providerRegistry.getSupportedProviders().length;
    console.log(`Provider registration complete. ${registeredCount} providers available.`);
    
  } catch (error) {
    console.error('Error registering providers:', error);
    throw error;
  }
}

/**
 * Get initialization status
 */
export function getRegistrationStatus(): {
  isInitialized: boolean;
  providerCount: number;
  supportedProviders: string[];
} {
  const providers = providerRegistry.getSupportedProviders();
  
  return {
    isInitialized: providers.length > 0,
    providerCount: providers.length,
    supportedProviders: providers.map(p => p.id),
  };
}

/**
 * Initialize with mock provider for development
 */
export async function initializeWithMockProvider(): Promise<void> {
  registerAllProviders();
  
  // Create and initialize mock provider for immediate testing
  const mockProvider = await providerRegistry.createProvider('mock', {
    timeout: 5000,
    maxRetries: 2,
  });
  
  console.log('Mock provider initialized and ready for testing');
}