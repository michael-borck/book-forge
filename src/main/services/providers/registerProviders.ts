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
import { OllamaProvider } from './OllamaProvider';

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

    providerRegistry.registerProvider(OllamaProvider);
    console.log('✓ Ollama provider registered');

    // All major providers now implemented!

    const registeredCount = providerRegistry.getSupportedProviders().length;
    console.log(`Provider registration complete. ${registeredCount} providers available.`);

  } catch (error) {
    console.error('Error registering providers:', error);
    throw error;
  }
}