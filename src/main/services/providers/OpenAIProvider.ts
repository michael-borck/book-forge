/**
 * OpenAIProvider - OpenAI GPT provider implementation for BookForge
 * 
 * This provider integrates with OpenAI's API, supporting GPT-4, GPT-4 Turbo,
 * GPT-3.5 Turbo, and other OpenAI models for high-quality text generation.
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

// OpenAI-specific configuration
interface OpenAIConfig extends ProviderConfig {
  apiKey: string;
  endpoint?: string; // Allow custom endpoint override
  organizationId?: string; // OpenAI organization ID
  project?: string; // OpenAI project ID
}

// OpenAI API types
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  functions?: any[]; // Function calling support
  function_call?: any;
}

interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: 'stop' | 'length' | 'function_call' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      function_call?: {
        name?: string;
        arguments?: string;
      };
    };
    finish_reason?: 'stop' | 'length' | 'function_call' | 'content_filter';
  }>;
}

export class OpenAIProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI\'s GPT models for versatile and powerful text generation',
    website: 'https://openai.com',
    supportsStreaming: true,
    supportsLocalModels: false,
    requiresApiKey: true,
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: true, // GPT-4 Vision support
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: false,
    customEndpoints: true,
  };

  private baseUrl = 'https://api.openai.com/v1';
  private apiKey: string = '';
  private organizationId?: string;
  private project?: string;

  // OpenAI model catalog with pricing (as of 2024)
  private readonly openaiModels: Model[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Most advanced multimodal model, optimized for chat and traditional completions',
      contextLength: 128000,
      inputPricing: 5.00, // per 1M tokens
      outputPricing: 15.00, // per 1M tokens
      currency: 'USD',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Affordable and intelligent small model for fast, lightweight tasks',
      contextLength: 128000,
      inputPricing: 0.15,
      outputPricing: 0.60,
      currency: 'USD',
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: 'High-intelligence model for complex, multi-step tasks',
      contextLength: 128000,
      inputPricing: 10.00,
      outputPricing: 30.00,
      currency: 'USD',
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      description: 'High-intelligence model for complex reasoning tasks',
      contextLength: 8192,
      inputPricing: 30.00,
      outputPricing: 60.00,
      currency: 'USD',
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Fast, inexpensive model for simple tasks',
      contextLength: 16385,
      inputPricing: 0.50,
      outputPricing: 1.50,
      currency: 'USD',
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const openaiConfig = config as OpenAIConfig;
    
    this.apiKey = openaiConfig.apiKey;
    this.organizationId = openaiConfig.organizationId;
    this.project = openaiConfig.project;
    
    if (openaiConfig.endpoint) {
      this.baseUrl = openaiConfig.endpoint.replace(/\/$/, ''); // Remove trailing slash
    }

    // Test the connection
    await this.testConnection();
    console.log('OpenAI provider initialized successfully');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const openaiConfig = config as OpenAIConfig;

    // Validate API key
    if (!openaiConfig.apiKey || openaiConfig.apiKey.trim().length === 0) {
      errors.push('OpenAI API key is required');
    } else if (!openaiConfig.apiKey.startsWith('sk-')) {
      warnings.push('OpenAI API key should start with "sk-"');
    }

    // Validate endpoint if provided
    if (openaiConfig.endpoint) {
      try {
        new URL(openaiConfig.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }

    // Validate organization ID format if provided
    if (openaiConfig.organizationId && !openaiConfig.organizationId.startsWith('org-')) {
      warnings.push('Organization ID should start with "org-"');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async getAvailableModels(): Promise<Model[]> {
    try {
      // Optionally fetch from OpenAI's models endpoint for real-time data
      // For now, return static model list for reliability
      return [...this.openaiModels];
    } catch (error) {
      console.warn('Failed to fetch OpenAI models, using static list:', error);
      return [...this.openaiModels];
    }
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    const request: OpenAIChatRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      frequency_penalty: params.frequencyPenalty,
      presence_penalty: params.presencePenalty,
      stop: params.stop,
      stream: false,
    };

    const response = await this.makeRequest<OpenAIChatResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const choice = response.choices[0];
    if (!choice) {
      throw createProviderError(
        this.info.id,
        'No response choices returned from OpenAI',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    return this.createGenerationChunk(choice.message.content, {
      model: params.model,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const request: OpenAIChatRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      frequency_penalty: params.frequencyPenalty,
      presence_penalty: params.presencePenalty,
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
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              const choice = chunk.choices[0];
              
              if (choice?.delta?.content) {
                yield this.createGenerationChunk(choice.delta.content, {
                  model: params.model,
                  finishReason: choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined,
                });
              }

              // Handle function calls if present
              if (choice?.delta?.function_call) {
                // For now, just yield the function call as content
                // In the future, this could be handled specially
                const functionContent = `Function call: ${choice.delta.function_call.name || ''}`;
                yield this.createGenerationChunk(functionContent, {
                  model: params.model,
                  finishReason: choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined,
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
    // OpenAI doesn't provide a public tokenization endpoint
    // Use estimation based on model type and OpenAI's guidelines
    const selectedModel = model || 'gpt-3.5-turbo';
    
    if (selectedModel.includes('gpt-4')) {
      // GPT-4 models: roughly 3.5 characters per token
      return Math.ceil(text.length / 3.5);
    } else if (selectedModel.includes('gpt-3.5')) {
      // GPT-3.5 models: roughly 4 characters per token
      return Math.ceil(text.length / 4);
    } else {
      // Default estimation
      return Math.ceil(text.length / 4);
    }
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    const model = this.openaiModels.find(m => m.id === modelId);
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
    this.organizationId = undefined;
    this.project = undefined;
    console.log('OpenAI provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private convertMessages(messages: GenerationParams['messages']): OpenAIMessage[] {
    return messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private mapFinishReason(openaiFinishReason: string): GenerationChunk['finishReason'] {
    switch (openaiFinishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'function_call':
        return 'function_call';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private async testConnection(): Promise<void> {
    try {
      await this.makeRequest('/models', {
        method: 'GET',
      });
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Failed to connect to OpenAI API: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { userMessage: 'Please check your OpenAI API key and internet connection.' }
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
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    // Add organization and project headers if provided
    if (this.organizationId) {
      headers['OpenAI-Organization'] = this.organizationId;
    }
    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

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
          'Network error: Unable to connect to OpenAI API',
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
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    // Add organization and project headers if provided
    if (this.organizationId) {
      headers['OpenAI-Organization'] = this.organizationId;
    }
    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

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
          'Network error: Unable to connect to OpenAI API',
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