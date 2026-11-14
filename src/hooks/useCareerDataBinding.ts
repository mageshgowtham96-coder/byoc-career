import { useState, useCallback } from 'react';
import type {
  ByocStructuredApplicationData,
  CareerApplicationFormState,
  PersonalDetailsState,
  WorkExperienceStateItem,
  EducationStateItem,
  MasterResume,
  ExperienceItem,
  EducationItem as MasterEducationItem
} from '../types';
import { useWizardStore } from '../store/useWizardStore';

/**
 * Initial empty state conforming strictly to null-safe defaults
 */
export const INITIAL_CAREER_FORM_STATE: CareerApplicationFormState = {
  personalDetails: {
    fullName: '',
    email: '',
    phone: '',
    location: ''
  },
  professionalSummary: '',
  workExperience: [],
  skills: [],
  education: [],
  isAutoFilled: false,
  lastExtractedTimestamp: null,
  rawSourceText: ''
};

/**
 * Maps raw JSON extraction output to clean form state with defensive fallback values
 */
export function mapExtractionToFormState(
  payload?: Partial<ByocStructuredApplicationData> | null,
  rawSourceText: string = ''
): CareerApplicationFormState {
  if (!payload) {
    return { ...INITIAL_CAREER_FORM_STATE, rawSourceText };
  }

  const personal = payload.personal_details || {
    full_name: '',
    email: '',
    phone: '',
    location: ''
  };

  const experienceList: WorkExperienceStateItem[] = Array.isArray(payload.work_experience)
    ? payload.work_experience.map((exp, idx) => ({
        id: `exp-${Date.now()}-${idx}`,
        company: exp.company || '',
        role: exp.role || '',
        duration: exp.duration || '',
        keyResponsibilities: Array.isArray(exp.key_responsibilities)
          ? exp.key_responsibilities.filter(Boolean)
          : []
      }))
    : [];

  const educationList: EducationStateItem[] = Array.isArray(payload.education)
    ? payload.education.map((edu, idx) => ({
        id: `edu-${Date.now()}-${idx}`,
        degree: edu.degree || '',
        institution: edu.institution || '',
        year: edu.year || ''
      }))
    : [];

  const skillsList: string[] = Array.isArray(payload.skills)
    ? Array.from(new Set(payload.skills.map((s) => String(s).trim()).filter(Boolean)))
    : [];

  return {
    personalDetails: {
      fullName: personal.full_name || '',
      email: personal.email || '',
      phone: personal.phone || '',
      location: personal.location || ''
    },
    professionalSummary: payload.professional_summary || '',
    workExperience: experienceList,
    skills: skillsList,
    education: educationList,
    isAutoFilled: true,
    lastExtractedTimestamp: new Date().toISOString(),
    rawSourceText
  };
}

/**
 * Maps form state back into the strict BYOC Target JSON Schema
 */
export function mapFormStateToPayload(formState: CareerApplicationFormState): ByocStructuredApplicationData {
  return {
    personal_details: {
      full_name: formState.personalDetails.fullName.trim(),
      email: formState.personalDetails.email.trim(),
      phone: formState.personalDetails.phone.trim(),
      location: formState.personalDetails.location.trim()
    },
    professional_summary: formState.professionalSummary.trim(),
    work_experience: formState.workExperience.map((exp) => ({
      company: exp.company.trim(),
      role: exp.role.trim(),
      duration: exp.duration.trim(),
      key_responsibilities: exp.keyResponsibilities.map((r) => r.trim()).filter(Boolean)
    })),
    skills: formState.skills.map((s) => s.trim()).filter(Boolean),
    education: formState.education.map((edu) => ({
      degree: edu.degree.trim(),
      institution: edu.institution.trim(),
      year: edu.year.trim()
    }))
  };
}

/**
 * Maps form state into BYOC MasterResume model for persistent store synchronization
 */
