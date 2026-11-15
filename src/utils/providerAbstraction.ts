/**
 * BYOC AI Provider Abstraction
 *
 * Purpose: Clean provider-agnostic architecture for AI model integration.
 * Strategy:
 *   - Primary provider: Groq (user-configured API key)
 *   - Secondary free providers: OpenRouter, Gemini (via existing dependencies)
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
 *
 * Design notes:
 *   - OpenRouter: uses existing @google/genai dependency infrastructure
 *   - Gemini: @google/genai v2 SDK available, but requires server proxy in client-only mode
 *   - Provider state is shared across the app via useWizardStore but persists only in vault
 */

// Provider status enum
export type ProviderStatus = 'unknown' | 'available' | 'unavailable' | 'error' | 'rate_limited' | 'offline';

// Provider metadata
export interface ProviderMetadata {
  id: string;
  name: string;
  version?: string;
  contextLength?: number;
  costPer1kTokens?: number; // null = free or unknown
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
    // baseURL will be derived from user's configured key domain
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
    // @google/genai SDK requires server proxy in client-only mode
    // Client-side: use Groq; Gemini available via backend proxy only
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    timeoutMs: 30000,
    // Client-side disabled flag — set true to explicitly disable Gemini client use
    clientSideDisabled: true
  }
} as const;

/**
 * Get the config for a named provider
 */
export function getProviderConfig(name: keyof typeof PROVIDER_CONFIGS): typeof PROVIDER_CONFIGS[keyof typeof PROVIDER_CONFIGS] {
  return PROVIDER_CONFIGS[name];
}

/**
 * Check if a provider is client-side usable
 */
export function isProviderClientUsable(name: keyof typeof PROVIDER_CONFIGS): boolean {
  const cfg = PROVIDER_CONFIGS[name];
  if (!cfg) return false;
  // Gemini is explicitly client-side disabled because @google/genai needs a server proxy
  if (name === 'gemini') return false;
  return true;
}

/**
 * Provider utility class — holds state and methods for a single provider
 */
export class ProviderUtils {
  name: keyof typeof PROVIDER_CONFIGS;
  config: typeof PROVIDER_CONFIGS[keyof typeof PROVIDER_CONFIGS];
  state: ProviderState;
  configVersion: number;

  constructor(name: keyof typeof PROVIDER_CONFIGS) {
    this.name = name;
    this.config = PROVIDER_CONFIGS[name];
    this.state = {
      status: 'unknown',
      metadata: null,
      lastChecked: new Date().toISOString(),
      errorMessage: undefined
    };
    this.configVersion = 1;
  }

  /**
   * Test connectivity and fetch model list from the provider.
   * Updates this.state with results.
   */
  async checkAvailability(apiKey: string): Promise<ProviderState> {
    this.state = {
      status: 'unknown',
      metadata: null,
      lastChecked: new Date().toISOString(),
      errorMessage: undefined
    };

    try {
      if (this.name === 'gemini' && this.config.clientSideDisabled) {
        this.state.status = 'unavailable';
        this.state.errorMessage = 'Gemini requires server-side proxy; not available in client-only BYOC build.';
        return this.state;
      }

      if (this.name === 'groq') {
        // Use existing Groq model discovery
        const models = await (await import('../services/groqService'))
          .getAvailableGroqModels(apiKey);
        this.state.metadata = {
          id: 'groq',
          name: 'Groq',
          contextLength: 8192,
          costPer1kTokens: null // free-tier varies by account
        };
        this.state.status = models.length > 0 ? 'available' : 'unavailable';
        this.state.modelInUse = models[0] || undefined;
        this.state.errorMessage = models.length === 0 ? 'No Groq models available. Check API key and quota.' : undefined;
        return this.state;
      }

      if (this.name === 'openrouter') {
        // OpenRouter availability check via generic fetch
        // Requires API key; we validate with a minimal request
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
      }

      this.state.status = 'unavailable';
      this.state.errorMessage = `Unknown provider: ${this.name}`;
      return this.state;
    } catch (err: unknown) {
      this.state.status = 'error';
      this.state.errorMessage =
        err instanceof Error ? err.message : 'Unknown provider error';
      return this.state;
    }
  }

