/**
 * ImageProviderRegistry - holds configured image provider instances and the
 * current selection. Persistence lives in the secure config store; the handler
 * restores configs on startup.
 */

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageProviderId,
  ImageProviderInfo,
} from '../../../shared/types';
import { GeminiImageProvider } from './providers/GeminiImageProvider';
import { MockImageProvider } from './providers/MockImageProvider';
import { OpenAICompatibleImageProvider } from './providers/OpenAICompatibleImageProvider';
import { OpenAIImageProvider } from './providers/OpenAIImageProvider';
import { SwarmUIImageProvider } from './providers/SwarmUIImageProvider';

const PROVIDER_IDS: ImageProviderId[] = [
  'openai',
  'gemini',
  'openai-compatible',
  'swarmui',
  'mock',
];

function createProvider(id: ImageProviderId): ImageProvider {
  switch (id) {
    case 'openai':
      return new OpenAIImageProvider();
    case 'gemini':
      return new GeminiImageProvider();
    case 'openai-compatible':
      return new OpenAICompatibleImageProvider();
    case 'swarmui':
      return new SwarmUIImageProvider();
    case 'mock':
      return new MockImageProvider();
  }
}

export class ImageProviderRegistry {
  private readonly instances = new Map<string, ImageProvider>();
  private currentId: string | null = null;

  listInfo(): ImageProviderInfo[] {
    return PROVIDER_IDS.map((id) => createProvider(id).info);
  }

  async initialize(id: string, config: ImageProviderConfig): Promise<ImageProvider> {
    if (!PROVIDER_IDS.includes(id as ImageProviderId)) {
      throw new Error(`Unknown image provider: ${id}`);
    }
    const provider = createProvider(id as ImageProviderId);
    await provider.initialize(config);
    this.instances.set(id, provider);
    if (!this.currentId) this.currentId = id;
    return provider;
  }

  get(id: string): ImageProvider | null {
    return this.instances.get(id) ?? null;
  }

  getCurrent(): ImageProvider | null {
    return this.currentId ? (this.instances.get(this.currentId) ?? null) : null;
  }

  getCurrentId(): string | null {
    return this.currentId;
  }

  setCurrent(id: string): void {
    if (!this.instances.has(id)) throw new Error(`Image provider is not configured: ${id}`);
    this.currentId = id;
  }

  isConfigured(): boolean {
    return this.getCurrent() !== null;
  }

  async remove(id: string): Promise<void> {
    const provider = this.instances.get(id);
    if (provider) await provider.dispose();
    this.instances.delete(id);
    if (this.currentId === id) {
      this.currentId = this.instances.keys().next().value ?? null;
    }
  }

  async disposeAll(): Promise<void> {
    for (const provider of this.instances.values()) await provider.dispose();
    this.instances.clear();
    this.currentId = null;
  }
}

export const imageProviderRegistry = new ImageProviderRegistry();
