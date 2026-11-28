/**
 * BYOC single-provider AI abstraction.
 * Gemini is the only supported provider. No fallback or alternate provider is permitted.
 */
export type ProviderStatus = 'unknown' | 'available' | 'unavailable' | 'error' | 'rate_limited' | 'offline';

export interface ProviderMetadata {
  id: string;
  name: string;
  version?: string;
  contextLength?: number;
  costPer1kTokens?: number | null;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderCompletionResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: string;
  raw?: unknown;
}

export interface ProviderConfig {
  apiKey: string;
  models: string[];
  timeoutMs?: number;
}

export interface ProviderState {
  status: ProviderStatus;
  metadata: ProviderMetadata | null;
  lastChecked: string;
  errorMessage?: string;
  modelInUse?: string;
}

export const PROVIDER_CONFIGS = {
  gemini: {
    name: 'Gemini',
    models: ['gemini-2.5-flash'],
    timeoutMs: 45000
  }
} as const;

export function getProviderConfig(): typeof PROVIDER_CONFIGS.gemini {
  return PROVIDER_CONFIGS.gemini;
}

export function isProviderClientUsable(name: 'gemini'): boolean {
  return name === 'gemini';
}

export class GeminiProvider {
  readonly config = PROVIDER_CONFIGS.gemini;
  state: ProviderState = {
    status: 'unknown',
    metadata: null,
    lastChecked: new Date().toISOString()
  };

  async checkAvailability(apiKey: string): Promise<ProviderState> {
    this.state = { status: 'unknown', metadata: null, lastChecked: new Date().toISOString() };
    if (!apiKey.trim()) {
      this.state.status = 'error';
      this.state.errorMessage = 'Gemini API key is required.';
      return this.state;
    }
    try {
      const { getAvailableGeminiModels } = await import('../services/geminiService');
      const models = await getAvailableGeminiModels(apiKey.trim());
      this.state.metadata = { id: 'gemini', name: 'Gemini', contextLength: 1048576, costPer1kTokens: null };
      this.state.status = models.length ? 'available' : 'unavailable';
      this.state.modelInUse = models[0];
      this.state.errorMessage = models.length ? undefined : 'Gemini model validation returned no models.';
    } catch (err: unknown) {
      this.state.status = 'error';
      this.state.errorMessage = err instanceof Error ? err.message : 'Gemini connectivity check failed.';
    }
    return this.state;
  }

  async callChat(systemPrompt: string, userPrompt: string, apiKey: string): Promise<ProviderCompletionResponse> {
    const { callGeminiChat } = await import('../services/geminiService');
    const content = await callGeminiChat(systemPrompt, userPrompt, apiKey);
    return { content, model: this.config.models[0], finishReason: 'stop' };
  }
}

export class ProviderManager {
  private provider = new GeminiProvider();
  private selectedProvider: 'gemini' | null = 'gemini';

  init(): void {
    this.provider = new GeminiProvider();
    this.selectedProvider = 'gemini';
  }

  getProvider(name: 'gemini' = 'gemini'): GeminiProvider | undefined {
    return name === 'gemini' ? this.provider : undefined;
  }

  setSelectedProvider(name: 'gemini' | null): void {
    this.selectedProvider = name;
  }

  getSelectedProvider(): 'gemini' | null {
    return this.selectedProvider;
  }

  async checkAllProviders(apiKeys: Record<string, string>): Promise<Map<'gemini', ProviderState>> {
    const result = await this.provider.checkAvailability(apiKeys.gemini || '');
    return new Map([['gemini', result]]);
  }

  async attemptChat(
    systemPrompt: string,
    userPrompt: string,
    apiKeys: Record<string, string>
  ): Promise<{ content: string; model: string; provider: 'gemini' } | null> {
    const response = await this.provider.callChat(systemPrompt, userPrompt, apiKeys.gemini || '');
    return { content: response.content, model: response.model, provider: 'gemini' };
  }
}
