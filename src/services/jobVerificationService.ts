import type {
  JobPosting,
  JobVerificationEvidence,
  JobVerificationProvider
} from '../types';

export interface GreenhousePostingLocator {
  boardToken: string;
  jobId: string;
}

interface GreenhouseJobRecord {
  id?: string | number;
  title?: string;
  company_name?: string;
  first_published?: string;
  updated_at?: string;
  application_deadline?: string;
  absolute_url?: string;
}

const GREENHOUSE_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseGreenhouseJobUrl(rawUrl: string): GreenhousePostingLocator | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let boardToken = '';
  let jobId = '';

  if (host === 'boards-api.greenhouse.io') {
    if (segments[0] !== 'v1' || segments[1] !== 'boards' || segments[3] !== 'jobs') return null;
    boardToken = segments[2] || '';
    jobId = segments[4] || '';
  } else if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const jobsIndex = segments.indexOf('jobs');
    if (jobsIndex < 1) return null;
    boardToken = segments[jobsIndex - 1] || '';
    jobId = segments[jobsIndex + 1] || '';
  } else {
    return null;
  }

  if (!/^[a-z0-9_-]+$/i.test(boardToken) || !/^\d+$/.test(jobId)) return null;
  return { boardToken, jobId };
}

function identifyProvider(rawUrl: string): JobVerificationProvider {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === 'jobs.lever.co' || host.endsWith('.lever.co')) return 'lever';
    if (host === 'jobs.ashbyhq.com') return 'ashby';
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) return 'workday';
    if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (host.includes('greenhouse.io')) return 'greenhouse';
  } catch {
    // An invalid URL is handled as an unsupported source below.
  }
  return 'unsupported';
}

export function scanJobRiskSignals(job: Pick<JobPosting, 'jobDescriptionRaw'>): string[] {
  const description = String(job.jobDescriptionRaw || '');
  const flags: string[] = [];

  const feeSentences = description
    .split(/[.!?\n]+/)
    .filter((sentence) =>
      /\b(application|registration|training|processing)\s+fees?\b|\bsecurity\s+deposits?\b|\bpay\s+(?:an?\s+)?fees?\b|\bpay\s+to\s+apply\b/i.test(sentence) &&
      !/\b(no|never|not)\b.{0,35}\b(fees?|deposits?|payment)\b/i.test(sentence)
    );
  if (feeSentences.length) {
    flags.push('The description mentions an application/training fee or deposit. Legitimate employers should not require payment to apply.');
  }

  if (/\b(bank account details|bank details|credit card number|gift card|crypto wallet|wallet address)\b/i.test(description)) {
    flags.push('The description requests financial or payment details. Do not share bank, card, gift-card, or crypto information during recruitment.');
  }

  if (/\b(whatsapp|telegram)\b/i.test(description)) {
    flags.push('The description mentions WhatsApp or Telegram. Verify the recruiter through the employer’s official website and email domain.');
  }

  if (/\b[A-Z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|protonmail)\.[A-Z]{2,}\b/i.test(description)) {
    flags.push('The description includes a consumer email address. Cross-check the contact through the employer’s official careers site.');
  }

  return [...new Set(flags)];
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fetchGreenhousePosting(boardToken: string, jobId: string): Promise<GreenhouseJobRecord> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.head) {
      reject(new Error('Public ATS verification requires a browser session.'));
      return;
    }

    const callbackName = `byocGreenhouse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const callbackRegistry = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      script.onerror = null;
      script.remove();
      delete callbackRegistry[callbackName];
    };

    callbackRegistry[callbackName] = (payload: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!isRecord(payload)) {
        reject(new Error('Greenhouse returned an invalid public posting record.'));
        return;
      }
      resolve(payload as GreenhouseJobRecord);
    };

    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Could not reach the public Greenhouse posting endpoint.'));
    };

    script.src =
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(jobId)}?callback=${callbackName}`;

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('The public Greenhouse posting check timed out.'));
    }, GREENHOUSE_TIMEOUT_MS);

    document.head.appendChild(script);
  });
}

