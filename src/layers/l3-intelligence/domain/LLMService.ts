/**
 * LLMService - Layer 4 Content Analysis
 *
 * Service for cloud LLM (OpenAI, Anthropic) and local Ollama integration.
 * This is an OPTIONAL layer that runs only when user has configured it.
 *
 * Provides:
 * - Deep reasoning for complex questions
 * - Summarization of long documents
 * - Q&A about course content
 * - Study strategy suggestions
 *
 * Privacy: API keys are stored in the system keychain via CredentialManager,
 * never in localStorage or plain text.
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';

/**
 * Supported LLM providers
 */
export type LLMProvider = 'none' | 'ollama' | 'openai' | 'anthropic';

/**
 * LLM request for text generation
 */
export interface LLMRequest {
  /** The prompt/question to send */
  prompt: string;
  /** System message for context */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Whether to stream the response */
  stream?: boolean;
}

/**
 * LLM response
 */
export interface LLMResponse {
  /** Generated text */
  text: string;
  /** Model used */
  model: string;
  /** Provider used */
  provider: LLMProvider;
  /** Tokens used (if available) */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Processing time in ms */
  processingTimeMs: number;
  /** Whether response was truncated */
  truncated?: boolean;
}

/**
 * LLM configuration
 */
export interface LLMServiceConfig {
  provider: LLMProvider;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiModel?: string;
  anthropicModel?: string;
  // API keys are passed at runtime, not stored in config
}

const DEFAULT_CONFIG: Required<Omit<LLMServiceConfig, 'provider'>> & {
  provider: LLMProvider;
} = {
  provider: 'none',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  openaiModel: 'gpt-4o-mini',
  anthropicModel: 'claude-3-haiku-20240307',
};

/**
 * LLMService provides integration with various LLM providers
 *
 * Events:
 * - 'request-start': Emitted when a request starts
 * - 'request-complete': Emitted when a request completes
 * - 'stream-chunk': Emitted for each chunk in streaming mode
 * - 'error': Emitted on errors
 */
export class LLMService extends EventEmitter {
  private config: Required<LLMServiceConfig>;
  private apiKeys: Map<LLMProvider, string> = new Map();
  private httpClient: AxiosInstance;

  constructor(config?: LLMServiceConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.httpClient = axios.create({
      timeout: 120000, // 2 minute timeout for LLM requests
    });
  }

  /**
   * Set API key for a provider
   * Keys should come from the secure credential store
   */
  setApiKey(provider: LLMProvider, apiKey: string): void {
    this.apiKeys.set(provider, apiKey);
  }

  /**
   * Clear API key for a provider
   */
  clearApiKey(provider: LLMProvider): void {
    this.apiKeys.delete(provider);
  }

  /**
   * Check if the configured provider is available
   */
  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    const { provider } = this.config;

    if (provider === 'none') {
      return { available: false, error: 'No LLM provider configured' };
    }

    if (provider === 'ollama') {
      return this.checkOllamaAvailability();
    }

    if (provider === 'openai') {
      const key = this.apiKeys.get('openai');
      if (!key) {
        return { available: false, error: 'OpenAI API key not set' };
      }
      return { available: true };
    }

    if (provider === 'anthropic') {
      const key = this.apiKeys.get('anthropic');
      if (!key) {
        return { available: false, error: 'Anthropic API key not set' };
      }
      return { available: true };
    }