export function mapFormStateToMasterResume(
  formState: CareerApplicationFormState,
  existingMaster?: MasterResume | null
): MasterResume {
  const experiences: ExperienceItem[] = formState.workExperience.map((w, idx) => {
    const parts = w.duration ? w.duration.split(/[-–to]/i).map((s) => s.trim()) : [];
    const startDate = parts[0] || '';
    const endDate = parts[1] || '';
    return {
      id: w.id || `exp-${idx}`,
      company: w.company.trim(),
      role: w.role.trim(),
      startDate,
      endDate,
      location: formState.personalDetails.location.trim(),
      isCurrent: /present|current|now/i.test(endDate),
      bullets: w.keyResponsibilities.map((b) => b.trim()).filter(Boolean)
    };
  });

  const education: MasterEducationItem[] = formState.education.map((edu, idx) => ({
    id: edu.id || `edu-${idx}`,
    degree: edu.degree.trim(),
    institution: edu.institution.trim(),
    field: '',
    gradYear: edu.year.trim()
  }));

  const totalWords =
    formState.professionalSummary.split(/\s+/).filter(Boolean).length +
    experiences.reduce((acc, e) => acc + e.bullets.join(' ').split(/\s+/).filter(Boolean).length, 0);

  return {
    rawText: formState.rawSourceText || formState.professionalSummary || '',
    contactInfo: {
      name: formState.personalDetails.fullName || '',
      email: formState.personalDetails.email || '',
      phone: formState.personalDetails.phone || '',
      location: formState.personalDetails.location || '',
      linkedin: existingMaster?.contactInfo.linkedin || '',
      github: existingMaster?.contactInfo.github || '',
      portfolio: existingMaster?.contactInfo.portfolio || ''
    },
    headline: formState.workExperience[0]?.role || existingMaster?.headline || '',
    summary: formState.professionalSummary || '',
    skills: {
      technical: formState.skills.length > 0 ? formState.skills : (existingMaster?.skills.technical || []),
      soft: existingMaster?.skills.soft || [],
      tools: existingMaster?.skills.tools || [],
      domains: existingMaster?.skills.domains || []
    },
    experiences: experiences.length > 0 ? experiences : (existingMaster?.experiences || []),
    education: education.length > 0 ? education : (existingMaster?.education || []),
    projects: existingMaster?.projects || [],
    certifications: existingMaster?.certifications || [],
    stats: {
      wordCount: totalWords,
      pageCount: totalWords > 0 ? Math.max(1, Math.ceil(totalWords / 450)) : 0,
      charCount: formState.professionalSummary.length,
      lastParsedDate: new Date().toISOString(),
      sourceFileName: existingMaster?.stats.sourceFileName || 'Form_Entry'
    }
  };
}

/**
 * Universal React hook for smooth data-binding, field reactivity, and auto-filling
 */
