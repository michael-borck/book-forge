/**
 * Shared plumbing for image providers: config validation, timeouts, bounded
 * downloads, and a simple cost estimate.
 */

import type {
  CostEstimate,
  ImageGenOptions,
  ImageProvider,
  ImageProviderConfig,
  ImageProviderInfo,
} from '../../../../shared/types';

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export abstract class BaseImageProvider implements ImageProvider {
  abstract readonly info: ImageProviderInfo;

  protected config: ImageProviderConfig = {};
  protected model = '';

  async initialize(config: ImageProviderConfig): Promise<void> {
    const result = this.validateConfig(config);
    if (!result.isValid) throw new Error(result.errors.join('; '));
    this.config = { ...config };
    this.model = config.model?.trim() || this.info.defaultModel;
  }

  validateConfig(config: ImageProviderConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.info.requiresApiKey && !config.apiKey?.trim()) {
      errors.push('An API key is required');
    }
    if (this.info.requiresBaseUrl && !config.baseUrl?.trim()) {
      errors.push('A base URL is required');
    }
    return { isValid: errors.length === 0, errors };
  }

  abstract generate(prompt: string, options?: ImageGenOptions): Promise<Buffer>;

  getModelId(): string {
    return this.model || this.info.defaultModel;
  }

  estimateCost(_images: number, _size: string): CostEstimate {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      breakdown: { promptTokens: 0, completionTokens: 0, inputRate: 0, outputRate: 0 },
    };
  }

  async dispose(): Promise<void> {
    this.config = {};
  }

  protected normalizedBaseUrl(fallback = ''): string {
    return (this.config.baseUrl?.trim() || fallback).replace(/\/+$/, '');
  }

  protected async postJson(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    options?: ImageGenOptions
  ): Promise<unknown> {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      },
      this.timeoutMs(),
      options?.signal
    );
    if (!response.ok) {
      throw new Error(`Image API error (${response.status}): ${await safeText(response)}`);
    }
    return response.json();
  }

  protected async downloadImage(
    url: string,
    headers: Record<string, string> = {},
    options?: ImageGenOptions
  ): Promise<Buffer> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Image provider returned a non-absolute URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Refusing to download an image over ${parsed.protocol}`);
    }

    const response = await fetchWithTimeout(
      url,
      { method: 'GET', headers },
      60_000,
      options?.signal
    );
    if (!response.ok) throw new Error(`Could not download image (${response.status})`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_DOWNLOAD_BYTES) throw new Error('Downloaded image is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Downloaded image is too large');
    return buffer;
  }

  protected timeoutMs(): number {
    return this.config.timeout ?? DEFAULT_TIMEOUT_MS;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(`Image request timed out after ${timeoutMs / 1000}s`);
    if (externalSignal?.aborted) throw abortError();
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

function abortError(): Error {
  const error = new Error('Image generation cancelled');
  error.name = 'AbortError';
  return error;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return response.statusText;
  }
}
