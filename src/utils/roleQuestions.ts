export type RoleFamily =
  | 'technology'
  | 'data-analytics'
  | 'design-research'
  | 'sales-customer-success'
  | 'operations'
  | 'finance-accounting'
  | 'healthcare'
  | 'education'
  | 'general';

export type ExperienceLevel =
  | 'Student'
  | 'Entry'
  | 'Mid'
  | 'Senior'
  | 'Career Changer'
  | 'Unspecified';

const ROLE_QUESTION_BANK: Record<RoleFamily, string[]> = {
  technology: [
    'What did you build, maintain, automate, troubleshoot, or support?',
    'Which programming languages, frameworks, platforms, or tools did you personally use?',
    'What problem did your work solve for users, customers, or your team?'
  ],
  'data-analytics': [
    'What data did you work with, and how did you collect, clean, or analyse it?',
    'Which tools or methods did you use (for example SQL, spreadsheets, BI tools, or statistics)?',
    'What decision or action did your analysis help someone take?'
  ],
  'design-research': [
    'What user or customer problem were you trying to understand or improve?',
    'Which research, design, prototyping, or accessibility methods did you actually use?',
    'How did feedback or testing change the final design?'
  ],
  'sales-customer-success': [
    'Who did you support or sell to, and what need were they trying to solve?',
    'Which parts of the customer journey did you handle (prospecting, demos, onboarding, retention, or support)?',
    'What changed for customers or the business? Include figures only when you know they are accurate.'
  ],
  operations: [
    'Which process, service, project, or daily operation were you responsible for?',
    'How did you coordinate people, schedules, suppliers, quality, or delivery?',
    'What became safer, faster, clearer, or more reliable because of your work?'
  ],
  'finance-accounting': [
    'Which financial, accounting, audit, payroll, or reporting tasks did you perform?',
    'Which systems, spreadsheets, controls, or standards did you use?',
    'How did your work improve accuracy, compliance, visibility, or decision-making?'
  ],
  healthcare: [
    'What care, clinical, administrative, or support responsibilities did you personally perform?',
    'Which safety, privacy, documentation, or care standards guided your work?',
    'How did you contribute to patient, client, or team outcomes without including private patient details?'
  ],
  education: [
    'Who did you teach, mentor, train, or support, and in what setting?',
    'What lessons, materials, learning activities, or assessment methods did you prepare?',
    'How did you adapt your approach when learners needed different kinds of support?'
  ],
  general: [
    'What responsibilities did you personally handle in this role, project, or activity?',
    'Who did your work help, and what tools, methods, or knowledge did you use?',
    'What improved because of your contribution? Describe it honestly even if you do not have a number.'
  ]
};

const LEVEL_QUESTIONS: Record<ExperienceLevel, string[]> = {
  Student: [
    'You can include coursework, personal projects, clubs, volunteering, family business work, or community activities — what did you actually contribute?'
  ],
  Entry: [
    'If you are early in your career, describe a real internship, project, course assignment, volunteer activity, or first job rather than leaving the section blank.'
  ],
  Mid: [
    'Which tasks or deliverables did you own independently, and when did you collaborate with others?'
  ],
  Senior: [
    'What was the scope of your responsibility — teams, systems, budgets, customers, or strategy — and what decisions were yours?'
  ],
  'Career Changer': [
    'Which transferable skills from earlier jobs, study, caregiving, volunteering, or personal projects are relevant to the role you want next?'
  ],
  Unspecified: [
    'What is one specific example that shows how you contributed, learned, solved a problem, or helped someone?'
  ]
};

export function getRoleSpecificQuestions(
  roleFamily: string,
  experienceLevel: string
): string[] {
  const roleQuestions =
    ROLE_QUESTION_BANK[roleFamily as RoleFamily] ?? ROLE_QUESTION_BANK.general;
  const levelQuestions =
    LEVEL_QUESTIONS[experienceLevel as ExperienceLevel] ?? LEVEL_QUESTIONS.Unspecified;

  return [
    ...roleQuestions,
    ...levelQuestions,
    'Was there a measurable result? Add a number only if you know it is accurate; otherwise describe the outcome without inventing a metric.'
  ];
}

export const ROLE_FAMILY_OPTIONS: ReadonlyArray<{ value: RoleFamily; label: string }> = [
  { value: 'technology', label: 'Technology & Software' },
  { value: 'data-analytics', label: 'Data & Analytics' },
  { value: 'design-research', label: 'Design & Research' },
  { value: 'sales-customer-success', label: 'Sales & Customer Success' },
  { value: 'operations', label: 'Operations & Project Management' },
  { value: 'finance-accounting', label: 'Finance & Accounting' },
  { value: 'healthcare', label: 'Healthcare & Care' },
  { value: 'education', label: 'Education & Training' },
  { value: 'general', label: 'Other / Not Sure' }
];

export const EXPERIENCE_LEVEL_OPTIONS: ReadonlyArray<{ value: ExperienceLevel; label: string }> = [
  { value: 'Student', label: 'Student' },
  { value: 'Entry', label: 'Entry level' },
  { value: 'Mid', label: 'Intermediate' },
  { value: 'Senior', label: 'Senior / Leadership' },
  { value: 'Career Changer', label: 'Changing careers' },
  { value: 'Unspecified', label: 'Not sure yet' }
];
