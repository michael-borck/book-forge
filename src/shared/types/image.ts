/**
 * Image generation provider types. Kept separate from text providers because
 * image APIs, configs, and pricing are different enough to warrant their own
 * registry.
 */

import type { CostEstimate } from './provider';

export type ImageProviderId =
  | 'openai'
  | 'gemini'
  | 'openai-compatible'
  | 'swarmui'
  | 'mock';

export interface ImageProviderInfo {
  id: ImageProviderId;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  defaultModel: string;
  defaultSize: string;
  sizes: string[];
}

export interface ImageProviderConfig {
  apiKey?: string;
  bearerToken?: string;
  baseUrl?: string;
  model?: string;
  size?: string;
  timeout?: number;
  lora?: string;
}

export type RedactedImageProviderConfig = Omit<
  ImageProviderConfig,
  'apiKey' | 'bearerToken'
> & {
  hasApiKey: boolean;
  hasBearerToken: boolean;
};

export interface ImageGenOptions {
  model?: string;
  size?: string;
  signal?: AbortSignal;
}

export interface ImageProvider {
  readonly info: ImageProviderInfo;
  initialize(config: ImageProviderConfig): Promise<void>;
  validateConfig(config: ImageProviderConfig): { isValid: boolean; errors: string[] };
  generate(prompt: string, options?: ImageGenOptions): Promise<Buffer>;
  /** The model the provider will use, for display and bookkeeping. */
  getModelId(): string;
  estimateCost(images: number, size: string): CostEstimate;
  dispose(): Promise<void>;
}
