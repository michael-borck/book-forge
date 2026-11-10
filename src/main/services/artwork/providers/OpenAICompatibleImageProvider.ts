import type { ImageProviderConfig, ImageProviderInfo } from '../../../../shared/types';
import { OpenAIImageProvider } from './OpenAIImageProvider';

/**
 * Any endpoint that speaks OpenAI's /images/generations shape: LocalAI,
 * OpenRouter, LiteLLM, vLLM, Together, and similar gateways.
 */
export class OpenAICompatibleImageProvider extends OpenAIImageProvider {
  readonly info: ImageProviderInfo = {
    id: 'openai-compatible',
    name: 'OpenAI-compatible images',
    description: 'Any endpoint exposing /images/generations (LocalAI, LiteLLM, …)',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultModel: '',
    defaultSize: '512x512',
    sizes: ['512x512', '768x768', '1024x1024'],
  };

  protected defaultBaseUrl(): string {
    return '';
  }

  validateConfig(config: ImageProviderConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl?.trim()) errors.push('A base URL is required');
    if (!config.model?.trim()) errors.push('A model id is required');
    return { isValid: errors.length === 0, errors };
  }
}
