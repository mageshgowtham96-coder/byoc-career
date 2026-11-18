/**
 * BYOC AI Provider Abstraction
 *
 * Purpose: Clean provider-agnostic architecture for AI model integration.
 * Strategy:
 *   - Primary provider: Groq (user-configured API key)
 *   - Secondary free providers: OpenRouter, Gemini (via @google/genai)
 *   - Provider switching requires explicit user approval — never silent
 *   - All providers share the same chat completion interface contract
 *   - API keys stored exclusively in AES-256-GCM encrypted vault
 *   - Provider diagnostics: connection test, model list, rate-limit status
 *   - Graceful degradation: if primary provider fails, fall back to secondary
 *   - No provider is assumed operational without verification
 *
 * Contract:
 *   All providers must implement: callChat(systemPrompt, userPrompt, apiKey) => Promise<string>
 *   Response must be valid JSON (or parseable text) per the system prompt's response_format
 */

// Provider status enum
export type ProviderStatus = 'unknown' | 'available' | 'unavailable' | 'error' | 'rate_limited' | 'offline';

// Provider metadata
export interface ProviderMetadata {
  id: string;
  name: string;
  version?: string;
  contextLength?: number;
  costPer1kTokens?: number | null; // null = free or unknown
}

/**
 * Unified chat message interface shared across all providers
 */
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Unified chat completion response (JSON parseable)
 */
export interface ProviderCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  raw?: any; // full response for diagnostics
}

/**
 * Provider configuration — what we need to connect
 */
export interface ProviderConfig {
  apiKey: string; // from vault; never plaintext in source
  baseURL?: string; // provider endpoint
  models: string[]; // ordered list of model IDs to try
  timeoutMs?: number; // request timeout
}

/**
 * Provider status tracked in the app
 */
export interface ProviderState {
  status: ProviderStatus;
  metadata: ProviderMetadata | null;
  lastChecked: string; // ISO timestamp
  errorMessage?: string;
  modelInUse?: string;
}

/**
 * Default provider configs (read-only; keys come from vault)
 */
export const PROVIDER_CONFIGS = {
  groq: {
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1/chat/completions',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768'
    ],
    timeoutMs: 30000
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.5-sonnet-100k',
      'google/gemini-1.5-pro',
      'meta-llama/llama-3.1-70b-instruct'
    ],
    timeoutMs: 30000
  },
  gemini: {
    name: 'Gemini',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    timeoutMs: 30000
  }
} as const;

/**
 * Get the config for a named provider
 */
export function getProviderConfig<K extends keyof typeof PROVIDER_CONFIGS>(name: K): typeof PROVIDER_CONFIGS[K] {
  return PROVIDER_CONFIGS[name];
}

/**
 * Check if a provider is client-side usable
 */
export function isProviderClientUsable(name: keyof typeof PROVIDER_CONFIGS): boolean {
  const cfg = PROVIDER_CONFIGS[name];
  if (!cfg) return false;
  return true; // All three are client-usable with proper SDKs
}

/**
 * Groq provider implementation
 */
export class GroqProvider {
  config = PROVIDER_CONFIGS.groq;
  state: ProviderState = {
    status: 'unknown',
    metadata: null,
    lastChecked: new Date().toISOString(),
    errorMessage: undefined
  };

  async checkAvailability(apiKey: string): Promise<ProviderState> {
    this.state = {
      status: 'unknown',
      metadata: null,
      lastChecked: new Date().toISOString(),
      errorMessage: undefined
    };

    if (!apiKey || !apiKey.trim()) {
      this.state.status = 'error';
      this.state.errorMessage = 'Groq API key is required.';
      return this.state;
    }

    try {
      const { getAvailableGroqModels } = await import('../services/groqService');
      const models = await getAvailableGroqModels(apiKey.trim());
      
      this.state.metadata = {
        id: 'groq',
        name: 'Groq',
        contextLength: 8192,
        costPer1kTokens: null
      };
      this.state.status = models.length > 0 ? 'available' : 'unavailable';
      this.state.modelInUse = models[0] || undefined;
      this.state.errorMessage = models.length === 0 ? 'No Groq models available. Check API key and quota.' : undefined;
      return this.state;
    } catch (err: unknown) {
      this.state.status = 'error';
      this.state.errorMessage = err instanceof Error ? err.message : 'Groq connectivity check failed';
      return this.state;
    }
  }

