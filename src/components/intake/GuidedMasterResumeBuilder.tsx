import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Languages,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import type { CareerApplicationFormState, MasterResume } from '../../types';
import { formatGroqError } from '../../services/groqService';
import { translateCareerDraftToEnglish } from '../../services/careerTranslationService';
import { buildMasterResumeFromCareerDraft } from '../../utils/guidedResumeMapper';
import { EXPERIENCE_LEVEL_OPTIONS, getRoleSpecificQuestions, ROLE_FAMILY_OPTIONS } from '../../utils/roleQuestions';
import { sanitizeCareerFormState } from '../../utils/storagePersistence';

interface GuidedMasterResumeBuilderProps {
  initialDraft: CareerApplicationFormState | null;
  groqApiKey: string;
  onDraftChange: (draft: CareerApplicationFormState) => void;
  onComplete: (profile: MasterResume) => void;
  onCancel: () => void;
}

const STEP_NAMES = ['Your profile', 'Experience', 'Skills & projects', 'Education', 'Review'];
const LANGUAGE_OPTIONS = ['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Marathi', 'Urdu', 'Other'];

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode; optional?: boolean }> = ({ htmlFor, children, optional }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-300 mb-1.5">
    {children}
    {optional && <span className="ml-1 font-normal text-slate-500">Optional</span>}
  </label>
);

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15';
const textAreaClass = `${inputClass} min-h-24 resize-y leading-relaxed`;

