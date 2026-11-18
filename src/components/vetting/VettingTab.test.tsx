import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VettingTab } from './VettingTab';
import { useWizardStore } from '../../store/useWizardStore';
import { vetJobWithGroq } from '../../services/groqService';
import type { JobPosting } from '../../types';

vi.mock('../../store/useWizardStore', () => ({ useWizardStore: vi.fn() }));
vi.mock('../../services/groqService', () => ({
  vetJobWithGroq: vi.fn(),
  formatGroqError: vi.fn(() => 'Vetting failed')
}));

const job = {
  id: 'job-1',
  title: 'Support Analyst',
  company: 'Example Employer',
  location: 'India',
  workplaceType: 'Remote',
  salary: '',
  postedDate: '',
  jobDescriptionRaw: 'A sample job description.',
  url: 'https://example.com/careers/role',
  source: 'User Import',
  skillsRequired: [],
  fitScore: null,
  matchedKeywords: [],
  missingKeywords: [],
  experienceLevel: 'Unspecified'
} as JobPosting;

describe('VettingTab privacy gate', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(useWizardStore).mockReturnValue({
      activeTab: 'vetting',
      selectedJobId: job.id,
      jobs: [job],
      masterResume: null,
      updateJobVetting: vi.fn(),
      groqApiKey: 'test-groq-key',
      setActiveTab: vi.fn(),
      addToast: vi.fn()
    } as never);
    vi.mocked(vetJobWithGroq).mockResolvedValue({
      recommendation: 'Selective Apply'
    } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not send job or candidate data to Groq until the user explicitly starts the audit', async () => {
    await act(async () => {
      root.render(<VettingTab />);
    });

    expect(vetJobWithGroq).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Run AI Vetting');

    const runButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Run AI Vetting')
    );
    expect(runButton).toBeTruthy();

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(vetJobWithGroq).toHaveBeenCalledTimes(1);
  });
});
