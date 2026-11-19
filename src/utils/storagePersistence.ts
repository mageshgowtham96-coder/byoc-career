import type { CareerApplicationFormState } from '../types';

/**
 * In-memory Storage Shim used when localStorage is disabled (private browsing, restrictive security policies)
 */
class MemoryStorageShim implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryStorageInstance = new MemoryStorageShim();

/**
 * Checks whether native localStorage is accessible without throwing security/quota exceptions
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    const testKey = '__byoc_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves active storage engine (native localStorage or in-memory fallback)
 */
export function getActiveStorage(): { storage: Storage; isMemoryFallback: boolean } {
  if (isLocalStorageAvailable()) {
    return { storage: window.localStorage, isMemoryFallback: false };
  }
  return { storage: memoryStorageInstance, isMemoryFallback: true };
}

export interface StorageResult<T> {
  success: boolean;
  data: T;
  error?: string;
  recoveredFromFallback?: boolean;
  isMemoryFallback?: boolean;
}

/**
 * Known BYOC local storage cache and draft keys
 */
export const BYOC_STORAGE_KEYS = [
  'byoc_career_form_draft',
  'byoc_temp_preview',
  'byoc_recent_search_cache',
  'byoc_draft_snapshot_raw',
  '__byoc_storage_probe__'
] as const;

/**
 * Robust reset/clear utility to wipe cached form data and reset local storage to initial states
 */
export function wipeCachedFormData(options: { wipeAllKeys?: boolean } = {}): {
  success: boolean;
  clearedKeys: string[];
} {
  const { storage } = getActiveStorage();
  const cleared: string[] = [];

  try {
    if (options.wipeAllKeys) {
      BYOC_STORAGE_KEYS.forEach((k) => {
        try {
          storage.removeItem(k);
          cleared.push(k);
        } catch {
          // ignore
        }
      });
    } else {
      storage.removeItem('byoc_career_form_draft');
      cleared.push('byoc_career_form_draft');
    }

    return { success: true, clearedKeys: cleared };
  } catch (err) {
    console.error('[BYOC Storage] Failed to wipe cached form data:', err);
    return { success: false, clearedKeys: cleared };
  }
}

/**
 * Complete workspace hard-reset utility (wipes draft + transient caches)
 */
export function resetAllByocLocalStorage(): { success: boolean; clearedCount: number } {
  const { storage } = getActiveStorage();
  let clearedCount = 0;

  try {
    const allKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.startsWith('byoc_') || key.includes('byoc'))) {
        allKeys.push(key);
      }
    }

    allKeys.forEach((key) => {
      try {
        storage.removeItem(key);
        clearedCount++;
      } catch {
        // ignore
      }
    });

    return { success: true, clearedCount };
  } catch (err) {
    console.error('[BYOC Storage] Error resetting BYOC storage:', err);
    return { success: false, clearedCount };
  }
}

/**
 * Safely reads and parses data with corrupted JSON recovery and disabled storage fallback
 */
export function safeGetItem<T>(key: string, fallbackDefault: T): StorageResult<T> {
  const { storage, isMemoryFallback } = getActiveStorage();

  try {
    const raw = storage.getItem(key);
    if (
      raw === null ||
      raw === undefined ||
      raw === '' ||
      raw === 'undefined' ||
      raw === 'null' ||
      raw === '[object Object]'
    ) {
      return { success: true, data: fallbackDefault, isMemoryFallback };
    }

    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) {
      return { success: true, data: fallbackDefault, isMemoryFallback };
    }

    return { success: true, data: parsed as T, isMemoryFallback };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'JSON parse failure';
    console.warn(`[BYOC Storage] Corrupted or invalid payload for key "${key}". Purging damaged entry:`, errMsg);

    try {
      storage.removeItem(key);
    } catch {
      // Ignore removal failure
    }

    return {
      success: false,
      data: fallbackDefault,
      error: `Corrupted state purged: ${errMsg}`,
      recoveredFromFallback: true,
      isMemoryFallback
    };
  }
}

/**
 * Safely serializes data to storage with quota-exceeded eviction and in-memory fallback
 */
