import sharp from 'sharp';
import type { ImageGenOptions, ImageProviderInfo } from '../../../../shared/types';
import { BaseImageProvider } from './BaseImageProvider';

/** Deterministic offline provider used by tests and demos. */
export class MockImageProvider extends BaseImageProvider {
  readonly info: ImageProviderInfo = {
    id: 'mock',
    name: 'Mock images',
    description: 'Deterministic placeholder images for testing and offline demos',
    requiresApiKey: false,
    requiresBaseUrl: false,
    defaultModel: 'mock-image',
    defaultSize: '640x400',
    sizes: ['640x400', '512x512'],
  };

  async generate(prompt: string, options: ImageGenOptions = {}): Promise<Buffer> {
    const [width, height] = (options.size || this.info.defaultSize)
      .split('x')
      .map((part) => Number(part));
    const hash = [...prompt].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 360, 0);

    return sharp({
      create: {
        width: width || 640,
        height: height || 400,
        channels: 3,
        background: { r: 80 + (hash % 140), g: 90, b: 160 - (hash % 100) },
      },
    })
      .png()
      .toBuffer();
  }
}