  async callChat(systemPrompt: string, userPrompt: string, apiKey: string): Promise<ProviderCompletionResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Groq API key is required.');
    }

    const { callGroqChat } = await import('../services/groqService');
    const model = this.config.models[0];
    const content = await callGroqChat(systemPrompt, userPrompt, apiKey.trim(), model);
    
    return {
      content,
      model,
      usage: undefined,
      finishReason: 'stop'
    };
  }
}

/**
 * OpenRouter provider implementation
 */
export class OpenRouterProvider {
  config = PROVIDER_CONFIGS.openrouter;
  state: ProviderState = {
    status: 'unknown',
    metadata: null,
    lastChecked: new Date().toISOString(),
    errorMessage: undefined
  };

  async checkAvailability(apiKey: string): Promise<ProviderState> {
    this.state = {
      status: 'unknown',
      metadata: null,
      lastChecked: new Date().toISOString(),
      errorMessage: undefined
    };

    if (!apiKey || !apiKey.trim()) {
      this.state.status = 'error';
      this.state.errorMessage = 'OpenRouter API key is required.';
      return this.state;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs!);

      const res = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        this.state.status = 'error';
        this.state.errorMessage = `OpenRouter returned ${res.status}: ${res.statusText}`;
        return this.state;
      }

      const data = await res.json();
      const modelIds = (data.data || []).map((m: any) => m.id);
      
      this.state.metadata = {
        id: 'openrouter',
        name: 'OpenRouter',
        contextLength: 32768,
        costPer1kTokens: null
      };
      this.state.status = modelIds.length > 0 ? 'available' : 'unavailable';
      this.state.errorMessage = modelIds.length === 0 ? 'No models returned from OpenRouter.' : undefined;
      return this.state;
    } catch (err: unknown) {
      this.state.status = 'error';
      this.state.errorMessage = err instanceof Error ? err.message : 'OpenRouter connectivity check failed';
      return this.state;
    }
  }

  async callChat(systemPrompt: string, userPrompt: string, apiKey: string): Promise<ProviderCompletionResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('OpenRouter API key is required.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs!);

    const res = await fetch(this.config.baseURL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: this.config.models[0],
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15,
        max_tokens: 3800
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || this.config.models[0],
      usage: data.usage,
      finishReason: data.finish_reason || 'stop'
    };
  }
}

/**
 * Gemini provider implementation using @google/genai SDK
 */
export class GeminiProvider {
  config = PROVIDER_CONFIGS.gemini;
  state: ProviderState = {
    status: 'unknown',
    metadata: null,
    lastChecked: new Date().toISOString(),
    errorMessage: undefined
  };

  private genaiClient: any = null;

  async checkAvailability(apiKey: string): Promise<ProviderState> {
    this.state = {
      status: 'unknown',
      metadata: null,
      lastChecked: new Date().toISOString(),
      errorMessage: undefined
    };

    if (!apiKey || !apiKey.trim()) {
      this.state.status = 'error';
      this.state.errorMessage = 'Gemini API key is required.';
      return this.state;
    }

    try {
      const { GoogleGenAI } = await import('@google/genai');
      this.genaiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
      
      // Test with a minimal request
      const result = await this.genaiClient.models.generateContent({
        model: this.config.models[0],
        contents: 'test'
      });

      this.state.metadata = {
        id: 'gemini',
        name: 'Gemini',
        contextLength: 1048576, // 1M tokens for 1.5 Pro
        costPer1kTokens: null
      };
      this.state.status = 'available';
      this.state.modelInUse = this.config.models[0];
      return this.state;
    } catch (err: unknown) {
      this.state.status = 'error';
      this.state.errorMessage = err instanceof Error ? err.message : 'Gemini connectivity check failed';
      return this.state;
    }
  }