export function useCareerDataBinding(initialData?: Partial<ByocStructuredApplicationData>) {
  const [formState, setFormState] = useState<CareerApplicationFormState>(() =>
    initialData ? mapExtractionToFormState(initialData) : INITIAL_CAREER_FORM_STATE
  );

  const { updateMasterResume, setStagedParsedResume, addToast } = useWizardStore();

  /**
   * Auto-fills the entire form state smoothly from an extraction payload
   */
  const autoFillFromExtraction = useCallback(
    (payload: Partial<ByocStructuredApplicationData>, rawSourceText: string = '') => {
      const mapped = mapExtractionToFormState(payload, rawSourceText);
      setFormState(mapped);
      addToast({
        type: 'success',
        title: 'Career Data Auto-Filled',
        message: `Extracted ${mapped.workExperience.length} milestones, ${mapped.skills.length} skills, and contact details.`
      });
      return mapped;
    },
    [addToast]
  );

  /**
   * Updates a single personal details field smoothly
   */
  const updatePersonalDetail = useCallback((field: keyof PersonalDetailsState, value: string) => {
    setFormState((prev) => ({
      ...prev,
      personalDetails: {
        ...prev.personalDetails,
        [field]: value
      }
    }));
  }, []);

  /**
   * Updates professional summary
   */
  const updateProfessionalSummary = useCallback((summary: string) => {
    setFormState((prev) => ({
      ...prev,
      professionalSummary: summary
    }));
  }, []);

  /**
   * Updates a specific work experience item
   */
  const updateWorkExperience = useCallback(
    (index: number, field: keyof WorkExperienceStateItem, value: unknown) => {
      setFormState((prev) => {
        const nextExp = [...prev.workExperience];
        if (!nextExp[index]) return prev;
        nextExp[index] = {
          ...nextExp[index],
          [field]: value
        };
        return {
          ...prev,
          workExperience: nextExp
        };
      });
    },
    []
  );

  /**
   * Adds a new work experience milestone
   */
  const addWorkExperience = useCallback((item?: Partial<WorkExperienceStateItem>) => {
    const newItem: WorkExperienceStateItem = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      company: item?.company || '',
      role: item?.role || '',
      duration: item?.duration || '',
      keyResponsibilities: item?.keyResponsibilities || []
    };
    setFormState((prev) => ({
      ...prev,
      workExperience: [newItem, ...prev.workExperience]
    }));
  }, []);

  /**
   * Removes a work experience milestone
   */
  const removeWorkExperience = useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      workExperience: prev.workExperience.filter((_, i) => i !== index)
    }));
  }, []);

  /**
   * Adds a responsibility bullet to an experience item
   */
  const addKeyResponsibility = useCallback((expIndex: number, text: string) => {
    if (!text.trim()) return;
    setFormState((prev) => {
      const nextExp = [...prev.workExperience];
      if (!nextExp[expIndex]) return prev;
      nextExp[expIndex] = {
        ...nextExp[expIndex],
        keyResponsibilities: [...nextExp[expIndex].keyResponsibilities, text.trim()]
      };
      return {
        ...prev,
        workExperience: nextExp
      };
    });
  }, []);

  /**
   * Removes a responsibility bullet from an experience item
   */
  const removeKeyResponsibility = useCallback((expIndex: number, respIndex: number) => {
    setFormState((prev) => {
      const nextExp = [...prev.workExperience];
      if (!nextExp[expIndex]) return prev;
      nextExp[expIndex] = {
        ...nextExp[expIndex],
        keyResponsibilities: nextExp[expIndex].keyResponsibilities.filter((_, idx) => idx !== respIndex)
      };
      return {
        ...prev,
        workExperience: nextExp
      };
    });
  }, []);

  /**
   * Adds a skill tag
   */
  const addSkill = useCallback((skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed) return;
    setFormState((prev) => {
      if (prev.skills.includes(trimmed)) return prev;
      return {
        ...prev,
        skills: [...prev.skills, trimmed]
      };
    });
  }, []);

  /**
   * Removes a skill tag
   */
  const removeSkill = useCallback((skillToRemove: string) => {
    setFormState((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove)
    }));
  }, []);

  /**
   * Sets entire skill tags array
   */
  const setSkills = useCallback((skills: string[]) => {
    const unique = Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean)));
    setFormState((prev) => ({
      ...prev,
      skills: unique
    }));
  }, []);

  /**
   * Updates an education item
   */
  const updateEducation = useCallback(
    (index: number, field: keyof EducationStateItem, value: string) => {
      setFormState((prev) => {
        const nextEdu = [...prev.education];
        if (!nextEdu[index]) return prev;
        nextEdu[index] = {
          ...nextEdu[index],
          [field]: value
        };
        return {
          ...prev,
          education: nextEdu
        };
      });
    },
    []
  );

  /**
   * Adds an education item
   */
  const addEducation = useCallback((item?: Partial<EducationStateItem>) => {
    const newItem: EducationStateItem = {
      id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      degree: item?.degree || '',
      institution: item?.institution || '',
      year: item?.year || ''
    };
    setFormState((prev) => ({
      ...prev,
      education: [...prev.education, newItem]
    }));
  }, []);

  /**
   * Removes an education item
   */
  const removeEducation = useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }));
  }, []);

  /**
   * Resets form to clean initial state
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_CAREER_FORM_STATE);
  }, []);

  /**
   * Commits the current form state to the master store profile
   */
  const commitToMasterStore = useCallback(() => {
    const existing = useWizardStore.getState().masterResume;
    const structured = mapFormStateToMasterResume(formState, existing);

    updateMasterResume(() => structured);
    setStagedParsedResume(structured);

    addToast({
      type: 'success',
      title: 'Master Profile Updated',
      message: `Synchronized ${formState.personalDetails.fullName || 'Candidate'} data into persistent vault.`
    });

    return structured;
  }, [formState, updateMasterResume, setStagedParsedResume, addToast]);

  /**
   * Returns current state mapped to strict Target JSON Schema
   */
  const exportToJsonPayload = useCallback((): ByocStructuredApplicationData => {
    return mapFormStateToPayload(formState);
  }, [formState]);

  return {
    formState,
    setFormState,
    autoFillFromExtraction,
    updatePersonalDetail,
    updateProfessionalSummary,
    updateWorkExperience,
    addWorkExperience,
    removeWorkExperience,
    addKeyResponsibility,
    removeKeyResponsibility,
    addSkill,
    removeSkill,
    setSkills,
    updateEducation,
    addEducation,
    removeEducation,
    resetForm,
    commitToMasterStore,
    exportToJsonPayload
  };
}