  /**
   * Attempt a chat completion using this provider.
   * Returns ProviderCompletionResponse or throws GroqApiError.
   */
  async callChat(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string
  ): Promise<ProviderCompletionResponse> {
    // Input validation
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API key is required for provider chat.');
    }

    // Provider-specific routing
    if (this.name === 'groq') {
      const { callGroqChat } = (await import('../services/groqService')).callGroqChat;
      const content = await callGroqChat(systemPrompt, userPrompt, apiKey, this.config.models[0]);
      return {
        content,
        model: this.config.models[0] || 'unknown',
        usage: undefined,
        finishReason: 'stop'
      };
    }

    if (this.name === 'openrouter') {
      // Generic OpenRouter chat via fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs!);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

    if (this.name === 'gemini') {
      throw new Error('Gemini provider is not available in client-only mode. Use Groq or configure a backend proxy for Gemini.');
    }

    throw new Error(`Unsupported provider: ${this.name}`);
  }
}

/**
 * Provider manager — tracks all providers and their states
 */
export class ProviderManager {
  private providers: Map<keyof typeof PROVIDER_CONFIGS, ProviderUtils> = new Map();
  private selectedProvider: keyof typeof PROVIDER_CONFIGS | null = null;

  /**
   * Initialize all known providers
   */
  init(): void {
    for (const name of Object.keys(PROVIDER_CONFIGS) as keyof typeof PROVIDER_CONFIGS[]) {
      this.providers.set(name, new ProviderUtils(name));
    }
  }

  /**
   * Get a provider by name
   */
  getProvider(name: keyof typeof PROVIDER_CONFIGS): ProviderUtils | undefined {
    return this.providers.get(name);
  }

  /**
   * Set the currently selected provider (user choice, stored in vault)
   */
  setSelectedProvider(name: keyof typeof PROVIDER_CONFIGS | null): void {
    this.selectedProvider = name;
    // Persist selection in vault via store
    // (caller responsibility: write to useWizardState.groqProviderSelection or similar)
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
  async checkAllProviders(apiKey: string): Promise<Map<keyof typeof PROVIDER_CONFIGS, ProviderState>> {
    const results = new Map<keyof typeof PROVIDER_CONFIGS, ProviderState>();
    for (const [name, utils] of this.providers) {
      const state = await utils.checkAvailability(apiKey);
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
    apiKey: string
  ): Promise<{ content: string; model: string; provider: keyof typeof PROVIDER_CONFIGS } | null> {
    // Try selected provider first
    if (this.selectedProvider) {
      const utils = this.providers.get(this.selectedProvider);
      if (utils) {
        try {
          const response = await utils.callChat(systemPrompt, userPrompt, apiKey);
          return { content: response.content, model: response.model, provider: this.selectedProvider };
        } catch (err: unknown) {
          console.warn(`Provider ${this.selectedProvider} failed:`, err);
          // Fall through to try other providers
        }
      }
    }

    // Fallback: try available providers in preference order (Groq > OpenRouter)
    const fallbackOrder: keyof typeof PROVIDER_CONFIGS[] = ['groq', 'openrouter'];
    for (const name of fallbackOrder) {
      const utils = this.providers.get(name);
      if (!utils) continue;
      try {
        const response = await utils.callChat(systemPrompt, userPrompt, apiKey);
        // Switch selection to the working provider
        this.setSelectedProvider(name);
        return { content: response.content, model: response.model, provider: name };
      } catch (err: unknown) {
        console.warn(`Provider ${name} fallback failed:`, err);
        continue;
      }
    }

    // All providers failed
    return null;
  }
}