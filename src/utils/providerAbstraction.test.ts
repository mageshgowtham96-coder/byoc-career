import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderManager, ProviderUtils, PROVIDER_CONFIGS, getProviderConfig, isProviderClientUsable } from './providerAbstraction';

describe('Provider Abstraction', () => {
  beforeEach(() => {
    // Reset provider manager state
    const manager = new ProviderManager();
    manager.init();
  });

  describe('Provider Configurations', () => {
    it('groq config exists with expected models', () => {
      const config = getProviderConfig('groq');
      expect(config.name).toBe('Groq');
      expect(Array.isArray(config.models)).toBe(true);
      expect(config.models.length).toBeGreaterThan(0);
    });

    it('gemini config has clientSideDisabled true', () => {
      const config = getProviderConfig('gemini');
      expect(config.clientSideDisabled).toBe(true);
    });

    it('openrouter config has models list', () => {
      const config = getProviderConfig('openrouter');
      expect(Array.isArray(config.models)).toBe(true);
    });
  });

  describe('Client-Usability Check', () => {
    it('gemini is not client-usable', () => {
      expect(isProviderClientUsable('gemini')).toBe(false);
    });

    it('groq is client-usable', () => {
      expect(isProviderClientUsable('groq')).toBe(true);
    });

    it('openrouter is client-usable', () => {
      expect(isProviderClientUsable('openrouter')).toBe(true);
    });
  });

  describe('ProviderManager', () => {
    it('initializes all providers', () => {
      const manager = new ProviderManager();
      manager.init();
      expect(manager.providers.size).toBe(3); // groq, openrouter, gemini
    });

    it('getProvider retrieves a provider', () => {
      const manager = new ProviderManager();
      manager.init();
      const groqProvider = manager.getProvider('groq');
      expect(groqProvider).toBeDefined();
      expect(groqProvider?.name).toBe('Groq');
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
});