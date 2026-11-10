import type {
  CostEstimate,
  ImageGenOptions,
  ImageProviderInfo,
} from '../../../../shared/types';
import { BaseImageProvider } from './BaseImageProvider';

interface ImagenResponse {
  predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
}

export class GeminiImageProvider extends BaseImageProvider {
  readonly info: ImageProviderInfo = {
    id: 'gemini',
    name: 'Google Imagen',
    description: 'Imagen models from Google Generative AI',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultModel: 'imagen-4.0-fast-generate-001',
    defaultSize: '4:3',
    sizes: ['1:1', '4:3', '16:9', '9:16'],
  };

  async generate(prompt: string, options: ImageGenOptions = {}): Promise<Buffer> {
    const model = options.model?.trim() || this.model || this.info.defaultModel;
    const base = this.normalizedBaseUrl('https://generativelanguage.googleapis.com');
    const data = (await this.postJson(
      `${base}/v1beta/models/${encodeURIComponent(model)}:predict`,
      {
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: options.size || this.config.size || this.info.defaultSize,
        },
      },
      { 'x-goog-api-key': this.config.apiKey ?? '' },
      options
    )) as ImagenResponse;

    const prediction = data?.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) throw new Error('Imagen returned no image');
    return Buffer.from(prediction.bytesBase64Encoded, 'base64');
  }

  estimateCost(images: number, _size: string): CostEstimate {
    const perImage = 0.02;
    return {
      inputCost: 0,
      outputCost: images * perImage,
      totalCost: images * perImage,
      currency: 'USD',
      breakdown: { promptTokens: 0, completionTokens: 0, inputRate: 0, outputRate: perImage },
    };
  }
}
