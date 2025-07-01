/**
 * GeminiProvider - Google's Gemini AI provider implementation for BookForge
 * 
 * This provider integrates with Google's Gemini API, supporting Gemini Pro,
 * Gemini Pro Vision, and other Gemini models for high-quality text generation.
 */

import { BaseProvider } from './BaseProvider';
import type {
  ProviderInfo,
  ProviderConfig,
  ProviderCapabilities,
  Model,
  GenerationParams,
  GenerationChunk,
  TokenUsage,
  CostEstimate,
  ConfigValidationResult,
} from '../../../shared/types';

import {
  ERROR_CODES,
  createProviderError,
} from '../../../shared/types';

import type { ErrorCode } from '../../../shared/types';

// Gemini-specific configuration
interface GeminiConfig extends ProviderConfig {
  apiKey: string;
  endpoint?: string; // Allow custom endpoint override
  version?: string; // API version
}

// Gemini API types
interface GeminiContent {
  parts: Array<{
    text: string;
  }>;
  role?: 'user' | 'model';
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: 'model';
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiStreamResponse {
  candidates?: Array<{
    content?: {
      parts: Array<{
        text: string;
      }>;
      role: 'model';
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google\'s most capable AI model with multimodal capabilities',
    website: 'https://ai.google.dev',
    supportsStreaming: true,
    supportsLocalModels: false,
    requiresApiKey: true,
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true, // Gemini supports function calling
    imageInput: true, // Gemini Pro Vision supports image input
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: false,
    customEndpoints: true,
  };

  private baseUrl = 'https://generativelanguage.googleapis.com';
  private apiKey: string = '';
  private version = 'v1beta'; // Default API version

  // Gemini model catalog with pricing (as of 2024)
  private readonly geminiModels: Model[] = [
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Most capable multimodal model with long context window',
      contextLength: 2000000, // 2M tokens context
      inputPricing: 1.25, // per 1M tokens
      outputPricing: 5.00, // per 1M tokens
      currency: 'USD',
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      description: 'Fast and versatile multimodal model',
      contextLength: 1000000, // 1M tokens context
      inputPricing: 0.075, // per 1M tokens
      outputPricing: 0.30, // per 1M tokens
      currency: 'USD',
    },
    {
      id: 'gemini-1.0-pro',
      name: 'Gemini 1.0 Pro',
      description: 'Previous generation multimodal model',
      contextLength: 32768,
      inputPricing: 0.50,
      outputPricing: 1.50,
      currency: 'USD',
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const geminiConfig = config as GeminiConfig;
    
    this.apiKey = geminiConfig.apiKey;
    
    if (geminiConfig.endpoint) {
      this.baseUrl = geminiConfig.endpoint.replace(/\/$/, ''); // Remove trailing slash
    }

    if (geminiConfig.version) {
      this.version = geminiConfig.version;
    }

    // Test the connection
    await this.testConnection();
    console.log('Gemini provider initialized successfully');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const geminiConfig = config as GeminiConfig;

    // Validate API key
    if (!geminiConfig.apiKey || geminiConfig.apiKey.trim().length === 0) {
      errors.push('Google Gemini API key is required');
    } else if (!geminiConfig.apiKey.startsWith('AIza')) {
      warnings.push('Google API key should start with "AIza"');
    }

    // Validate endpoint if provided
    if (geminiConfig.endpoint) {
      try {
        new URL(geminiConfig.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }

    // Validate API version if provided
    if (geminiConfig.version && !['v1', 'v1beta'].includes(geminiConfig.version)) {
      warnings.push('API version should be "v1" or "v1beta"');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getAvailableModels(): Promise<Model[]> {
    try {
      // For now, return static model list
      // Google AI Studio doesn't provide a public models endpoint
      return [...this.geminiModels];
    } catch (error) {
      console.warn('Failed to fetch Gemini models, using static list:', error);
      return [...this.geminiModels];
    }
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    const request: GeminiGenerateRequest = {
      contents: this.convertMessages(params.messages),
      generationConfig: {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxOutputTokens: params.maxTokens,
        stopSequences: params.stop,
      },
    };

    const response = await this.makeRequest<GeminiGenerateResponse>(
      `/v1beta/models/${params.model}:generateContent`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw createProviderError(
        this.info.id,
        'No response candidates returned from Gemini',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    const content = candidate.content?.parts?.[0]?.text || '';
    
    return this.createGenerationChunk(content, {
      model: params.model,
      finishReason: this.mapFinishReason(candidate.finishReason),
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      } : undefined,
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const request: GeminiGenerateRequest = {
      contents: this.convertMessages(params.messages),
      generationConfig: {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxOutputTokens: params.maxTokens,
        stopSequences: params.stop,
      },
    };

    const response = await this.makeStreamRequest(
      `/v1beta/models/${params.model}:streamGenerateContent`,
      {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Accept': 'text/event-stream',
        },
      }
    );

    if (!response.body) {
      throw createProviderError(
        this.info.id,
        'No response body for streaming request',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const streamData: GeminiStreamResponse = JSON.parse(data);
              const candidate = streamData.candidates?.[0];
              
              if (candidate?.content?.parts?.[0]?.text) {
                yield this.createGenerationChunk(candidate.content.parts[0].text, {
                  model: params.model,
                  finishReason: candidate.finishReason ? this.mapFinishReason(candidate.finishReason) : undefined,
                });
              }

              // Track usage metadata
              if (streamData.usageMetadata) {
                totalInputTokens = streamData.usageMetadata.promptTokenCount;
                totalOutputTokens = streamData.usageMetadata.candidatesTokenCount;
              }

              // Check for finish
              if (candidate?.finishReason) {
                // Final chunk with usage information
                yield this.createGenerationChunk('', {
                  model: params.model,
                  finishReason: this.mapFinishReason(candidate.finishReason),
                  usage: {
                    promptTokens: totalInputTokens,
                    completionTokens: totalOutputTokens,
                    totalTokens: totalInputTokens + totalOutputTokens,
                  },
                });
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming chunk:', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  protected async doCountTokens(text: string, model?: string): Promise<number> {
    try {
      // Gemini provides a countTokens endpoint
      const selectedModel = model || 'gemini-1.5-flash';
      const request = {
        contents: [{
          parts: [{ text }]
        }]
      };

      const response = await this.makeRequest<{ totalTokens: number }>(
        `/v1beta/models/${selectedModel}:countTokens`,
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      );

      return response.totalTokens;
    } catch (error) {
      // Fallback to estimation if the API call fails
      console.warn('Failed to count tokens via API, using estimation:', error);
      // Gemini tokenization is similar to other models: roughly 4 characters per token
      return Math.ceil(text.length / 4);
    }
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    const model = this.geminiModels.find(m => m.id === modelId);
    if (!model) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    // Convert from per-1M pricing to actual cost
    const inputCost = (usage.promptTokens / 1000000) * model.inputPricing;
    const outputCost = (usage.completionTokens / 1000000) * model.outputPricing;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: model.currency,
      breakdown: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        inputRate: model.inputPricing,
        outputRate: model.outputPricing,
      },
    };
  }

  protected async doHealthCheck(): Promise<void> {
    try {
      // Simple health check with a minimal request
      const testRequest: GeminiGenerateRequest = {
        contents: [
          {
            parts: [{ text: 'Hi' }],
            role: 'user',
          }
        ],
        generationConfig: {
          maxOutputTokens: 10,
        },
      };

      await this.makeRequest(
        `/v1beta/models/gemini-1.5-flash:generateContent`,
        {
          method: 'POST',
          body: JSON.stringify(testRequest),
        }
      );
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Health check failed: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }
  }

  protected async doDispose(): Promise<void> {
    this.apiKey = '';
    console.log('Gemini provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private convertMessages(messages: GenerationParams['messages']): GeminiContent[] {
    const contents: GeminiContent[] = [];
    
    for (const message of messages) {
      // Handle system messages by converting to user messages with prefixes
      if (message.role === 'system') {
        contents.push({
          parts: [{ text: `System: ${message.content}` }],
          role: 'user',
        });
      } else {
        contents.push({
          parts: [{ text: message.content }],
          role: message.role === 'user' ? 'user' : 'model',
        });
      }
    }

    return contents;
  }

  private mapFinishReason(geminiFinishReason: string): GenerationChunk['finishReason'] {
    switch (geminiFinishReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      case 'OTHER':
      default:
        return 'error';
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with a minimal request
      const testRequest: GeminiGenerateRequest = {
        contents: [
          {
            parts: [{ text: 'Test' }],
            role: 'user',
          }
        ],
        generationConfig: {
          maxOutputTokens: 5,
        },
      };

      await this.makeRequest(
        `/v1beta/models/gemini-1.5-flash:generateContent`,
        {
          method: 'POST',
          body: JSON.stringify(testRequest),
        }
      );
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Failed to connect to Gemini API: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { userMessage: 'Please check your Google Gemini API key and internet connection.' }
      );
    }
  }

  private async makeRequest<T = any>(
    endpoint: string, 
    options: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}?key=${this.apiKey}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Use the raw error text if JSON parsing fails
          errorMessage = errorText || errorMessage;
        }

        throw createProviderError(
          this.info.id,
          errorMessage,
          this.getErrorCode(response.status),
          {
            retryable: this.isRetryableStatus(response.status),
            details: { status: response.status, url, endpoint },
          }
        );
      }

      return await response.json() as T;

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createProviderError(
          this.info.id,
          'Request was aborted',
          ERROR_CODES.NETWORK_TIMEOUT,
          { retryable: true }
        );
      }

      if (error instanceof Error && error.name === 'TypeError' && error.message.includes('fetch')) {
        throw createProviderError(
          this.info.id,
          'Network error: Unable to connect to Gemini API',
          ERROR_CODES.NETWORK_CONNECTION_FAILED,
          { 
            retryable: true,
            userMessage: 'Please check your internet connection and try again.',
          }
        );
      }

      // Re-throw ProviderError instances
      if (error instanceof Error && 'providerId' in error) {
        throw error;
      }

      // Wrap other errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw createProviderError(
        this.info.id,
        `Request failed: ${errorMessage}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { 
          cause: error instanceof Error ? error : undefined,
          retryable: false,
        }
      );
    }
  }

  private async makeStreamRequest(
    endpoint: string,
    options: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
    }
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}?key=${this.apiKey}&alt=sse`;
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Use the raw error text if JSON parsing fails
          errorMessage = errorText || errorMessage;
        }

        throw createProviderError(
          this.info.id,
          errorMessage,
          this.getErrorCode(response.status),
          {
            retryable: this.isRetryableStatus(response.status),
            details: { status: response.status, url, endpoint },
          }
        );
      }

      return response;

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createProviderError(
          this.info.id,
          'Request was aborted',
          ERROR_CODES.NETWORK_TIMEOUT,
          { retryable: true }
        );
      }

      if (error instanceof Error && error.name === 'TypeError' && error.message.includes('fetch')) {
        throw createProviderError(
          this.info.id,
          'Network error: Unable to connect to Gemini API',
          ERROR_CODES.NETWORK_CONNECTION_FAILED,
          { 
            retryable: true,
            userMessage: 'Please check your internet connection and try again.',
          }
        );
      }

      // Re-throw ProviderError instances
      if (error instanceof Error && 'providerId' in error) {
        throw error;
      }

      // Wrap other errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw createProviderError(
        this.info.id,
        `Stream request failed: ${errorMessage}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { 
          cause: error instanceof Error ? error : undefined,
          retryable: false,
        }
      );
    }
  }

  private getErrorCode(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ERROR_CODES.VALIDATION_INVALID_FORMAT;
      case 401:
        return ERROR_CODES.PROVIDER_INVALID_CONFIG;
      case 403:
        return ERROR_CODES.PROVIDER_INVALID_CONFIG;
      case 429:
        return ERROR_CODES.RATE_LIMIT_EXCEEDED;
      case 500:
      case 502:
      case 503:
      case 504:
        return ERROR_CODES.PROVIDER_API_ERROR;
      default:
        return ERROR_CODES.PROVIDER_API_ERROR;
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429 || status === 408;
  }
}