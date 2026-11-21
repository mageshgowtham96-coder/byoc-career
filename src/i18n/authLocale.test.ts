import { describe, expect, it, vi } from 'vitest';
import { AUTH_LOCALE_STORAGE_KEY, persistStoredAuthLocale, readStoredAuthLocale, translateUiText } from './authLocale';

describe('app-wide language preference', () => {
  it('restores the language selected on the local auth screen', () => {
    const storage = { getItem: vi.fn().mockReturnValue('ta') };
    expect(readStoredAuthLocale(storage)).toBe('ta');
    expect(storage.getItem).toHaveBeenCalledWith(AUTH_LOCALE_STORAGE_KEY);
  });
  it('falls back to English for missing, invalid or inaccessible preferences', () => {
    expect(readStoredAuthLocale({ getItem: () => null })).toBe('en');
    expect(readStoredAuthLocale({ getItem: () => 'not-a-language' })).toBe('en');
    expect(readStoredAuthLocale({ getItem: () => { throw new Error('storage blocked'); } })).toBe('en');
  });
  it('persists the chosen language without making storage availability a requirement', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    persistStoredAuthLocale('ta', storage);
    expect(storage.setItem).toHaveBeenCalledWith(AUTH_LOCALE_STORAGE_KEY, 'ta');
    expect(() => persistStoredAuthLocale('ta', { setItem: () => { throw new Error('storage blocked'); } })).not.toThrow();
  });
  it('translates mapped Tamil labels and leaves unmapped labels readable in English', () => {
    expect(translateUiText('ta', 'Dashboard')).toBe('முகப்பு');
    expect(translateUiText('ta', 'Other career evidence')).toBe('பிற தொழில் ஆதாரங்கள்');
    expect(translateUiText('ta', 'Choose PDF')).toBe('PDF-ஐத் தேர்ந்தெடுக்கவும்');
    expect(translateUiText('ta', 'Emergency Recovery Phrase Generated')).toBe('மீட்பு சொற்றொடர் உருவாக்கப்பட்டது');
    expect(translateUiText('ta', 'A label not translated yet')).toBe('A label not translated yet');
  });
});