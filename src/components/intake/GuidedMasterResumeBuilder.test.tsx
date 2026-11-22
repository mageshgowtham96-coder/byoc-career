import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedMasterResumeBuilder } from './GuidedMasterResumeBuilder';
import { translateCareerDraftToEnglish } from '../../services/careerTranslationService';
import { sanitizeCareerFormState } from '../../utils/storagePersistence';
import type { CareerApplicationFormState } from '../../types';

vi.mock('../../services/careerTranslationService', () => ({
  translateCareerDraftToEnglish: vi.fn()
}));
vi.mock('../../services/groqService', () => ({
  formatGroqError: vi.fn(() => 'Translation failed')
}));

describe('GuidedMasterResumeBuilder privacy and translation flow', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onDraftChange: ReturnType<typeof vi.fn>;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  const initialDraft = sanitizeCareerFormState({
    personalDetails: { fullName: 'Asha' },
    targetRole: 'Data Analyst',
    currentRole: 'Reporting Intern',
    roleFamily: 'data-analytics',
    experienceLevel: 'Entry',
    sourceLanguage: 'Tamil',
    professionalSummary: 'தரவை ஆராய விரும்புகிறேன்.',
    workExperience: [{
      id: 'exp-1',
      company: 'ABC Technologies',
      role: 'தரவு பயிற்சியாளர்',
      duration: '2024–Present',
      keyResponsibilities: ['வாராந்திர அறிக்கைகளை உருவாக்கினேன்']
    }]
  });

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onDraftChange = vi.fn();
    onComplete = vi.fn();
    onCancel = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('does not call Groq when the builder opens; translation requires an explicit click', async () => {
    const translatedDraft: CareerApplicationFormState = {
      ...initialDraft,
      targetRole: 'Data Analyst',
      professionalSummary: 'I enjoy analysing data.',
      translatedToEnglish: true
    };
    vi.mocked(translateCareerDraftToEnglish).mockResolvedValue(translatedDraft);

    await act(async () => {
      root.render(
        <GuidedMasterResumeBuilder
          initialDraft={initialDraft}
          groqApiKey="test-key"
          onDraftChange={onDraftChange}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
    });

    expect(translateCareerDraftToEnglish).not.toHaveBeenCalled();
    expect(container.textContent).toContain('may still be sent');
    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue')
    );
    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('What data did you work with');

    const translateButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Translate to English')
    );
    expect(translateButton).toBeTruthy();

    await act(async () => {
      translateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(translateCareerDraftToEnglish).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Review English translation');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('autosaves the draft through the existing encrypted-store callback', async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(
        <GuidedMasterResumeBuilder
          initialDraft={initialDraft}
          groqApiKey=""
          onDraftChange={onDraftChange}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(onDraftChange).toHaveBeenCalledWith(initialDraft);
  });

  it('stages a profile only after the user reaches the final review and confirms creation', async () => {
    await act(async () => {
      root.render(
        <GuidedMasterResumeBuilder
          initialDraft={initialDraft}
          groqApiKey=""
          onDraftChange={onDraftChange}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
    });

    for (let index = 0; index < 4; index += 1) {
      const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Continue')
      );
      await act(async () => {
        continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Master Resume draft')
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0].contactInfo.name).toBe('Asha');
    expect(onComplete.mock.calls[0][0].headline).toBe('Data Analyst');
  });

  it('keeps the translation as a preview until the user accepts it', async () => {
    const translatedDraft: CareerApplicationFormState = {
      ...initialDraft,
      professionalSummary: 'I enjoy analysing data.',
      translatedToEnglish: true
    };
    vi.mocked(translateCareerDraftToEnglish).mockResolvedValue(translatedDraft);

    await act(async () => {
      root.render(
        <GuidedMasterResumeBuilder
          initialDraft={initialDraft}
          groqApiKey="test-key"
          onDraftChange={onDraftChange}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      );
    });

    const translateButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Translate to English')
    );
    await act(async () => {
      translateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const acceptButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Use English translation')
    );
    expect(acceptButton).toBeTruthy();

    await act(async () => {
      acceptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Review English translation');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
