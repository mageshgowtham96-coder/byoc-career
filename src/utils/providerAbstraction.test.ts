import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  ProviderManager, 
  GroqProvider, 
  OpenRouterProvider, 
  GeminiProvider, 
  PROVIDER_CONFIGS, 
  getProviderConfig, 
  isProviderClientUsable 
} from './providerAbstraction';

describe('Provider Abstraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Configurations', () => {
    it('groq config exists with expected models', () => {
      const config = getProviderConfig('groq');
      expect(config.name).toBe('Groq');
      expect(Array.isArray(config.models)).toBe(true);
      expect(config.models.length).toBeGreaterThan(0);
      expect(config.baseURL).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    it('openrouter config has models list and baseURL', () => {
      const config = getProviderConfig('openrouter');
      expect(Array.isArray(config.models)).toBe(true);
      expect(config.baseURL).toBe('https://openrouter.ai/api/v1/chat/completions');
    });

    it('gemini config has models list', () => {
      const config = getProviderConfig('gemini');
      expect(Array.isArray(config.models)).toBe(true);
      expect(config.models).toContain('gemini-1.5-pro');
    });
  });

  describe('Client-Usability Check', () => {
    it('all three providers are client-usable', () => {
      expect(isProviderClientUsable('groq')).toBe(true);
      expect(isProviderClientUsable('openrouter')).toBe(true);
      expect(isProviderClientUsable('gemini')).toBe(true);
    });
  });

  describe('ProviderManager', () => {
    it('initializes all providers', () => {
      const manager = new ProviderManager();
      manager.init();
      expect(manager.getProvider('groq')).toBeDefined();
      expect(manager.getProvider('openrouter')).toBeDefined();
      expect(manager.getProvider('gemini')).toBeDefined();
    });

    it('getProvider retrieves a provider', () => {
      const manager = new ProviderManager();
      manager.init();
      const groqProvider = manager.getProvider('groq');
      expect(groqProvider).toBeInstanceOf(GroqProvider);
    });

    it('setSelectedProvider and getSelectedProvider work', () => {
      const manager = new ProviderManager();
      manager.init();
      manager.setSelectedProvider('groq');
      expect(manager.getSelectedProvider()).toBe('groq');
      manager.setSelectedProvider(null);
      expect(manager.getSelectedProvider()).toBeNull();
    });
  });

  describe('GroqProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new GroqProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('requires API key for chat', async () => {
      const provider = new GroqProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('Groq API key is required');
    });
  });

  describe('OpenRouterProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new OpenRouterProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('requires API key for chat', async () => {
      const provider = new OpenRouterProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('OpenRouter API key is required');
    });

    it('has correct baseURL and models', () => {
      const provider = new OpenRouterProvider();
      expect(provider.config.baseURL).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(provider.config.models.length).toBeGreaterThan(0);
    });
  });

  describe('GeminiProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new GeminiProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('requires API key for chat', async () => {
      const provider = new GeminiProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('Gemini API key is required');
    });

    it('has correct models', () => {
      const provider = new GeminiProvider();
      expect(provider.config.models).toContain('gemini-1.5-pro');
      expect(provider.config.models).toContain('gemini-1.5-flash');
    });
  });
});