function createEvidence(
  job: JobPosting,
  status: JobVerificationEvidence['status'],
  provider: JobVerificationProvider,
  checkedAt: string,
  explanation: string,
  extras: Partial<JobVerificationEvidence> = {}
): JobVerificationEvidence {
  return {
    status,
    provider,
    checkedAt,
    explanation,
    riskFlags: scanJobRiskSignals(job),
    employerIdentityVerified: false,
    ...extras
  };
}

/**
 * Checks only for a matching public Greenhouse posting record. It does not
 * authenticate an employer or certify that an offer is legitimate.
 */
export async function verifyJobPosting(
  job: JobPosting,
  now: Date = new Date()
): Promise<JobVerificationEvidence> {
  const checkedAt = now.toISOString();
  const locator = parseGreenhouseJobUrl(job.url);

  if (!locator) {
    const provider = identifyProvider(job.url);
    const providerLabel = provider === 'unsupported' ? 'This job source' : `The ${provider} job board`;
    return createEvidence(
      job,
      'manual_review',
      provider,
      checkedAt,
      `${providerLabel} is not automatically checked by BYOC. Open the employer's official careers page and compare the role, company, location, and application link manually.`
    );
  }

  const evidenceUrl =
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(locator.boardToken)}/jobs/${encodeURIComponent(locator.jobId)}`;

  try {
    const record = await fetchGreenhousePosting(locator.boardToken, locator.jobId);
    if (!record.id || String(record.id) !== locator.jobId) {
      return createEvidence(
        job,
        'not_found',
        'greenhouse',
        checkedAt,
        'The public Greenhouse board did not return this exact posting ID.',
        { boardToken: locator.boardToken, postingId: locator.jobId, evidenceUrl }
      );
    }

    const officialTitle = String(record.title || '').trim();
    const officialCompany = String(record.company_name || '').trim();
    const extras = {
      boardToken: locator.boardToken,
      postingId: String(record.id),
      officialTitle,
      officialCompany,
      firstPublishedAt: record.first_published,
      updatedAt: record.updated_at,
      applicationDeadline: record.application_deadline,
      evidenceUrl
    };

    if (!officialTitle || !officialCompany) {
      return createEvidence(
        job,
        'manual_review',
        'greenhouse',
        checkedAt,
        'The public posting ID exists, but the ATS response did not include enough title/company information for a safe match.',
        extras
      );
    }

    const titleMatches = normalizeComparisonText(officialTitle) === normalizeComparisonText(job.title);
    const companyMatches = normalizeComparisonText(officialCompany) === normalizeComparisonText(job.company);

    if (!titleMatches || !companyMatches) {
      return createEvidence(
        job,
        'mismatch',
        'greenhouse',
        checkedAt,
        'A public Greenhouse record exists, but its title or company differs from the imported listing. Review the official record before applying.',
        extras
      );
    }

    const deadlineTime = record.application_deadline ? Date.parse(record.application_deadline) : Number.NaN;
    if (Number.isFinite(deadlineTime) && deadlineTime < now.getTime()) {
      return createEvidence(
        job,
        'expired',
        'greenhouse',
        checkedAt,
        'The public Greenhouse record matches, but its stated application deadline has passed.',
        extras
      );
    }

    return createEvidence(
      job,
      'confirmed',
      'greenhouse',
      checkedAt,
      'The exact public Greenhouse posting ID was found and its title and company match. This confirms a public ATS record only; it does not verify employer identity or prove that applications are still being accepted.',
      extras
    );
  } catch {
    return createEvidence(
      job,
      'check_failed',
      'greenhouse',
      checkedAt,
      'BYOC could not complete the public Greenhouse check because of a network, browser, or timeout error. Try again later or review the official posting manually.',
      {
        boardToken: locator.boardToken,
        postingId: locator.jobId,
        evidenceUrl
      }
    );
  }
}
