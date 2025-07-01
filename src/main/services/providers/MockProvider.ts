/**
 * MockProvider - A test implementation for development and testing
 * 
 * This provider simulates AI responses without making actual API calls,
 * useful for development, testing, and demonstrations.
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

export class MockProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'mock',
    name: 'Mock Provider',
    description: 'A mock provider for testing and development',
    website: 'https://example.com',
    supportsStreaming: true,
    supportsLocalModels: true,
    requiresApiKey: false,
  };

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: false,
    imageInput: false,
    imageOutput: false,
    audioInput: false,
    audioOutput: false,
    localExecution: true,
    customEndpoints: false,
  };

  private readonly mockModels: Model[] = [
    {
      id: 'mock-small',
      name: 'Mock Small',
      description: 'A small mock model for testing',
      contextLength: 4096,
      inputPricing: 0.0005,
      outputPricing: 0.001,
      currency: 'USD',
    },
    {
      id: 'mock-large',
      name: 'Mock Large',
      description: 'A large mock model for testing',
      contextLength: 8192,
      inputPricing: 0.001,
      outputPricing: 0.002,
      currency: 'USD',
    },
  ];

  // =====================
  // Implementation Methods
  // =====================

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    // Mock initialization - just simulate a small delay
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('Mock provider initialized');
  }

  protected async validateProviderConfig(config: ProviderConfig): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Mock validation - accept any config
    if (config.timeout && config.timeout < 100) {
      warnings.push('Timeout is very low for mock provider');
    }

    return {
      isValid: true,
      errors,
      warnings,
    };
  }

  async getAvailableModels(): Promise<Model[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return [...this.mockModels];
  }

  protected async doGenerate(params: GenerationParams): Promise<GenerationChunk> {
    // Simulate generation delay
    const delay = Math.random() * 1000 + 500; // 500-1500ms
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate mock content based on the messages
    const lastMessage = params.messages[params.messages.length - 1];
    const mockContent = this.generateMockContent(lastMessage.content, params.maxTokens || 100);

    return this.createGenerationChunk(mockContent, {
      model: params.model,
      tokens: this.estimateTokenCount(mockContent),
      finishReason: 'stop',
      usage: {
        promptTokens: await this.countTokens(lastMessage.content),
        completionTokens: this.estimateTokenCount(mockContent),
        totalTokens: await this.countTokens(lastMessage.content) + this.estimateTokenCount(mockContent),
      },
    });
  }

  protected async *doGenerateStream(params: GenerationParams): AsyncGenerator<GenerationChunk> {
    const lastMessage = params.messages[params.messages.length - 1];
    const fullContent = this.generateMockContent(lastMessage.content, params.maxTokens || 100);
    
    // Split content into chunks and stream them
    const words = fullContent.split(' ');
    let currentContent = '';
    
    for (let i = 0; i < words.length; i++) {
      // Add word and space (except for last word)
      currentContent += words[i] + (i < words.length - 1 ? ' ' : '');
      
      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      const isLast = i === words.length - 1;
      
      yield this.createGenerationChunk(words[i] + (isLast ? '' : ' '), {
        model: params.model,
        tokens: 1, // Approximate 1 token per word
        finishReason: isLast ? 'stop' : undefined,
        usage: isLast ? {
          promptTokens: await this.countTokens(lastMessage.content),
          completionTokens: this.estimateTokenCount(currentContent),
          totalTokens: await this.countTokens(lastMessage.content) + this.estimateTokenCount(currentContent),
        } : undefined,
      });
    }
  }

  protected async doCountTokens(text: string, model?: string): Promise<number> {
    // Simulate a small delay for realism
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Mock token counting - roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  protected doEstimateCost(usage: TokenUsage, modelId: string): CostEstimate {
    const model = this.mockModels.find(m => m.id === modelId) || this.mockModels[0];
    
    const inputCost = (usage.promptTokens / 1000) * model.inputPricing;
    const outputCost = (usage.completionTokens / 1000) * model.outputPricing;
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
    // Mock health check - simulate occasional failures
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (Math.random() < 0.05) { // 5% chance of failure
      throw new Error('Mock health check failed');
    }
  }

  protected async doDispose(): Promise<void> {
    console.log('Mock provider disposed');
  }

  // =====================
  // Private Helper Methods
  // =====================

  private generateMockContent(prompt: string, maxTokens: number): string {
    const templates = [
      "This is a mock response to your request about '{prompt}'. Here's some generated content that demonstrates the capabilities of the system.",
      "In response to '{prompt}', I can provide you with the following information and insights that should be helpful for your needs.",
      "Thank you for your question about '{prompt}'. Let me provide a comprehensive response that covers the key aspects of this topic.",
      "Regarding '{prompt}', here are some important points to consider along with detailed explanations and examples.",
    ];

    // Select a random template
    const template = templates[Math.floor(Math.random() * templates.length)];
    let content = template.replace('{prompt}', this.extractKeywords(prompt));

    // Add filler content to reach approximate token count
    const fillerSentences = [
      "This demonstrates how the AI system processes and responds to various types of queries.",
      "The mock provider simulates realistic response patterns and timing.",
      "Each response is generated dynamically based on the input parameters.",
      "This helps with testing and development of the application features.",
      "The content varies to provide diverse examples for different use cases.",
      "Integration testing benefits from having predictable yet varied responses.",
      "The system can handle different types of content generation requests.",
      "Performance characteristics are simulated to match real-world usage.",
    ];

    // Estimate current tokens and add more content if needed
    let currentTokens = this.estimateTokenCount(content);
    const targetTokens = Math.min(maxTokens, 50 + Math.random() * 200); // Reasonable length

    while (currentTokens < targetTokens) {
      const sentence = fillerSentences[Math.floor(Math.random() * fillerSentences.length)];
      content += " " + sentence;
      currentTokens = this.estimateTokenCount(content);
    }

    return content;
  }

  private extractKeywords(text: string): string {
    // Simple keyword extraction for the mock
    const words = text.toLowerCase().split(/\s+/);
    const keywords = words
      .filter(word => word.length > 3)
      .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'had', 'have', 'what', 'were'].includes(word))
      .slice(0, 3);
    
    return keywords.join(', ') || 'your topic';
  }
}