export const GuidedMasterResumeBuilder: React.FC<GuidedMasterResumeBuilderProps> = ({
  initialDraft,
  groqApiKey,
  onDraftChange,
  onComplete,
  onCancel
}) => {
  const [draft, setDraft] = useState<CareerApplicationFormState>(() => sanitizeCareerFormState(initialDraft));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationPreview, setTranslationPreview] = useState<CareerApplicationFormState | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => onDraftChange(draft), 350);
    return () => window.clearTimeout(timeout);
  }, [draft, onDraftChange]);

  const roleQuestions = useMemo(
    () => getRoleSpecificQuestions(draft.roleFamily || 'general', draft.experienceLevel || 'Unspecified'),
    [draft.roleFamily, draft.experienceLevel]
  );

  const hasResumeContent = Boolean(
    draft.professionalSummary.trim() ||
    draft.workExperience.some((item) => item.role.trim() || item.company.trim() || item.keyResponsibilities.some(Boolean)) ||
    draft.skills.length ||
    (draft.projects || []).some((item) => item.title.trim() || item.description.trim()) ||
    draft.education.some((item) => item.degree.trim() || item.institution.trim()) ||
    (draft.certifications || []).some((item) => item.name.trim())
  );

  const updateDraft = (patch: Partial<CareerApplicationFormState>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError('');
  };

  const updatePersonal = (field: keyof CareerApplicationFormState['personalDetails'], value: string) => {
    setDraft((current) => ({
      ...current,
      personalDetails: { ...current.personalDetails, [field]: value }
    }));
    setError('');
  };

  const updateExperience = (index: number, patch: Partial<CareerApplicationFormState['workExperience'][number]>) => {
    setDraft((current) => ({
      ...current,
      workExperience: current.workExperience.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  };

  const addExperience = () => {
    updateDraft({
      workExperience: [
        ...draft.workExperience,
        {
          id: createId('experience'),
          company: '',
          role: '',
          duration: '',
          startDate: '',
          endDate: '',
          location: '',
          isCurrent: false,
          keyResponsibilities: []
        }
      ]
    });
  };

  const updateEducation = (index: number, patch: Partial<CareerApplicationFormState['education'][number]>) => {
    setDraft((current) => ({
      ...current,
      education: current.education.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  };

  const addEducation = () => updateDraft({
    education: [...draft.education, { id: createId('education'), degree: '', field: '', institution: '', year: '', gpa: '' }]
  });

  const updateProject = (index: number, patch: Partial<NonNullable<CareerApplicationFormState['projects']>[number]>) => {
    setDraft((current) => ({
      ...current,
      projects: (current.projects || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  };

  const addProject = () => updateDraft({
    projects: [...(draft.projects || []), { id: createId('project'), title: '', description: '', technologies: [], link: '' }]
  });

  const updateCertification = (index: number, patch: Partial<NonNullable<CareerApplicationFormState['certifications']>[number]>) => {
    setDraft((current) => ({
      ...current,
      certifications: (current.certifications || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  };

  const addCertification = () => updateDraft({
    certifications: [...(draft.certifications || []), { id: createId('certification'), name: '', issuer: '', issueDate: '' }]
  });

  const handleRestoreOriginalLanguage = () => {
    if (!draft.originalLanguageSnapshot) return;
    try {
      const snapshot = JSON.parse(draft.originalLanguageSnapshot) as { draft?: unknown };
      const originalDraft = snapshot && typeof snapshot === 'object' && 'draft' in snapshot
        ? snapshot.draft
        : snapshot;
      setDraft(sanitizeCareerFormState(originalDraft));
      setTranslationPreview(null);
      setError('');
    } catch {
      setError('The preserved original-language draft could not be read. Your current resume text has not changed.');
    }
  };

  const handleTranslate = async () => {
    if (!groqApiKey.trim()) {
      setError('Add your Groq API key in Settings to use optional translation. You can still complete the resume in your chosen language.');
      return;
    }
    const sourceLanguage = draft.sourceLanguage === 'Other'
      ? (draft.sourceLanguageOther || '').trim()
      : (draft.sourceLanguage || 'English');
    if (!sourceLanguage || sourceLanguage === 'Other') {
      setError('Enter the name of your source language before translating.');
      return;
    }
    setIsTranslating(true);
    setError('');
    try {
      const translated = await translateCareerDraftToEnglish(draft, sourceLanguage, groqApiKey);
      setTranslationPreview(translated);
    } catch (err) {
      setError(formatGroqError(err));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleNext = () => {
    if (step === 0) {
      if (!draft.personalDetails.fullName.trim()) {
        setError('Enter the name you want displayed on your resume.');
        return;
      }
      if (!draft.targetRole?.trim()) {
        setError('Add the role you are working toward. You can change it later.');
        return;
      }
    }
    setError('');
    setStep((current) => Math.min(STEP_NAMES.length - 1, current + 1));
  };

  const handleComplete = () => {
    if (!hasResumeContent) {
      setError('Add at least one real detail — a summary, skill, project, education item, certification, or experience — before creating your Master Resume.');
      return;
    }
    onDraftChange(draft);
    onComplete(buildMasterResumeFromCareerDraft(draft));
  };

  const handleClose = () => {
    onDraftChange(draft);
    onCancel();
  };

  const selectedSourceLanguage = draft.sourceLanguage === 'Other'
    ? (draft.sourceLanguageOther || '').trim()
    : (draft.sourceLanguage || 'English');
  const canTranslate = selectedSourceLanguage.toLowerCase() !== 'english' && selectedSourceLanguage.length > 0 && hasResumeContent;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#070B14]/95 backdrop-blur-md">
      <div className="mx-auto min-h-screen w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Build Your Own Career</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Create your Master Resume</h2>
            <p className="mt-1 text-xs text-slate-400">Your draft autosaves inside your encrypted BYOC vault.</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Save draft and close" className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">Step {step + 1} of {STEP_NAMES.length}</span>
            <span className="text-[11px] text-slate-400">{STEP_NAMES[step]}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {STEP_NAMES.map((name, index) => (
              <div key={name} className={`h-1.5 rounded-full ${index <= step ? 'bg-gradient-to-r from-indigo-500 to-sky-400' : 'bg-slate-700'}`} />
            ))}
          </div>
          <div className="mt-3 hidden grid-cols-5 gap-2 sm:grid">
            {STEP_NAMES.map((name, index) => (
              <span key={name} className={`text-[10px] ${index === step ? 'font-bold text-sky-300' : 'text-slate-500'}`}>{name}</span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-4 shadow-2xl sm:p-6">
          {step === 0 && (
            <section className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">Start with the basics</h3>
                <p className="mt-1 text-xs text-slate-400">Only enter information you are comfortable putting on a resume. You can leave optional contact fields blank.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><FieldLabel htmlFor="guided-name">Name on resume</FieldLabel><input id="guided-name" className={inputClass} value={draft.personalDetails.fullName} onChange={(e) => updatePersonal('fullName', e.target.value)} placeholder="Your full name" /></div>
                <div><FieldLabel htmlFor="guided-current-role" optional>Current / most recent role</FieldLabel><input id="guided-current-role" className={inputClass} value={draft.currentRole || ''} onChange={(e) => updateDraft({ currentRole: e.target.value })} placeholder="e.g. Customer Support Associate" /></div>
                <div><FieldLabel htmlFor="guided-target-role">Target role</FieldLabel><input id="guided-target-role" className={inputClass} value={draft.targetRole || ''} onChange={(e) => updateDraft({ targetRole: e.target.value })} placeholder="e.g. Junior Data Analyst" /></div>
                <div><FieldLabel htmlFor="guided-email" optional>Email</FieldLabel><input id="guided-email" type="email" className={inputClass} value={draft.personalDetails.email} onChange={(e) => updatePersonal('email', e.target.value)} placeholder="you@example.com" /></div>
                <div><FieldLabel htmlFor="guided-phone" optional>Phone</FieldLabel><input id="guided-phone" className={inputClass} value={draft.personalDetails.phone} onChange={(e) => updatePersonal('phone', e.target.value)} placeholder="Phone number" /></div>
                <div><FieldLabel htmlFor="guided-location" optional>Location</FieldLabel><input id="guided-location" className={inputClass} value={draft.personalDetails.location} onChange={(e) => updatePersonal('location', e.target.value)} placeholder="City, country" /></div>
                <div><FieldLabel htmlFor="guided-language">Language you will write in</FieldLabel><select id="guided-language" className={inputClass} value={draft.sourceLanguage || 'English'} onChange={(e) => updateDraft({ sourceLanguage: e.target.value })}>{LANGUAGE_OPTIONS.map((language) => <option key={language} value={language}>{language}</option>)}</select></div>
                {draft.sourceLanguage === 'Other' && <div><FieldLabel htmlFor="guided-language-other">Name your language</FieldLabel><input id="guided-language-other" className={inputClass} value={draft.sourceLanguageOther || ''} onChange={(e) => updateDraft({ sourceLanguageOther: e.target.value })} placeholder="e.g. Odia, Punjabi, Sinhala" /></div>}
                <div><FieldLabel htmlFor="guided-role-family">Role area</FieldLabel><select id="guided-role-family" className={inputClass} value={draft.roleFamily || 'general'} onChange={(e) => updateDraft({ roleFamily: e.target.value })}>{ROLE_FAMILY_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
                <div><FieldLabel htmlFor="guided-experience-level">Experience level</FieldLabel><select id="guided-experience-level" className={inputClass} value={draft.experienceLevel || 'Unspecified'} onChange={(e) => updateDraft({ experienceLevel: e.target.value })}>{EXPERIENCE_LEVEL_OPTIONS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select></div>
                <div><FieldLabel htmlFor="guided-linkedin" optional>LinkedIn URL</FieldLabel><input id="guided-linkedin" className={inputClass} value={draft.personalDetails.linkedin || ''} onChange={(e) => updatePersonal('linkedin', e.target.value)} placeholder="https://linkedin.com/in/..." /></div>
                <div><FieldLabel htmlFor="guided-github" optional>GitHub URL</FieldLabel><input id="guided-github" className={inputClass} value={draft.personalDetails.github || ''} onChange={(e) => updatePersonal('github', e.target.value)} placeholder="https://github.com/..." /></div>
                <div className="sm:col-span-2"><FieldLabel htmlFor="guided-portfolio" optional>Portfolio / website</FieldLabel><input id="guided-portfolio" className={inputClass} value={draft.personalDetails.portfolio || ''} onChange={(e) => updatePersonal('portfolio', e.target.value)} placeholder="https://..." /></div>
              </div>
              <div>
                <FieldLabel htmlFor="guided-summary" optional>Professional summary</FieldLabel>
                <textarea id="guided-summary" className={textAreaClass} value={draft.professionalSummary} onChange={(e) => updateDraft({ professionalSummary: e.target.value })} placeholder="In a few sentences, describe what you know, what you have done, and the kind of role you want." />
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">Tell us what you have done</h3>
                <p className="mt-1 text-xs text-slate-400">Formal jobs are not required. Internships, volunteering, family business work, and relevant activities can count when described accurately.</p>
              </div>
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-300">Prompts for {draft.currentRole || draft.targetRole || ROLE_FAMILY_OPTIONS.find((role) => role.value === draft.roleFamily)?.label || 'your role'}</p>
                <ul className="space-y-2">{roleQuestions.map((question) => <li key={question} className="flex gap-2 text-xs leading-relaxed text-slate-300"><span className="mt-0.5 text-sky-400">•</span><span>{question}</span></li>)}</ul>
              </div>
              {draft.workExperience.map((experience, index) => (
                <div key={experience.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between"><span className="text-xs font-bold text-white">Experience {index + 1}</span><button type="button" onClick={() => updateDraft({ workExperience: draft.workExperience.filter((_, i) => i !== index) })} aria-label={`Remove experience ${index + 1}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><FieldLabel htmlFor={`exp-role-${index}`}>Role / position</FieldLabel><input id={`exp-role-${index}`} className={inputClass} value={experience.role} onChange={(e) => updateExperience(index, { role: e.target.value })} placeholder="Your role" /></div>
                    <div><FieldLabel htmlFor={`exp-company-${index}`}>Company / organisation</FieldLabel><input id={`exp-company-${index}`} className={inputClass} value={experience.company} onChange={(e) => updateExperience(index, { company: e.target.value })} placeholder="Where you worked" /></div>
                    <div><FieldLabel htmlFor={`exp-start-${index}`} optional>Start date</FieldLabel><input id={`exp-start-${index}`} className={inputClass} value={experience.startDate || ''} onChange={(e) => updateExperience(index, { startDate: e.target.value, duration: `${e.target.value} – ${experience.endDate || ''}` })} placeholder="e.g. Jan 2023" /></div>
                    <div><FieldLabel htmlFor={`exp-end-${index}`} optional>End date</FieldLabel><input id={`exp-end-${index}`} className={inputClass} disabled={Boolean(experience.isCurrent)} value={experience.isCurrent ? 'Present' : experience.endDate || ''} onChange={(e) => updateExperience(index, { endDate: e.target.value, duration: `${experience.startDate || ''} – ${e.target.value}` })} placeholder="e.g. Dec 2024" /></div>
                    <div><FieldLabel htmlFor={`exp-location-${index}`} optional>Location</FieldLabel><input id={`exp-location-${index}`} className={inputClass} value={experience.location || ''} onChange={(e) => updateExperience(index, { location: e.target.value })} placeholder="City / Remote" /></div>
                    <label className="flex items-center gap-2 self-end pb-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(experience.isCurrent)} onChange={(e) => updateExperience(index, { isCurrent: e.target.checked, endDate: e.target.checked ? 'Present' : '', duration: `${experience.startDate || ''} – ${e.target.checked ? 'Present' : ''}` })} /> I currently work here</label>
                  </div>
                  <div><FieldLabel htmlFor={`exp-bullets-${index}`}>What did you actually do? One point per line</FieldLabel><textarea id={`exp-bullets-${index}`} className={textAreaClass} value={experience.keyResponsibilities.join('\n')} onChange={(e) => updateExperience(index, { keyResponsibilities: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })} placeholder="Handled customer enquiries\nPrepared weekly reports\nSupported daily operations" /></div>
                </div>
              ))}
              <button type="button" onClick={addExperience} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-600 px-4 py-3 text-xs font-bold text-sky-300 hover:border-sky-400 hover:bg-sky-500/5"><Plus className="h-4 w-4" /> Add experience</button>
              {draft.workExperience.length === 0 && <p className="text-xs text-slate-500">No work experience yet? That is okay. Continue to projects, education, and skills.</p>}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <div><h3 className="text-base font-bold text-white">Skills and projects</h3><p className="mt-1 text-xs text-slate-400">List skills you can genuinely demonstrate. A project can be from work, study, volunteering, or personal practice.</p></div>
              <div><FieldLabel htmlFor="guided-skills">Skills (separate with commas)</FieldLabel><textarea id="guided-skills" className={textAreaClass} value={draft.skills.join(', ')} onChange={(e) => updateDraft({ skills: e.target.value.split(',').map((skill) => skill.trim()).filter(Boolean) })} placeholder="Excel, SQL, customer service, bookkeeping..." /></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">Projects</h4><button type="button" onClick={addProject} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-sky-300"><Plus className="h-3.5 w-3.5" /> Add project</button></div>
                {(draft.projects || []).map((project, index) => (
                  <div key={project.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
                    <div className="flex items-center justify-between"><span className="text-xs font-bold text-white">Project {index + 1}</span><button type="button" onClick={() => updateDraft({ projects: (draft.projects || []).filter((_, i) => i !== index) })} aria-label={`Remove project ${index + 1}`} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
                    <div><FieldLabel htmlFor={`project-title-${index}`}>Project name</FieldLabel><input id={`project-title-${index}`} className={inputClass} value={project.title} onChange={(e) => updateProject(index, { title: e.target.value })} /></div>
                    <div><FieldLabel htmlFor={`project-description-${index}`}>What did you make or contribute?</FieldLabel><textarea id={`project-description-${index}`} className={textAreaClass} value={project.description} onChange={(e) => updateProject(index, { description: e.target.value })} /></div>
                    <div><FieldLabel htmlFor={`project-tech-${index}`} optional>Tools / technologies</FieldLabel><input id={`project-tech-${index}`} className={inputClass} value={project.technologies.join(', ')} onChange={(e) => updateProject(index, { technologies: e.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></div>
                    <div><FieldLabel htmlFor={`project-link-${index}`} optional>Project link</FieldLabel><input id={`project-link-${index}`} className={inputClass} value={project.link || ''} onChange={(e) => updateProject(index, { link: e.target.value })} placeholder="https://..." /></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <div><h3 className="text-base font-bold text-white">Education and certifications</h3><p className="mt-1 text-xs text-slate-400">Add the education and qualifications relevant to your next role. You can skip either section.</p></div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">Education</h4><button type="button" onClick={addEducation} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-sky-300"><Plus className="h-3.5 w-3.5" /> Add education</button></div>
                {draft.education.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
                    <div className="flex items-center justify-between"><span className="text-xs font-bold text-white">Education {index + 1}</span><button type="button" onClick={() => updateDraft({ education: draft.education.filter((_, i) => i !== index) })} aria-label={`Remove education ${index + 1}`} className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><FieldLabel htmlFor={`edu-degree-${index}`}>Qualification / degree</FieldLabel><input id={`edu-degree-${index}`} className={inputClass} value={item.degree} onChange={(e) => updateEducation(index, { degree: e.target.value })} /></div>
                      <div><FieldLabel htmlFor={`edu-field-${index}`} optional>Field of study</FieldLabel><input id={`edu-field-${index}`} className={inputClass} value={item.field || ''} onChange={(e) => updateEducation(index, { field: e.target.value })} /></div>
                      <div><FieldLabel htmlFor={`edu-institution-${index}`}>Institution</FieldLabel><input id={`edu-institution-${index}`} className={inputClass} value={item.institution} onChange={(e) => updateEducation(index, { institution: e.target.value })} /></div>
                      <div><FieldLabel htmlFor={`edu-year-${index}`} optional>Year</FieldLabel><input id={`edu-year-${index}`} className={inputClass} value={item.year} onChange={(e) => updateEducation(index, { year: e.target.value })} /></div>
                      <div><FieldLabel htmlFor={`edu-gpa-${index}`} optional>Grade / GPA</FieldLabel><input id={`edu-gpa-${index}`} className={inputClass} value={item.gpa || ''} onChange={(e) => updateEducation(index, { gpa: e.target.value })} /></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">Certifications</h4><button type="button" onClick={addCertification} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-sky-300"><Plus className="h-3.5 w-3.5" /> Add certification</button></div>
                {(draft.certifications || []).map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:grid-cols-3">
                    <div><FieldLabel htmlFor={`cert-name-${index}`}>Certification</FieldLabel><input id={`cert-name-${index}`} className={inputClass} value={item.name} onChange={(e) => updateCertification(index, { name: e.target.value })} /></div>
                    <div><FieldLabel htmlFor={`cert-issuer-${index}`} optional>Issuer</FieldLabel><input id={`cert-issuer-${index}`} className={inputClass} value={item.issuer} onChange={(e) => updateCertification(index, { issuer: e.target.value })} /></div>
                    <div><FieldLabel htmlFor={`cert-date-${index}`} optional>Issue date</FieldLabel><input id={`cert-date-${index}`} className={inputClass} value={item.issueDate} onChange={(e) => updateCertification(index, { issueDate: e.target.value })} /></div>
                    <button type="button" onClick={() => updateDraft({ certifications: (draft.certifications || []).filter((_, i) => i !== index) })} className="justify-self-start text-[11px] text-rose-300 sm:col-span-3">Remove certification</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <div><h3 className="text-base font-bold text-white">Review your information</h3><p className="mt-1 text-xs text-slate-400">BYOC will use only the information you entered. Check names, dates, and achievements before continuing.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Name</p><p className="mt-1 text-sm font-semibold text-white">{draft.personalDetails.fullName || '—'}</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Target role</p><p className="mt-1 text-sm font-semibold text-white">{draft.targetRole || '—'}</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:col-span-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">Summary</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">{draft.professionalSummary || 'No summary added'}</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Experience</p><p className="mt-1 text-sm font-semibold text-white">{draft.workExperience.length} entries</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Skills</p><p className="mt-1 text-sm font-semibold text-white">{draft.skills.length} listed</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Projects</p><p className="mt-1 text-sm font-semibold text-white">{(draft.projects || []).length} entries</p></div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Education / certifications</p><p className="mt-1 text-sm font-semibold text-white">{draft.education.length} / {(draft.certifications || []).length}</p></div>
              </div>
              {!hasResumeContent && <p className="text-xs text-amber-300">Add at least one resume detail before creating the profile.</p>}
              {draft.translatedToEnglish && <p className="text-[11px] text-sky-300">English translation accepted. Your original-language draft is preserved in the encrypted vault.</p>}
            </section>
          )}

          {error && <p role="alert" className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}

          {canTranslate && (
            <div className="mt-5 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Languages className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                  <div><p className="text-xs font-bold text-white">Optional English translation</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Sends resume text fields to Groq only when you press the button. Contact details, company names, dates, and skills stay on this device. Your original text is preserved.</p></div>
                </div>
                <button type="button" onClick={() => void handleTranslate()} disabled={isTranslating || !groqApiKey.trim()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-[11px] font-bold text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-50">
                  {isTranslating ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200/30 border-t-indigo-200" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isTranslating ? 'Translating…' : 'Translate to English'}
                </button>
              </div>
              {!groqApiKey.trim() && <p className="mt-2 text-[10px] text-slate-500">Translation is optional. Add your existing Groq key in Settings if you want to use it.</p>}
              {draft.translatedToEnglish && draft.originalLanguageSnapshot && (
                <button type="button" onClick={handleRestoreOriginalLanguage} className="mt-2 text-[11px] font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200">
                  Restore original-language draft
                </button>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={handleClose} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"><Save className="h-4 w-4" /> Save draft & close</button>
            <div className="flex items-center justify-end gap-2">
              {step > 0 && <button type="button" onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
              {step < STEP_NAMES.length - 1 ? (
                <button type="button" onClick={handleNext} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500">Continue <ArrowRight className="h-3.5 w-3.5" /></button>
              ) : (
                <button type="button" onClick={handleComplete} disabled={!hasResumeContent} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-950/40 hover:brightness-110 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Create Master Resume draft</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {translationPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm">
          <div className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0F172A] p-4 shadow-2xl sm:p-6">
            <h3 className="text-base font-bold text-white">Review English translation</h3>
            <p className="mt-1 text-xs text-slate-400">Check the wording carefully. Nothing changes until you accept this preview.</p>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <div><p className="text-[10px] uppercase text-slate-500">Target role</p><p className="mt-1 text-sm text-white">{translationPreview.targetRole}</p></div>
              <div><p className="text-[10px] uppercase text-slate-500">Summary</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">{translationPreview.professionalSummary}</p></div>
              {(translationPreview.workExperience || []).map((item) => <div key={item.id}><p className="text-[10px] uppercase text-slate-500">{item.role}</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-200">{item.keyResponsibilities.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul></div>)}
              {(translationPreview.projects || []).map((item) => <div key={item.id}><p className="text-[10px] uppercase text-slate-500">{item.title}</p><p className="mt-1 text-xs text-slate-200">{item.description}</p></div>)}
              {(translationPreview.education || []).map((item) => <div key={item.id}><p className="text-[10px] uppercase text-slate-500">Education</p><p className="mt-1 text-xs text-slate-200">{item.degree}{item.field ? ` — ${item.field}` : ''}</p></div>)}
              {(translationPreview.certifications || []).map((item) => <div key={item.id}><p className="text-[10px] uppercase text-slate-500">Certification</p><p className="mt-1 text-xs text-slate-200">{item.name}</p></div>)}
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTranslationPreview(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">Keep original</button>
              <button type="button" onClick={() => { setDraft(translationPreview); setTranslationPreview(null); }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500">Use English translation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