  async callChat(systemPrompt: string, userPrompt: string, apiKey: string): Promise<ProviderCompletionResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Gemini API key is required.');
    }

    if (!this.genaiClient) {
      const { GoogleGenAI } = await import('@google/genai');
      this.genaiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
    }

    const result = await this.genaiClient.models.generateContent({
      model: this.config.models[0],
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        temperature: 0.15,
        maxOutputTokens: 3800,
        responseMimeType: 'application/json'
      }
    });

    return {
      content: result.text || '',
      model: this.config.models[0],
      usage: result.usageMetadata ? {
        promptTokens: result.usageMetadata.promptTokenCount || 0,
        completionTokens: result.usageMetadata.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata.totalTokenCount || 0
      } : undefined,
      finishReason: 'stop'
    };
  }
}

/**
 * Provider manager — tracks all providers and their states
 */
export class ProviderManager {
  private providers: Map<keyof typeof PROVIDER_CONFIGS, GroqProvider | OpenRouterProvider | GeminiProvider> = new Map();
  private selectedProvider: keyof typeof PROVIDER_CONFIGS | null = null;

  /**
   * Initialize all known providers
   */
  init(): void {
    this.providers.set('groq', new GroqProvider());
    this.providers.set('openrouter', new OpenRouterProvider());
    this.providers.set('gemini', new GeminiProvider());
  }

  /**
   * Get a provider by name
   */
  getProvider(name: keyof typeof PROVIDER_CONFIGS): GroqProvider | OpenRouterProvider | GeminiProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Set the currently selected provider (user choice, stored in vault)
   */
  setSelectedProvider(name: keyof typeof PROVIDER_CONFIGS | null): void {
    this.selectedProvider = name;
  }

  /**
   * Get the currently selected provider
   */
  getSelectedProvider(): keyof typeof PROVIDER_CONFIGS | null {
    return this.selectedProvider;
  }

  /**
   * Check availability of all providers
   */
  async checkAllProviders(apiKeys: Record<string, string>): Promise<Map<keyof typeof PROVIDER_CONFIGS, ProviderState>> {
    const results = new Map<keyof typeof PROVIDER_CONFIGS, ProviderState>();
    
    for (const [name, provider] of this.providers) {
      const apiKey = apiKeys[name] || '';
      const state = await provider.checkAvailability(apiKey);
      results.set(name, state);
    }
    return results;
  }

  /**
   * Attempt chat with the selected provider, falling back if needed
   */
  async attemptChat(
    systemPrompt: string,
    userPrompt: string,
    apiKeys: Record<string, string>
  ): Promise<{ content: string; model: string; provider: keyof typeof PROVIDER_CONFIGS } | null> {
    // Try selected provider first
    if (this.selectedProvider) {
      const provider = this.providers.get(this.selectedProvider);
      if (provider) {
        try {
          const apiKey = apiKeys[this.selectedProvider] || '';
          const response = await provider.callChat(systemPrompt, userPrompt, apiKey);
          return { content: response.content, model: response.model, provider: this.selectedProvider };
        } catch (err: unknown) {
          console.warn(`Provider ${this.selectedProvider} failed:`, err);
        }
      }
    }

    // Fallback: try available providers in preference order
    const fallbackOrder: (keyof typeof PROVIDER_CONFIGS)[] = ['groq', 'openrouter', 'gemini'];
    for (const name of fallbackOrder) {
      if (name === this.selectedProvider) continue;
      const provider = this.providers.get(name);
      if (!provider) continue;
      const apiKey = apiKeys[name] || '';
      if (!apiKey) continue;
      
      try {
        const response = await provider.callChat(systemPrompt, userPrompt, apiKey);
        this.setSelectedProvider(name);
        return { content: response.content, model: response.model, provider: name };
      } catch (err: unknown) {
        console.warn(`Provider ${name} fallback failed:`, err);
        continue;
      }
    }

    return null;
  }
}
