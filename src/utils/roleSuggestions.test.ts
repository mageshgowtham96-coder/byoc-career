import { describe, expect, it } from 'vitest';
import { getRoleSuggestions } from './roleSuggestions';

describe('getRoleSuggestions', () => {
  it('suggests fraud-related roles for a partial keyword', () => {
    const suggestions = getRoleSuggestions('fraud');
    expect(suggestions).toContain('Fraud Analyst');
    expect(suggestions).toContain('Fraud Operations Analyst');
    expect(suggestions.length).toBeLessThanOrEqual(7);
  });

  it('supports multiple tokens without requiring an exact phrase', () => {
    expect(getRoleSuggestions('transaction mon')).toContain('Transaction Monitoring Analyst');
  });

  it('does not suggest for a single character and preserves arbitrary user input', () => {
    expect(getRoleSuggestions('f')).toEqual([]);
    expect(getRoleSuggestions('unlisted niche title')).toEqual([]);
  });

  it('returns a bounded list', () => {
    expect(getRoleSuggestions('analyst', 3)).toHaveLength(3);
  });
});
