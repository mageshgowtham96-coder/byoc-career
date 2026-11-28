import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderManager, GeminiProvider, PROVIDER_CONFIGS, getProviderConfig, isProviderClientUsable } from './providerAbstraction';

const { getAvailableGeminiModels, callGeminiChat } = vi.hoisted(() => ({
  getAvailableGeminiModels: vi.fn(),
  callGeminiChat: vi.fn()
}));

vi.mock('../services/geminiService', () => ({
  getAvailableGeminiModels,
  callGeminiChat
}));

describe('Gemini-only provider abstraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailableGeminiModels.mockResolvedValue(['gemini-2.5-flash']);
    callGeminiChat.mockResolvedValue('{"response":"Gemini response"}');
  });

  it('exposes only the Gemini 2.5 Flash configuration', () => {
    expect(Object.keys(PROVIDER_CONFIGS)).toEqual(['gemini']);
    expect(getProviderConfig()).toEqual({
      name: 'Gemini',
      models: ['gemini-2.5-flash'],
      timeoutMs: 45000
    });
    expect(isProviderClientUsable('gemini')).toBe(true);
  });

  it('initializes and returns the sole Gemini provider', () => {
    const manager = new ProviderManager();
    manager.init();

    expect(manager.getProvider()).toBeInstanceOf(GeminiProvider);
    expect(manager.getSelectedProvider()).toBe('gemini');
    expect(manager.getProvider('gemini')).toBeDefined();
  });

  it('keeps Gemini selected when explicitly selected', () => {
    const manager = new ProviderManager();
    manager.setSelectedProvider('gemini');
    expect(manager.getSelectedProvider()).toBe('gemini');
    manager.setSelectedProvider(null);
    expect(manager.getSelectedProvider()).toBeNull();
  });

  it('checks availability through Gemini and returns its state', async () => {
    const manager = new ProviderManager();
    const states = await manager.checkAllProviders({ gemini: 'test-key' });

    expect(getAvailableGeminiModels).toHaveBeenCalledWith('test-key');
    expect(states.size).toBe(1);
    expect(states.get('gemini')?.status).toBe('available');
    expect(states.get('gemini')?.modelInUse).toBe('gemini-2.5-flash');
  });

  it('routes chat directly to Gemini without provider fallback', async () => {
    const manager = new ProviderManager();
    const result = await manager.attemptChat('system prompt', 'user prompt', { gemini: 'test-key' });

    expect(callGeminiChat).toHaveBeenCalledWith('system prompt', 'user prompt', 'test-key');
    expect(result).toEqual({
      content: '{"response":"Gemini response"}',
      model: 'gemini-2.5-flash',
      provider: 'gemini'
    });
  });

  it('propagates Gemini request failures rather than silently switching providers', async () => {
    const manager = new ProviderManager();
    callGeminiChat.mockRejectedValueOnce(new Error('Gemini unavailable'));

    await expect(manager.attemptChat('system', 'user', { gemini: 'test-key' }))
      .rejects.toThrow('Gemini unavailable');
    expect(callGeminiChat).toHaveBeenCalledTimes(1);
  });

  it('requires an API key for the provider availability check', async () => {
    const provider = new GeminiProvider();
    const state = await provider.checkAvailability('');

    expect(state.status).toBe('error');
    expect(state.errorMessage).toContain('Gemini API key is required');
    expect(getAvailableGeminiModels).not.toHaveBeenCalled();
  });

  it('returns the Gemini completion through the provider adapter', async () => {
    const provider = new GeminiProvider();
    const result = await provider.callChat('system', 'user', 'test-key');

    expect(result).toEqual({
      content: '{"response":"Gemini response"}',
      model: 'gemini-2.5-flash',
      finishReason: 'stop'
    });
  });
});
