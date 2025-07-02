/**
 * OllamaProvider - Ollama local AI provider implementation for BookForge
 * 
 * This provider integrates with Ollama for running local AI models,
 * supporting various open-source models like Llama, Mistral, Code Llama, and more.
 * Provides optional bearer token authentication for secured Ollama instances.
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

// Ollama-specific configuration
interface OllamaConfig extends ProviderConfig {
  endpoint?: string; // Ollama server endpoint (default: http://localhost:11434)
  bearerToken?: string; // Optional bearer token for authentication
}

// Ollama API types
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaGenerateRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number; // max_tokens equivalent
    stop?: string[];
  };
}

interface OllamaGenerateResponse {
  model: string;
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  message?: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaModelsResponse {
  models: OllamaModel[];
}

export class OllamaProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run large language models locally with Ollama',
    website: 'https://ollama.ai',
    supportsStreaming: true,
    supportsLocalModels: true,
    requiresApiKey: false, // No API key required, but bearer token is optional
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: false, // Most Ollama models don't support function calling
    imageInput: false, // Some models support vision, but not implemented yet
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: true,
    customEndpoints: true,
  };

  private baseUrl = 'http://localhost:11434';
  private bearerToken?: string;

  // Common Ollama models (will be populated dynamically from API)
  private ollamaModels: Model[] = [
    {
      id: 'llama3.2:latest',
      name: 'Llama 3.2',
      description: 'Meta\'s latest Llama model with improved performance',
      contextLength: 8192,
      inputPricing: 0, // Local execution - no cost
      outputPricing: 0,
      currency: 'USD',
      isLocal: true,
      isInstalled: false, // Will be determined by API
    },
    {
      id: 'mistral:latest',
      name: 'Mistral',
      description: 'Fast and efficient open-source model',
      contextLength: 8192,
      inputPricing: 0,
      outputPricing: 0,
      currency: 'USD',
      isLocal: true,
      isInstalled: false,
    },
    {
      id: 'codellama:latest',
      name: 'Code Llama',
      description: 'Specialized model for code generation and analysis',
      contextLength: 16384,
      inputPricing: 0,
      outputPricing: 0,
      currency: 'USD',
      isLocal: true,
      isInstalled: false,
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    const ollamaConfig = config as OllamaConfig;
    
    if (ollamaConfig.endpoint) {
      this.baseUrl = ollamaConfig.endpoint.replace(/\/$/, ''); // Remove trailing slash
    }

    if (ollamaConfig.bearerToken) {
      this.bearerToken = ollamaConfig.bearerToken;
    }

    // Test the connection and fetch available models
    await this.testConnection();
    await this.refreshAvailableModels();
    
    console.log('Ollama provider initialized successfully');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ollamaConfig = config as OllamaConfig;

    // Validate endpoint if provided
    if (ollamaConfig.endpoint) {
      try {
        const url = new URL(ollamaConfig.endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Endpoint must use HTTP or HTTPS protocol');
        }
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    } else {
      warnings.push('Using default Ollama endpoint (http://localhost:11434)');
    }

    // Validate bearer token format if provided
    if (ollamaConfig.bearerToken) {
      if (ollamaConfig.bearerToken.trim().length === 0) {
        warnings.push('Bearer token is empty');
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
      await this.refreshAvailableModels();
      return [...this.ollamaModels];
    } catch (error) {
      console.warn('Failed to fetch Ollama models, using static list:', error);
      return [...this.ollamaModels];
    }
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    const request: OllamaGenerateRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      stream: false,
      options: {
        temperature: params.temperature,
        top_p: params.topP,
        top_k: params.topK,
        num_predict: params.maxTokens,
        stop: params.stop,
      },
    };

    const response = await this.makeRequest<OllamaGenerateResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.message) {
      throw createProviderError(
        this.info.id,
        'No message returned from Ollama',
        ERROR_CODES.PROVIDER_API_ERROR
      );
    }

    // Calculate token usage from timing information
    const usage: TokenUsage = {
      promptTokens: response.prompt_eval_count || this.estimateTokenCount(
        params.messages.map(m => m.content).join(' ')
      ),
      completionTokens: response.eval_count || this.estimateTokenCount(response.message.content),
      totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
    };

    return this.createGenerationChunk(response.message.content, {
      model: params.model,
      finishReason: response.done ? 'stop' : undefined,
      usage,
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const request: OllamaGenerateRequest = {
      model: params.model,
      messages: this.convertMessages(params.messages),
      stream: true,
      options: {
        temperature: params.temperature,
        top_p: params.topP,
        top_k: params.topK,
        num_predict: params.maxTokens,
        stop: params.stop,
      },
    };

    const response = await this.makeStreamRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify(request),
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
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            try {
              const chunk: OllamaStreamChunk = JSON.parse(trimmedLine);
              
              if (chunk.message?.content) {
                yield this.createGenerationChunk(chunk.message.content, {
                  model: params.model,
                });
              }

              if (chunk.done) {
                // Final chunk with usage information if available
                const finalResponse = chunk as unknown as OllamaGenerateResponse;
                if (finalResponse.prompt_eval_count || finalResponse.eval_count) {
                  totalPromptTokens = finalResponse.prompt_eval_count || 0;
                  totalCompletionTokens = finalResponse.eval_count || 0;
                  
                  yield this.createGenerationChunk('', {
                    model: params.model,
                    finishReason: 'stop',
                    usage: {
                      promptTokens: totalPromptTokens,
                      completionTokens: totalCompletionTokens,
                      totalTokens: totalPromptTokens + totalCompletionTokens,
                    },
                  });
                }
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
    // Ollama doesn't provide a tokenization endpoint
    // Use estimation based on typical model characteristics
    // Most Ollama models use similar tokenization to Llama: roughly 3.5-4 characters per token
    return Math.ceil(text.length / 3.8);
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    // Local execution has no cost
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD',
      breakdown: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        inputRate: 0,
        outputRate: 0,
      },
    };
  }

  protected async doHealthCheck(): Promise<void> {
    try {
      // Simple health check by fetching version info
      await this.makeRequest('/api/version', {
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
    this.bearerToken = undefined;
    console.log('Ollama provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private convertMessages(messages: GenerationParams['messages']): OllamaMessage[] {
    return messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private async testConnection(): Promise<void> {
    try {
      await this.makeRequest('/api/version', {
        method: 'GET',
      });
    } catch (error) {
      throw createProviderError(
        this.info.id,
        `Failed to connect to Ollama: ${error}`,
        ERROR_CODES.PROVIDER_API_ERROR,
        { 
          userMessage: 'Please ensure Ollama is running and accessible at the configured endpoint.',
          details: { endpoint: this.baseUrl }
        }
      );
    }
  }

  private async refreshAvailableModels(): Promise<void> {
    try {
      const response = await this.makeRequest<OllamaModelsResponse>('/api/tags', {
        method: 'GET',
      });

      // Update our models list with installed status
      const installedModelNames = new Set(response.models.map(m => m.name));
      
      // Mark existing models as installed/not installed
      this.ollamaModels = this.ollamaModels.map(model => ({
        ...model,
        isInstalled: installedModelNames.has(model.id),
      }));

      // Add any new models we discovered
      for (const ollamaModel of response.models) {
        if (!this.ollamaModels.find(m => m.id === ollamaModel.name)) {
          const newModel: Model = {
            id: ollamaModel.name,
            name: this.formatModelName(ollamaModel.name),
            description: this.generateModelDescription(ollamaModel),
            contextLength: this.estimateContextLength(ollamaModel.name),
            inputPricing: 0,
            outputPricing: 0,
            currency: 'USD',
            isLocal: true,
            isInstalled: true,
          };
          this.ollamaModels.push(newModel);
        }
      }

    } catch (error) {
      console.warn('Failed to refresh Ollama models:', error);
      // Don't throw - we can still work with static models
    }
  }

  private formatModelName(modelName: string): string {
    // Convert "llama3.2:latest" to "Llama 3.2"
    return modelName
      .split(':')[0] // Remove tag
      .replace(/[.-]/g, ' ') // Replace dots and dashes with spaces
      .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize words
  }

  private generateModelDescription(ollamaModel: OllamaModel): string {
    const name = this.formatModelName(ollamaModel.name);
    const size = this.formatModelSize(ollamaModel.size);
    
    if (ollamaModel.details?.parameter_size) {
      return `${name} (${ollamaModel.details.parameter_size}, ${size})`;
    }
    
    return `${name} (${size})`;
  }

  private formatModelSize(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)}GB`;
  }

  private estimateContextLength(modelName: string): number {
    const name = modelName.toLowerCase();
    
    if (name.includes('codellama') || name.includes('code')) {
      return 16384; // Code models typically have longer context
    } else if (name.includes('llama3.2') || name.includes('llama3.1')) {
      return 8192; // Llama 3.x models
    } else if (name.includes('mistral')) {
      return 8192; // Mistral models
    } else if (name.includes('gemma')) {
      return 8192; // Gemma models
    } else {
      return 4096; // Default context length
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
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    // Add bearer token if provided
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
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
          if (errorData.error) {
            errorMessage = errorData.error;
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
          'Network error: Unable to connect to Ollama',
          ERROR_CODES.NETWORK_CONNECTION_FAILED,
          { 
            retryable: true,
            userMessage: 'Please check that Ollama is running and accessible.',
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
      'Content-Type': 'application/json',
      'User-Agent': 'BookForge/1.0',
      ...options.headers,
    };

    // Add bearer token if provided
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
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
          if (errorData.error) {
            errorMessage = errorData.error;
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
          'Network error: Unable to connect to Ollama',
          ERROR_CODES.NETWORK_CONNECTION_FAILED,
          { 
            retryable: true,
            userMessage: 'Please check that Ollama is running and accessible.',
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
      case 404:
        return ERROR_CODES.PROVIDER_MODEL_NOT_FOUND;
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
    return status >= 500 || status === 408;
  }
}