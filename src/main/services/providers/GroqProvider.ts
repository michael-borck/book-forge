/**
 * GroqProvider - Groq AI provider implementation for BookForge
 * 
 * This provider integrates with Groq's lightning-fast AI inference API,
 * supporting various open-source models like Llama, Mixtral, and Gemma.
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

// Groq-specific configuration
interface GroqConfig extends ProviderConfig {
  apiKey: string;
  endpoint?: string; // Allow custom endpoint override
}

// Groq API types
interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChatRequest {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

interface GroqChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export class GroqProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast AI inference with open-source models',
    website: 'https://groq.com',
    supportsStreaming: true,
    supportsLocalModels: false,
    requiresApiKey: true,
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: false,
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: false,
    customEndpoints: true,
  };

  private baseUrl = 'https://api.groq.com/openai/v1';
  private apiKey: string = '';

  // Groq model catalog with pricing
  private readonly groqModels: Model[] = [
    {
      id: 'llama-3.1-405b-reasoning',
      name: 'Llama 3.1 405B Reasoning',
      description: 'Meta\'s largest and most capable model for complex reasoning',
      contextLength: 131072,
      inputPricing: 0.59, // per 1M tokens
      outputPricing: 2.36, // per 1M tokens
      currency: 'USD',
    },
    {
      id: 'llama-3.1-70b-versatile',
      name: 'Llama 3.1 70B Versatile',
      description: 'Balanced model for general-purpose tasks',
      contextLength: 131072,
      inputPricing: 0.59,
      outputPricing: 0.79,
      currency: 'USD',
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Llama 3.1 8B Instant',
      description: 'Fast and efficient model for quick responses',
      contextLength: 131072,
      inputPricing: 0.05,
      outputPricing: 0.08,
      currency: 'USD',
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B',
      description: 'Mistral AI\'s mixture of experts model',
      contextLength: 32768,
      inputPricing: 0.24,
      outputPricing: 0.24,
      currency: 'USD',
    },
    {
      id: 'gemma2-9b-it',
      name: 'Gemma 2 9B IT',
      description: 'Google\'s Gemma 2 model optimized for instruction following',
      contextLength: 8192,
      inputPricing: 0.20,
      outputPricing: 0.20,
      currency: 'USD',
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const groqConfig = config as GroqConfig;
    
    this.apiKey = groqConfig.apiKey;
    
    if (groqConfig.endpoint) {
      this.baseUrl = groqConfig.endpoint.replace(/\/$/, ''); // Remove trailing slash
    }

    // Test the connection
    await this.testConnection();
    console.log('Groq provider initialized successfully');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const groqConfig = config as GroqConfig;

    // Validate API key
    if (!groqConfig.apiKey || groqConfig.apiKey.trim().length === 0) {
      errors.push('Groq API key is required');
    } else if (!groqConfig.apiKey.startsWith('gsk_')) {
      warnings.push('Groq API key should start with "gsk_"');
    }

    // Validate endpoint if provided
    if (groqConfig.endpoint) {
      try {
        new URL(groqConfig.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
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
      // In the future, we could fetch from Groq's models endpoint
      return [...this.groqModels];
    } catch (error) {
      console.warn('Failed to fetch Groq models, using static list:', error);
      return [...this.groqModels];
    }
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    const request: GroqChatRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stop: params.stop,
      stream: false,
    };

    const response = await this.makeRequest<GroqChatResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const choice = response.choices[0];
    if (!choice) {
      throw createProviderError(
        this.info.id,
        'No response choices returned from Groq',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    return this.createGenerationChunk(choice.message.content, {
      model: params.model,
      finishReason: choice.finish_reason as GenerationChunk['finishReason'],
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const request: GroqChatRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stop: params.stop,
      stream: true,
    };

    const response = await this.makeStreamRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'text/event-stream',
      },
    });

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
              const chunk: GroqStreamChunk = JSON.parse(data);
              const choice = chunk.choices[0];
              
              if (choice?.delta?.content) {
                yield this.createGenerationChunk(choice.delta.content, {
                  model: params.model,
                  finishReason: choice.finish_reason as GenerationChunk['finishReason'],
                });
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
    // Groq doesn't provide a dedicated tokenization endpoint
    // Use estimation based on model type
    const selectedModel = model || 'llama-3.1-8b-instant';
    
    if (selectedModel.includes('llama')) {
      // Llama models: roughly 3.5 characters per token
      return Math.ceil(text.length / 3.5);
    } else if (selectedModel.includes('mixtral')) {
      // Mixtral: roughly 4 characters per token
      return Math.ceil(text.length / 4);
    } else {
      // Default estimation
      return Math.ceil(text.length / 4);
    }
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    const model = this.groqModels.find(m => m.id === modelId);
    if (!model) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    // Convert from per-1M pricing to per-1K pricing
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
      // Simple health check by fetching models
      await this.makeRequest('/models', {
        method: 'GET',
      });
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
    console.log('Groq provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private convertMessages(messages: GenerationParams['messages']): GroqMessage[] {
    return messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system',
      content: msg.content,
    }));
  }

  private async testConnection(): Promise<void> {
    try {
      await this.makeRequest('/models', {
        method: 'GET',
      });
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Failed to connect to Groq API: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { userMessage: 'Please check your Groq API key and internet connection.' }
      );
    }
  }

  private async makeRequest<T = any>(
    endpoint: string, 
    options: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
      stream?: boolean;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
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
          'Network error: Unable to connect to Groq API',
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
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
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
          'Network error: Unable to connect to Groq API',
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