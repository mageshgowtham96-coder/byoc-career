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

// Mock the services and SDKs
vi.mock('../services/groqService', () => ({
  getAvailableGroqModels: vi.fn().mockResolvedValue(['openai/gpt-oss-120b']),
  callGroqChat: vi.fn().mockResolvedValue('{"response": "mocked groq"}')
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"response": "mocked gemini"}',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
      })
    }
  }))
}));

// Mock global fetch for OpenRouter
global.fetch = vi.fn();

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
      expect(config.models).toContain('gemini-2.5-flash');
    });
  });

  describe('Client-Usability Check', () => {
    it('does not advertise Gemini as usable in the browser-only release', () => {
      expect(isProviderClientUsable('groq')).toBe(true);
      expect(isProviderClientUsable('openrouter')).toBe(false);
      expect(isProviderClientUsable('gemini')).toBe(false);
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

    it('does not silently send candidate data to another provider when the selected provider fails', async () => {
      const manager = new ProviderManager();
      manager.init();
      manager.setSelectedProvider('groq');

      const apiKeys = { groq: 'key-g', openrouter: 'key-o', gemini: 'key-m' };
      const { callGroqChat } = await import('../services/groqService');
      (callGroqChat as any).mockRejectedValueOnce(new Error('Groq Down'));

      await expect(manager.attemptChat('sys', 'candidate data', apiKeys)).rejects.toThrow('Groq Down');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(manager.getSelectedProvider()).toBe('groq');
    });
  });

  describe('GroqProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new GroqProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('successful availability check', async () => {
      const provider = new GroqProvider();
      const state = await provider.checkAvailability('test-key');
      expect(state.status).toBe('available');
      expect(state.modelInUse).toBeDefined();
    });

    it('requires API key for chat', async () => {
      const provider = new GroqProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('Groq API key is required');
    });
    
    it('successful chat call', async () => {
      const provider = new GroqProvider();
      const result = await provider.callChat('sys', 'user', 'test-key');
      expect(result.content).toBe('{"response": "mocked groq"}');
    });
  });

  describe('OpenRouterProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new OpenRouterProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('successful availability check', async () => {
      const provider = new OpenRouterProvider();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'model-1' }] })
      });
      const state = await provider.checkAvailability('test-key');
      expect(state.status).toBe('available');
    });

    it('requires API key for chat', async () => {
      const provider = new OpenRouterProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('OpenRouter API key is required');
    });

    it('successful chat call', async () => {
      const provider = new OpenRouterProvider();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'openrouter chat' } }],
          model: 'openrouter-model'
        })
      });
      const result = await provider.callChat('sys', 'user', 'test-key');
      expect(result.content).toBe('openrouter chat');
    });
  });

  describe('GeminiProvider', () => {
    it('requires API key for availability check', async () => {
      const provider = new GeminiProvider();
      const state = await provider.checkAvailability('');
      expect(state.status).toBe('error');
      expect(state.errorMessage).toContain('API key is required');
    });

    it('successful availability check', async () => {
      const provider = new GeminiProvider();
      const state = await provider.checkAvailability('test-key');
      expect(state.status).toBe('available');
    });

    it('requires API key for chat', async () => {
      const provider = new GeminiProvider();
      await expect(provider.callChat('sys', 'user', '')).rejects.toThrow('Gemini API key is required');
    });

    it('successful chat call', async () => {
      const provider = new GeminiProvider();
      const result = await provider.callChat('sys', 'user', 'test-key');
      expect(result.content).toBe('{"response": "mocked gemini"}');
    });
  });
});