export function safeSetItem<T>(key: string, value: T): { success: boolean; error?: string; isMemoryFallback?: boolean } {
  const { storage, isMemoryFallback } = getActiveStorage();

  try {
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    return { success: true, isMemoryFallback };
  } catch (err: unknown) {
    // Check if error is QuotaExceededError across browser engines
    const isQuotaExceeded =
      err instanceof DOMException &&
      (err.code === 22 ||
        err.code === 1014 ||
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    if (isQuotaExceeded && !isMemoryFallback) {
      console.warn(`[BYOC Storage] QuotaExceededError triggered for key "${key}". Running cache eviction...`);

      try {
        // Eviction strategy: prune non-critical transient caches first
        const transientKeys = ['byoc_temp_preview', 'byoc_recent_search_cache', 'byoc_draft_snapshot_raw'];
        for (const k of transientKeys) {
          storage.removeItem(k);
        }

        // Retry saving after eviction
        const serialized = JSON.stringify(value);
        storage.setItem(key, serialized);
        return { success: true, isMemoryFallback: false };
      } catch (retryErr) {
        // As a last-resort fallback when physical storage is full, store into memory storage
        try {
          memoryStorageInstance.setItem(key, JSON.stringify(value));
          console.warn(`[BYOC Storage] Persisted to memory storage fallback after quota exhaustion.`);
          return { success: true, isMemoryFallback: true };
        } catch {
          const msg = retryErr instanceof Error ? retryErr.message : 'Storage quota exhausted';
          return { success: false, error: `Browser storage quota full: ${msg}`, isMemoryFallback: false };
        }
      }
    }

    const msg = err instanceof Error ? err.message : 'Unknown storage write error';
    return { success: false, error: msg, isMemoryFallback };
  }
}

/**
 * Safely removes a key from active storage
 */
export function safeRemoveItem(key: string): void {
  const { storage } = getActiveStorage();
  try {
    storage.removeItem(key);
  } catch (err) {
    console.warn(`[BYOC Storage] Error removing key "${key}":`, err);
  }
}

/**
 * Deep sanitization function that ensures 100% null/undefined safety on initial state restoration
 */
export function sanitizeCareerFormState(raw: unknown): CareerApplicationFormState {
  const initial: CareerApplicationFormState = {
    personalDetails: { fullName: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    professionalSummary: '',
    workExperience: [],
    skills: [],
    education: [],
    isAutoFilled: false,
    lastExtractedTimestamp: null,
    rawSourceText: '',
    targetRole: '',
    currentRole: '',
    roleFamily: 'general',
    experienceLevel: 'Unspecified',
    sourceLanguage: 'English',
    sourceLanguageOther: '',
    translatedToEnglish: false,
    originalLanguageSnapshot: '',
    projects: [],
    certifications: [],
    additionalEvidence: []
  };

  if (!raw || typeof raw !== 'object') {
    return initial;
  }

  const r = raw as Record<string, unknown>;
  const personal = (r.personalDetails || r.personal_details || {}) as Record<string, unknown>;

  const experiences = (Array.isArray(r.workExperience)
    ? r.workExperience
    : Array.isArray(r.work_experience)
    ? r.work_experience
    : []).filter((item) => item && typeof item === 'object');

  const education = Array.isArray(r.education)
    ? r.education.filter((item) => item && typeof item === 'object')
    : [];
  const projects = Array.isArray(r.projects)
    ? r.projects.filter((project) => project && typeof project === 'object')
    : [];
  const certifications = Array.isArray(r.certifications)
    ? r.certifications.filter((certification) => certification && typeof certification === 'object')
    : [];
  const additionalEvidence = Array.isArray(r.additionalEvidence)
    ? r.additionalEvidence.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 100)
    : [];
  const skills = Array.isArray(r.skills)
    ? r.skills.map((s) => String(s ?? '').trim()).filter(Boolean)
    : [];

  return {
    personalDetails: {
      fullName: String(personal.fullName ?? personal.full_name ?? '').trim(),
      email: String(personal.email ?? '').trim(),
      phone: String(personal.phone ?? '').trim(),
      location: String(personal.location ?? '').trim(),
      linkedin: String(personal.linkedin ?? '').trim(),
      github: String(personal.github ?? '').trim(),
      portfolio: String(personal.portfolio ?? '').trim()
    },
    professionalSummary: String(r.professionalSummary ?? r.professional_summary ?? '').trim(),
    workExperience: experiences.map((exp: unknown, idx: number) => {
      const e = (exp && typeof exp === 'object' ? exp : {}) as Record<string, unknown>;
      const responsibilities = Array.isArray(e.keyResponsibilities)
        ? e.keyResponsibilities
        : Array.isArray(e.key_responsibilities)
        ? e.key_responsibilities
        : [];
      return {
        id: String(e.id || `exp-${idx}`),
        company: String(e.company ?? '').trim(),
        role: String(e.role ?? '').trim(),
        duration: String(e.duration ?? '').trim(),
        keyResponsibilities: responsibilities.map((k) => String(k ?? '').trim()).filter(Boolean),
        startDate: String(e.startDate ?? '').trim(),
        endDate: String(e.endDate ?? '').trim(),
        location: String(e.location ?? '').trim(),
        isCurrent: Boolean(e.isCurrent)
      };
    }),
    skills: Array.from(new Set(skills)),
    education: education.map((edu: unknown, idx: number) => {
      const ed = (edu && typeof edu === 'object' ? edu : {}) as Record<string, unknown>;
      return {
        id: String(ed.id || `edu-${idx}`),
        degree: String(ed.degree ?? '').trim(),
        institution: String(ed.institution ?? '').trim(),
        year: String(ed.year ?? '').trim(),
        field: String(ed.field ?? '').trim(),
        gpa: String(ed.gpa ?? '').trim()
      };
    }),
    isAutoFilled: Boolean(r.isAutoFilled),
    lastExtractedTimestamp: r.lastExtractedTimestamp ? String(r.lastExtractedTimestamp) : null,
    rawSourceText: String(r.rawSourceText ?? ''),
    targetRole: String(r.targetRole ?? '').trim(),
    currentRole: String(r.currentRole ?? '').trim(),
    roleFamily: String(r.roleFamily ?? 'general').trim() || 'general',
    experienceLevel: String(r.experienceLevel ?? 'Unspecified').trim() || 'Unspecified',
    sourceLanguage: String(r.sourceLanguage ?? 'English').trim() || 'English',
    sourceLanguageOther: String(r.sourceLanguageOther ?? '').trim(),
    translatedToEnglish: Boolean(r.translatedToEnglish),
    originalLanguageSnapshot: String(r.originalLanguageSnapshot ?? ''),
    projects: projects.map((project: unknown, idx: number) => {
      const p = project as Record<string, unknown>;
      return {
        id: String(p.id || `project-${idx}`),
        title: String(p.title ?? '').trim(),
        description: String(p.description ?? '').trim(),
        technologies: Array.isArray(p.technologies)
          ? p.technologies.map((technology) => String(technology ?? '').trim()).filter(Boolean)
          : [],
        ...(typeof p.link === 'string' && p.link.trim() ? { link: p.link.trim() } : {})
      };
    }),
    additionalEvidence,
    certifications: certifications.map((certification: unknown, idx: number) => {
      const c = certification as Record<string, unknown>;
      return {
        id: String(c.id || `certification-${idx}`),
        name: String(c.name ?? '').trim(),
        issuer: String(c.issuer ?? '').trim(),
        issueDate: String(c.issueDate ?? '').trim()
      };
    })
  };
}

/**
 * Cross-tab and window synchronization listener
 */
export function subscribeToStorageKey<T>(
  key: string,
  callback: (newValue: T | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === key) {
      if (event.newValue === null) {
        callback(null);
      } else {
        try {
          callback(JSON.parse(event.newValue) as T);
        } catch {
          callback(null);
        }
      }
    }
  };

  window.addEventListener('storage', handleStorageEvent);
  return () => window.removeEventListener('storage', handleStorageEvent);
}
