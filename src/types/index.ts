export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  isCurrent?: boolean;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  gradYear: string;
  gpa?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  link?: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
}

export interface MasterResume {
  rawText: string;
  contactInfo: ContactInfo;
  headline: string;
  summary: string;
  skills: {
    technical: string[];
    soft: string[];
    tools: string[];
    domains: string[];
  };
  experiences: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  sourceLanguage?: string;
  sourceLanguageOther?: string;
  currentRole?: string;
  roleFamily?: string;
  experienceLevel?: string;
  translatedToEnglish?: boolean;
  originalLanguageSnapshot?: string;
  stats: {
    wordCount: number;
    pageCount: number;
    charCount: number;
    lastParsedDate: string;
    sourceFileName: string;
  };
}

export interface JobVetting {
  cultureFit: number; // 0 - 100
  redFlags: string[];
  greenFlags: string[];
  growthTrajectory: string;
  salaryCompetitiveness: string;
  pros: string[];
  cons: string[];
  gapAnalysis: {
    strongAlignments: string[];
    addressableGaps: string[];
    criticalMissing: string[];
  };
  recommendation: 'Strong Match' | 'Selective Apply' | 'Proceed With Caution';
  summaryVerdict: string;
}

export type JobVerificationStatus =
  | 'confirmed'
  | 'expired'
  | 'mismatch'
  | 'not_found'
  | 'manual_review'
  | 'check_failed';

export type JobVerificationProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'smartrecruiters'
  | 'unsupported';

export interface JobVerificationEvidence {
  status: JobVerificationStatus;
  provider: JobVerificationProvider;
  checkedAt: string;
  postingId?: string;
  boardToken?: string;
  officialTitle?: string;
  officialCompany?: string;
  firstPublishedAt?: string;
  updatedAt?: string;
  applicationDeadline?: string;
  evidenceUrl?: string;
  explanation: string;
  riskFlags: string[];
  /** Always false: a public ATS record is not proof of legal employer identity. */
  employerIdentityVerified: false;
}

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  location: string;
  workplaceType: 'Remote' | 'Hybrid' | 'On-site' | 'Unspecified';
  salary: string;
  postedDate: string;
  jobDescriptionRaw: string; // Mandatory Raw JD Caching
  url: string;
  source: string;
  skillsRequired: string[];
  fitScore: number | null; // 0 - 100, or null when profile/criteria data is insufficient
  matchedKeywords: string[];
  missingKeywords: string[];
  department?: string;
  experienceLevel: 'Entry' | 'Mid' | 'Senior' | 'Staff' | 'Lead' | 'Unspecified';
  vetting?: JobVetting;
  verification?: JobVerificationEvidence;

  // Autonomous "Role Upgrade" Engine
  isRoleUpgrade?: boolean;
  roleUpgradeReason?: string;
  roleUpgradeGapAnalysis?: string;
  pastTitleMatchRef?: string;
}

export interface TailoredBullet {
  experienceId: string;
  company: string;
  role: string;
  originalBullet: string;
  tailoredBullet: string;
  matchRationale: string;
  verified?: boolean;
  unmappedReason?: string;
}

export interface InterviewQuestion {
  question: string;
  category: 'Technical' | 'Behavioral' | 'Architecture' | 'Leadership';
  suggestedTalkingPoints: string[];
  authenticEvidenceRef: string;
}

export interface TailoredVariant {
  id: string; // e.g. 'variant-a' | 'variant-b' | 'variant-c'
  name: string; // e.g. 'Variant A: High-Impact Metric & Leadership'
  badge: string; // e.g. 'Leadership & Scale'
  description: string;
  tailoredSummary: string;
  highlightedSkills: string[];
  optimizedBullets: TailoredBullet[];
  coverLetter: string;
  interviewPrepQuestions: InterviewQuestion[];
}

export interface ExportedMaterialRecord {
  id: string;
  format: 'PDF' | 'DOCX' | 'TXT';
  fileName: string;
  exportedAt: string;
  variantId?: string;
  variantName?: string;
}

export interface TailoredArtifact {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  selectedVariantId: string;
  variants: TailoredVariant[];
  tailoredSummary: string;
  highlightedSkills: string[];
  optimizedBullets: TailoredBullet[];
  coverLetter: string;
  interviewPrepQuestions: InterviewQuestion[];
  generationTimestamp: string;
  authenticityGuaranteed: boolean; // True only when every artifact field is independently source-validated
  exportedMaterials?: ExportedMaterialRecord[];
}

export type ApplicationStatus =
  | 'Saved'
  | 'Applied'
  | 'Screening'
  | 'Interview'
  | 'Offer'
  | 'Rejected'
  | 'Archived';

