import type {
  CostEstimate,
  ImageGenOptions,
  ImageProviderConfig,
  ImageProviderInfo,
} from '../../../../shared/types';
import { BaseImageProvider } from './BaseImageProvider';

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class OpenAIImageProvider extends BaseImageProvider {
  readonly info: ImageProviderInfo = {
    id: 'openai',
    name: 'OpenAI Images',
    description: 'GPT Image and DALL·E models from OpenAI',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultModel: 'gpt-image-1',
    defaultSize: '1024x1024',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
  };

  protected defaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  validateConfig(config: ImageProviderConfig): { isValid: boolean; errors: string[] } {
    const base = super.validateConfig(config);
    return base;
  }

  async generate(prompt: string, options: ImageGenOptions = {}): Promise<Buffer> {
    const model = options.model?.trim() || this.model || this.info.defaultModel;
    const body: Record<string, unknown> = {
      model,
      prompt,
      n: 1,
      size: options.size || this.config.size || this.info.defaultSize,
    };
    // gpt-image models return b64_json and reject response_format.
    if (model.startsWith('dall-e')) body.response_format = 'b64_json';

    const data = (await this.postJson(
      `${this.normalizedBaseUrl(this.defaultBaseUrl())}/images/generations`,
      body,
      this.authHeaders(),
      options
    )) as OpenAIImageResponse;

    const item = data?.data?.[0];
    if (!item) throw new Error('Image API returned no image data');
    if (typeof item.b64_json === 'string' && item.b64_json) {
      return Buffer.from(item.b64_json, 'base64');
    }
    if (typeof item.url === 'string' && item.url) {
      return this.downloadImage(item.url, {}, options);
    }
    throw new Error('Image API returned neither b64_json nor a URL');
  }

  estimateCost(images: number, _size: string): CostEstimate {
    const perImage = 0.04;
    return {
      inputCost: 0,
      outputCost: images * perImage,
      totalCost: images * perImage,
      currency: 'USD',
      breakdown: { promptTokens: 0, completionTokens: 0, inputRate: 0, outputRate: perImage },
    };
  }

  protected authHeaders(): Record<string, string> {
    const token = this.config.bearerToken?.trim() || this.config.apiKey?.trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
