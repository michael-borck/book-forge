import type {
  ImageGenOptions,
  ImageProviderConfig,
  ImageProviderInfo,
} from '../../../../shared/types';
import { BaseImageProvider } from './BaseImageProvider';

interface SwarmSession {
  session_id?: string;
}

interface SwarmGeneration {
  images?: string[];
}

/** SwarmUI speaks its own API (session + GenerateText2Image), not OpenAI. */
export class SwarmUIImageProvider extends BaseImageProvider {
  readonly info: ImageProviderInfo = {
    id: 'swarmui',
    name: 'SwarmUI',
    description: 'Self-hosted stable-diffusion server with its native API',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultModel: '',
    defaultSize: '1024x576',
    sizes: ['1024x576', '1024x1024', '832x1216'],
  };

  validateConfig(config: ImageProviderConfig): { isValid: boolean; errors: string[] } {
    return {
      isValid: Boolean(config.baseUrl?.trim()),
      errors: config.baseUrl?.trim() ? [] : ['A base URL is required'],
    };
  }

  async generate(prompt: string, options: ImageGenOptions = {}): Promise<Buffer> {
    const base = this.normalizedBaseUrl();
    const headers = this.authHeaders();

    const session = (await this.postJson(
      `${base}/API/GetNewSession`,
      {},
      headers,
      options
    )) as SwarmSession;
    const sessionId = session?.session_id;
    if (!sessionId) throw new Error('SwarmUI did not return a session_id');

    const [width, height] = parseSize(options.size || this.config.size) ?? [1024, 576];
    const body: Record<string, unknown> = {
      session_id: sessionId,
      prompt,
      images: 1,
      width,
      height,
    };
    const model = options.model?.trim() || this.model;
    if (model) body.model = model;
    if (this.config.lora?.trim()) {
      const [name, weight] = this.config.lora.trim().split(':');
      body.loras = name;
      body.loraweights = weight || '1.0';
    }

    const generation = (await this.postJson(
      `${base}/API/GenerateText2Image`,
      body,
      headers,
      options
    )) as SwarmGeneration;
    const image = generation?.images?.[0];
    if (typeof image !== 'string') throw new Error('SwarmUI returned no image');

    let origin: string | undefined;
    try {
      origin = new URL(base).origin;
    } catch {
      origin = undefined;
    }
    const imageUrl = `${base}/${image.replace(/^\/+/, '')}`;
    const sendAuth = origin && new URL(imageUrl).origin === origin ? headers : {};
    return this.downloadImage(imageUrl, sendAuth, options);
  }

  private authHeaders(): Record<string, string> {
    const token = this.config.bearerToken?.trim() || this.config.apiKey?.trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

function parseSize(size?: string): [number, number] | null {
  if (!size) return null;
  const match = size.trim().match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? [width, height] : null;
}
