/**
 * OpenAICompatibleProvider - generic provider for any OpenAI-compatible API
 * (OpenRouter, Together, Z.ai, Groq-compatible gateways, local servers, …).
 *
 * Reuses the OpenAI chat/completions wire format from OpenAIProvider but
 * requires a custom base URL and fetches its model list live from `/models`,
 * since the catalog differs per gateway.
 */

import { OpenAIProvider } from './OpenAIProvider';
import type {
  ProviderInfo,
  ProviderConfig,
  Model,
  ConfigValidationResult,
} from '../../../shared/types';

interface OpenAIModelsResponse {
  data?: Array<{ id: string; context_length?: number }>;
}

export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly info: ProviderInfo = {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
    description: 'Any OpenAI-compatible API — OpenRouter, Together, Z.ai, local servers, and more',
    supportsStreaming: true,
    supportsLocalModels: false,
    requiresApiKey: true,
  };

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.apiKey || !config.apiKey.trim()) {
      errors.push('API key is required');
    }
    if (!config.endpoint || !config.endpoint.trim()) {
      errors.push('Endpoint (base URL) is required, e.g. https://openrouter.ai/api/v1');
    } else {
      try {
        new URL(config.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async getAvailableModels(): Promise<Model[]> {
    try {
      const res = await this.makeRequest<OpenAIModelsResponse>('/models', { method: 'GET' });
      const models = (res.data ?? []).map((m) => ({
        id: m.id,
        name: m.id,
        description: '',
        contextLength: m.context_length ?? 0,
        inputPricing: 0,
        outputPricing: 0,
        currency: 'USD',
      }));
      // Sort for a stable, browsable dropdown.
      return models.sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      console.warn('Failed to fetch models from OpenAI-compatible endpoint:', error);
      return [];
    }
  }
}
