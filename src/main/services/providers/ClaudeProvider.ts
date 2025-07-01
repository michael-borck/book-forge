/**
 * ClaudeProvider - Anthropic's Claude AI provider implementation for BookForge
 * 
 * This provider integrates with Anthropic's Claude API, supporting Claude 3.5 Sonnet,
 * Claude 3 Opus, Claude 3 Haiku, and other Claude models for high-quality text generation.
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

// Claude-specific configuration
interface ClaudeConfig extends ProviderConfig {
  apiKey: string;
  endpoint?: string; // Allow custom endpoint override
  version?: string; // API version
}

// Claude API types
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeChatRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string; // System message for Claude
}

interface ClaudeChatResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface ClaudeStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'ping' | 'error';
  message?: ClaudeChatResponse;
  delta?: {
    type: 'text_delta';
    text: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

export class ClaudeProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'claude',
    name: 'Claude (Anthropic)',
    description: 'Anthropic\'s powerful and safe AI assistant with excellent reasoning capabilities',
    website: 'https://anthropic.com',
    supportsStreaming: true,
    supportsLocalModels: false,
    requiresApiKey: true,
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    imageInput: true, // Claude 3 supports image input
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: false,
    customEndpoints: true,
  };

  private baseUrl = 'https://api.anthropic.com';
  private apiKey: string = '';
  private version = '2023-06-01'; // Default API version

  // Claude model catalog with pricing (as of 2024)
  private readonly claudeModels: Model[] = [
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Most intelligent model, best for complex reasoning and analysis',
      contextLength: 200000,
      inputPricing: 3.00, // per 1M tokens
      outputPricing: 15.00, // per 1M tokens
      currency: 'USD',
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Powerful model for highly complex tasks requiring deep understanding',
      contextLength: 200000,
      inputPricing: 15.00,
      outputPricing: 75.00,
      currency: 'USD',
    },
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      description: 'Balanced model for a wide range of tasks',
      contextLength: 200000,
      inputPricing: 3.00,
      outputPricing: 15.00,
      currency: 'USD',
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      description: 'Fastest model for simple tasks and quick responses',
      contextLength: 200000,
      inputPricing: 0.25,
      outputPricing: 1.25,
      currency: 'USD',
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const claudeConfig = config as ClaudeConfig;
    
    this.apiKey = claudeConfig.apiKey;
    
    if (claudeConfig.endpoint) {
      this.baseUrl = claudeConfig.endpoint.replace(/\/$/, ''); // Remove trailing slash
    }

    if (claudeConfig.version) {
      this.version = claudeConfig.version;
    }

    // Test the connection
    await this.testConnection();
    console.log('Claude provider initialized successfully');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const claudeConfig = config as ClaudeConfig;

    // Validate API key
    if (!claudeConfig.apiKey || claudeConfig.apiKey.trim().length === 0) {
      errors.push('Claude API key is required');
    } else if (!claudeConfig.apiKey.startsWith('sk-ant-')) {
      warnings.push('Claude API key should start with "sk-ant-"');
    }

    // Validate endpoint if provided
    if (claudeConfig.endpoint) {
      try {
        new URL(claudeConfig.endpoint);
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }

    // Validate API version if provided
    if (claudeConfig.version && !/^\d{4}-\d{2}-\d{2}$/.test(claudeConfig.version)) {
      warnings.push('API version should be in YYYY-MM-DD format');
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
      // Anthropic doesn't provide a public models endpoint
      return [...this.claudeModels];
    } catch (error) {
      console.warn('Failed to fetch Claude models, using static list:', error);
      return [...this.claudeModels];
    }
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    const { systemMessage, messages } = this.extractSystemMessage(params.messages);
    
    const request: ClaudeChatRequest = {
      model: params.model,
      max_tokens: params.maxTokens || 4000, // Claude requires max_tokens
      messages: this.convertMessages(messages),
      temperature: params.temperature,
      top_p: params.topP,
      top_k: params.topK,
      stop_sequences: params.stop,
      stream: false,
    };

    if (systemMessage) {
      request.system = systemMessage;
    }

    const response = await this.makeRequest<ClaudeChatResponse>('/v1/messages', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw createProviderError(
        this.info.id,
        'No text content returned from Claude',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    return this.createGenerationChunk(content.text, {
      model: params.model,
      finishReason: this.mapStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const { systemMessage, messages } = this.extractSystemMessage(params.messages);
    
    const request: ClaudeChatRequest = {
      model: params.model,
      max_tokens: params.maxTokens || 4000,
      messages: this.convertMessages(messages),
      temperature: params.temperature,
      top_p: params.topP,
      top_k: params.topK,
      stop_sequences: params.stop,
      stream: true,
    };

    if (systemMessage) {
      request.system = systemMessage;
    }

    const response = await this.makeStreamRequest('/v1/messages', {
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
              const event: ClaudeStreamEvent = JSON.parse(data);
              
              if (event.type === 'error') {
                throw createProviderError(
                  this.info.id,
                  event.error?.message || 'Streaming error',
                  ERROR_CODES.PROVIDER_API_ERROR
                );
              }

              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield this.createGenerationChunk(event.delta.text, {
                  model: params.model,
                });
              }

              if (event.type === 'message_start' && event.message?.usage) {
                totalInputTokens = event.message.usage.input_tokens;
              }

              if (event.type === 'message_delta' && event.usage) {
                totalOutputTokens = event.usage.output_tokens;
              }

              if (event.type === 'message_stop') {
                // Final chunk with usage information
                yield this.createGenerationChunk('', {
                  model: params.model,
                  finishReason: 'stop',
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
    // Claude doesn't provide a dedicated tokenization endpoint
    // Use estimation based on Claude's tokenization characteristics
    // Claude uses a similar tokenizer to GPT models but slightly different
    
    // More accurate estimation for Claude: roughly 3.8 characters per token
    return Math.ceil(text.length / 3.8);
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    const model = this.claudeModels.find(m => m.id === modelId);
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
      // Simple health check by making a minimal request
      const testRequest: ClaudeChatRequest = {
        model: 'claude-3-haiku-20240307', // Use fastest model for health check
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      };

      await this.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(testRequest),
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
    console.log('Claude provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private extractSystemMessage(messages: GenerationParams['messages']): {
    systemMessage: string | null;
    messages: GenerationParams['messages'];
  } {
    // Claude handles system messages separately from the messages array
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const otherMessages = messages.filter(msg => msg.role !== 'system');

    const systemMessage = systemMessages.length > 0
      ? systemMessages.map(msg => msg.content).join('\n\n')
      : null;

    return { systemMessage, messages: otherMessages };
  }

  private convertMessages(messages: GenerationParams['messages']): ClaudeMessage[] {
    return messages
      .filter(msg => msg.role !== 'system') // System messages handled separately
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));
  }

  private mapStopReason(claudeStopReason: string): GenerationChunk['finishReason'] {
    switch (claudeStopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with a minimal request
      const testRequest: ClaudeChatRequest = {
        model: 'claude-3-haiku-20240307',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Test' }],
      };

      await this.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(testRequest),
      });
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Failed to connect to Claude API: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { userMessage: 'Please check your Claude API key and internet connection.' }
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
    
    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.version,
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
          'Network error: Unable to connect to Claude API',
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
      'x-api-key': this.apiKey,
      'anthropic-version': this.version,
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
          'Network error: Unable to connect to Claude API',
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