export interface ApplicationRecord {
  id: string;
  jobId: string;
  company: string;
  role: string;
  location: string;
  workplaceType: string;
  salary: string;
  appliedDate: string;
  status: ApplicationStatus;
  jobDescriptionRaw: string; // Immutable raw JD cache
  tailoredResumeSnapshot: TailoredArtifact; // Immutable frozen JSON snapshot
  notes: string;
  portalSource?: string;
  jobUrl?: string;
  skillsRequired?: string[];
  exportedMaterials?: ExportedMaterialRecord[];
  lastActivityDate?: string;
  followUpDate?: string;
  contactPerson?: string;
  contactEmail?: string;
  rejectionReason?: string;
  rejectionDate?: string;
  rejectionNotes?: string;
  interviewStages: Array<{
    id: string;
    stageName: string;
    date: string;
    notes: string;
    completed: boolean;
  }>;
}

export interface EmailInteraction {
  id: string;
  messageId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  receivedDate: string;
  snippet: string;
  body: string;
  detectedCompany: string;
  detectedRole?: string;
  detectedJobIdRef?: string;
  detectedStatusTransition?: ApplicationStatus;
  isRecruitingInfrastructure: boolean;
  infrastructureName?: 'Workday' | 'Greenhouse' | 'Lever' | 'Ashby' | 'BambooHR' | 'Direct Email';
  matchedApplicationId?: string;
  status: 'matched_transitioned' | 'unsaved_external_queue' | 'dismissed';
}

export interface UnsavedApplicationCandidate {
  id: string;
  company: string;
  role: string;
  sourceEmailId: string;
  detectedReferenceNumber?: string;
  infrastructure: string;
  dateReceived: string;
  snippet: string;
  rawEmailBody: string;
  salary?: string;
  workplaceType?: string;
}

export interface UserWorkspace {
  id: string;
  email: string;
  name: string;
  workspacePasskey?: string; // Deprecated: never stored in plaintext in v3
  isEmailVerified: boolean;
  biometricEnabled: boolean;
  biometricCredentialId?: string;
  lastBiometricAuth?: string;
  hasEncryptedVault?: boolean;
  createdAt: string;
  lastActive: string;
}

export interface AppToast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration?: number;
}

export type JobSourcePortal =
  | 'All'
  | 'Remotive Live'
  | 'Remote OK Live'
  | 'Jobicy Live'
  | 'User Import'
  | 'LinkedIn'
  | 'Glassdoor'
  | 'Naukri'
  | 'Indeed'
  | 'Foundit'
  | 'Instahyre';

export interface PortalShortcut {
  id: string;
  name: string;
  searchUrlTemplate: string;
  note?: string;
  isBuiltIn?: boolean;
}

export interface CandidatePreferences {
  country: string; // Default market region (e.g. 'IN', 'US', 'GLOBAL')
  includeWorldwideRemote?: boolean;
  preferredLocations: string[];
  portals: JobSourcePortal[];
  portalShortcuts?: PortalShortcut[];
  profession?: string;
  targetRole?: string;
  seniority?: string;
  noticePeriod?: string;
  expectedCtc?: string;
  currentCtc?: string;
  totalExperienceYears?: number | null;
  workplaceTypePreference?: 'All' | 'Remote' | 'Hybrid' | 'On-site';
}

export interface PracticeQuestion {
  id: string;
  category: 'Technical' | 'Architecture' | 'Behavioral' | 'Leadership';
  title: string;
  question: string;
  difficulty: 'Mid' | 'Senior' | 'Staff / Lead';
  keyConcepts: string[];
  suggestedFramework: string;
  sampleEvidencePrompt: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'intake'
  | 'sourcing'
  | 'vetting'
  | 'customization'
  | 'tracking'
  | 'prepzone'
  | 'settings';

/**
 * Standard BYOC Target Extraction Schema Payload
 */
export interface ByocStructuredApplicationData {
  personal_details: {
    full_name: string;
    email: string;
    phone: string;
    location: string;
  };
  professional_summary: string;
  work_experience: Array<{
    company: string;
    role: string;
    duration: string;
    key_responsibilities: string[];
  }>;
  skills: string[];
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
}

/**
 * Personal Details Form State
 */
export interface PersonalDetailsState {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

/**
 * Work Experience Form State Item
 */
export interface WorkExperienceStateItem {
  id: string;
  company: string;
  role: string;
  duration: string;
  keyResponsibilities: string[];
  startDate?: string;
  endDate?: string;
  location?: string;
  isCurrent?: boolean;
}

/**
 * Education Form State Item
 */
export interface EducationStateItem {
  id: string;
  degree: string;
  institution: string;
  year: string;
  field?: string;
  gpa?: string;
}

/**
 * Career Application Form State for dynamic question auto-filling
 */
export interface CareerApplicationFormState {
  personalDetails: PersonalDetailsState;
  professionalSummary: string;
  workExperience: WorkExperienceStateItem[];
  skills: string[];
  education: EducationStateItem[];
  isAutoFilled: boolean;
  lastExtractedTimestamp: string | null;
  rawSourceText: string;
  targetRole?: string;
  currentRole?: string;
  roleFamily?: string;
  experienceLevel?: string;
  sourceLanguage?: string;
  sourceLanguageOther?: string;
  translatedToEnglish?: boolean;
  originalLanguageSnapshot?: string;
  projects?: ProjectItem[];
  certifications?: CertificationItem[];
}