    return { available: false, error: 'Unknown provider' };
  }

  /**
   * Check if Ollama is running and accessible
   */
  private async checkOllamaAvailability(): Promise<{
    available: boolean;
    error?: string;
  }> {
    try {
      const response = await this.httpClient.get(`${this.config.ollamaUrl}/api/tags`, {
        timeout: 5000,
      });
      return { available: response.status === 200 };
    } catch {
      return { available: false, error: 'Ollama is not running or not accessible' };
    }
  }

  /**
   * Generate text using the configured LLM
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const { provider } = this.config;

    this.emit('request-start', { provider, prompt: request.prompt.slice(0, 100) });

    try {
      let response: LLMResponse;

      switch (provider) {
        case 'ollama':
          response = await this.generateWithOllama(request);
          break;
        case 'openai':
          response = await this.generateWithOpenAI(request);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(request);
          break;
        default:
          throw new Error('No LLM provider configured');
      }

      response.processingTimeMs = Date.now() - startTime;
      this.emit('request-complete', response);
      return response;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Generate using Ollama (local)
   */
  private async generateWithOllama(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.httpClient.post(`${this.config.ollamaUrl}/api/generate`, {
      model: this.config.ollamaModel,
      prompt: request.prompt,
      system: request.systemPrompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 1024,
      },
    });

    return {
      text: response.data.response,
      model: this.config.ollamaModel,
      provider: 'ollama',
      processingTimeMs: 0, // Set by caller
    };
  }

  /**
   * Generate using OpenAI
   */
  private async generateWithOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKeys.get('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key not set');
    }

    const messages = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const response = await this.httpClient.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.config.openaiModel,
        messages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const choice = response.data.choices[0];
    const usage = response.data.usage;

    return {
      text: choice.message.content,
      model: this.config.openaiModel,
      provider: 'openai',
      tokensUsed: usage
        ? {
            prompt: usage.prompt_tokens,
            completion: usage.completion_tokens,
            total: usage.total_tokens,
          }
        : undefined,
      processingTimeMs: 0,
      truncated: choice.finish_reason === 'length',
    };
  }

  /**
   * Generate using Anthropic
   */
  private async generateWithAnthropic(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKeys.get('anthropic');
    if (!apiKey) {
      throw new Error('Anthropic API key not set');
    }

    const response = await this.httpClient.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.anthropicModel,
        max_tokens: request.maxTokens ?? 1024,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.content[0];
    const usage = response.data.usage;

    return {
      text: content.text,
      model: this.config.anthropicModel,
      provider: 'anthropic',
      tokensUsed: usage
        ? {
            prompt: usage.input_tokens,
            completion: usage.output_tokens,
            total: usage.input_tokens + usage.output_tokens,
          }
        : undefined,
      processingTimeMs: 0,
      truncated: response.data.stop_reason === 'max_tokens',
    };
  }

  /**
   * Summarize a document
   */
  async summarize(
    text: string,
    options: {
      maxLength?: number;
      style?: 'brief' | 'detailed' | 'bullet_points';
    } = {}
  ): Promise<string> {
    const { maxLength = 300, style = 'brief' } = options;

    const styleInstructions =
      style === 'brief'
        ? 'Provide a brief 2-3 sentence summary.'
        : style === 'detailed'
          ? 'Provide a comprehensive summary covering all main points.'
          : 'Summarize in bullet points.';

    const response = await this.generate({
      systemPrompt:
        'You are a helpful academic assistant. Summarize the following document clearly and concisely.',
      prompt: `${styleInstructions}\n\nDocument:\n${text.slice(0, 10000)}`,
      maxTokens: maxLength * 2,
      temperature: 0.3,
    });

    return response.text;
  }

  /**
   * Answer a question about content
   */
  async answerQuestion(question: string, context: string): Promise<string> {
    const response = await this.generate({
      systemPrompt:
        'You are a helpful academic assistant. Answer questions based on the provided context. If the answer cannot be found in the context, say so.',
      prompt: `Context:\n${context.slice(0, 8000)}\n\nQuestion: ${question}`,
      maxTokens: 512,
      temperature: 0.3,
    });

    return response.text;
  }

  /**
   * Extract key information from a syllabus
   */
  async extractSyllabusInfo(syllabusText: string): Promise<{
    courseName?: string;
    instructor?: string;
    officeHours?: string;
    gradingScheme?: string[];
    importantDates?: string[];
    policies?: string[];
  }> {
    const response = await this.generate({
      systemPrompt: `You are a helpful academic assistant. Extract key information from the syllabus in JSON format with these fields:
- courseName: The course name/title
- instructor: Instructor name(s)
- officeHours: Office hours information
- gradingScheme: Array of grading components with weights
- importantDates: Array of important dates (exams, deadlines)
- policies: Array of key policies (late work, attendance, etc.)

Return ONLY valid JSON, no markdown.`,
      prompt: syllabusText.slice(0, 10000),
      maxTokens: 1024,
      temperature: 0.1,
    });

    try {
      return JSON.parse(response.text);
    } catch {
      // If parsing fails, return empty object
      return {};
    }
  }

  /**
   * Generate study recommendations
   */
  async generateStudyRecommendations(context: {
    courseName: string;
    taskType: string;
    dueDate: Date;
    currentGrade?: number;
    targetGrade?: number;
  }): Promise<string[]> {
    const daysUntil = Math.ceil(
      (context.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const response = await this.generate({
      systemPrompt:
        'You are a helpful academic study coach. Provide specific, actionable study recommendations.',
      prompt: `I have a ${context.taskType} for ${context.courseName} due in ${daysUntil} days.${
        context.currentGrade
          ? ` My current grade is ${context.currentGrade}%, target is ${context.targetGrade ?? 85}%.`
          : ''
      }

Give me 3-5 specific study recommendations.`,
      maxTokens: 512,
      temperature: 0.7,
    });

    // Try to parse as bullet points
    const lines = response.text.split('\n').filter((line) => line.trim());
    return lines.map((line) => line.replace(/^[\d\.\-\*\•]\s*/, '').trim());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LLMServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current provider
   */
  getProvider(): LLMProvider {
    return this.config.provider;
  }

  /**
   * Get current model for the active provider
   */
  getCurrentModel(): string {
    switch (this.config.provider) {
      case 'ollama':
        return this.config.ollamaModel;
      case 'openai':
        return this.config.openaiModel;
      case 'anthropic':
        return this.config.anthropicModel;
      default:
        return 'none';
    }
  }
}

/**
 * Singleton instance for shared use
 */
let sharedInstance: LLMService | null = null;

/**
 * Get or create shared LLMService instance
 */
export function getLLMService(config?: LLMServiceConfig): LLMService {
  if (!sharedInstance) {
    sharedInstance = new LLMService(config);
  } else if (config) {
    sharedInstance.updateConfig(config);
  }
  return sharedInstance;
}
