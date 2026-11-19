import type { JobPosting, MasterResume, PracticeQuestion } from '../types';

export interface DomainPracticeCard extends PracticeQuestion {
  isGenericPractice: boolean;
  hasEvidence: boolean;
}

export function buildDomainPracticeQuestions(
  masterResume: MasterResume | null | undefined,
  selectedJob: JobPosting | null
): DomainPracticeCard[] {
  const skills = [
    ...(masterResume?.skills.technical || []),
    ...(masterResume?.skills.tools || []),
    ...(masterResume?.skills.domains || []),
    ...(masterResume?.skills.soft || [])
  ].map((skill) => skill.trim()).filter(Boolean);
  const primarySkill = skills[0] || '';
  const role = selectedJob?.title || masterResume?.experiences?.[0]?.role ||
    masterResume?.headline || 'the career direction you are exploring';
  const firstExperience = masterResume?.experiences?.find((item) => item.bullets?.some((bullet) => bullet.trim()));
  const firstBullet = firstExperience?.bullets.find((bullet) => bullet.trim());
  const firstProject = masterResume?.projects?.find((project) => project.description?.trim());
  const firstEvidence = masterResume?.additionalEvidence?.find((item) => item.trim());
  const firstEducation = masterResume?.education?.find((item) => item.degree?.trim() || item.institution?.trim());

  let evidencePrompt = '';
  if (firstExperience && firstBullet) {
    evidencePrompt = `Use your recorded experience${firstExperience.company ? ` at ${firstExperience.company}` : ''}: "${firstBullet}". Explain your own contribution and do not add outcomes that are not recorded.`;
  } else if (firstProject) {
    evidencePrompt = `Use your recorded project "${firstProject.title}": "${firstProject.description}". Explain what you personally did and what the record does not establish.`;
  } else if (firstEvidence) {
    evidencePrompt = `Use this career evidence exactly as recorded: "${firstEvidence}". Clarify its context without turning it into an unrecorded job or achievement.`;
  } else if (firstEducation) {
    evidencePrompt = `Use your recorded education: "${[firstEducation.degree, firstEducation.field, firstEducation.institution, firstEducation.gradYear].filter(Boolean).join(' — ')}". Connect it only to knowledge or work you can genuinely explain.`;
  } else if (masterResume?.summary?.trim()) {
    evidencePrompt = `Use your own recorded professional summary as a starting point: "${masterResume.summary}". Add detail only when you can support it.`;
  }

  const hasProfileEvidence = Boolean(evidencePrompt);
  const jobSkills = (selectedJob?.skillsRequired || []).slice(0, 3);
  const roleQuestion = selectedJob
    ? `For the ${selectedJob.title} role at ${selectedJob.company}, which responsibilities would you prioritize first, and how would you check that your work meets the role's stated requirements?`
    : `What outcomes matter most in ${role}, and how would you plan, complete and check a typical task?`;

  return [
    {
      id: 'q-role-1',
      category: 'Role-Specific',
      title: selectedJob ? `Understanding the ${selectedJob.title} role` : `Understanding ${role}`,
      question: roleQuestion,
      difficulty: 'Role-appropriate',
      keyConcepts: [...jobSkills, 'Role responsibilities', 'Prioritization', 'Quality checks'],
      suggestedFramework: 'Understand the outcome → clarify requirements → plan the work → complete it → check and communicate the result.',
      sampleEvidencePrompt: evidencePrompt,
      isGenericPractice: !hasProfileEvidence,
      hasEvidence: hasProfileEvidence
    },
    {
      id: 'q-skill-1',
      category: 'Technical',
      title: primarySkill ? `Explaining your experience with ${primarySkill}` : 'Explaining a tool, method or skill',
      question: primarySkill
        ? `You listed ${primarySkill} in your Master Resume. In what context have you used or learned it? Walk through one task and explain what you did, what you learned and what you would improve.`
        : 'Choose a tool, method or subject you have learned. Explain how you learned it, where you have applied it (if applicable), and how you check your understanding.',
      difficulty: 'Foundational',
      keyConcepts: [primarySkill || 'Learning', 'Practical application', 'Quality checks', 'Reflection'],
      suggestedFramework: 'Context → your level of involvement → steps taken → evidence of the result → what you learned.',
      sampleEvidencePrompt: primarySkill
        ? `Your Master Resume lists "${primarySkill}". Be clear whether your experience comes from work, a project, study or self-learning.`
        : '',
      isGenericPractice: !primarySkill,
      hasEvidence: Boolean(primarySkill)
    },
    {
      id: 'q-behavior-1',
      category: 'Behavioral',
      title: 'Explaining how you handle a challenge',
      question: 'Describe a real situation where you had to solve a problem, learn something unfamiliar or complete a difficult task. What was your responsibility, what steps did you take, and what happened?',
      difficulty: 'Foundational',
      keyConcepts: ['Situation', 'Your responsibility', 'Actions you took', 'Outcome', 'Reflection'],
      suggestedFramework: 'STAR: Situation → Task → Action → Result. If there was no measurable result, explain the observable outcome honestly.',
      sampleEvidencePrompt: evidencePrompt,
      isGenericPractice: !hasProfileEvidence,
      hasEvidence: hasProfileEvidence
    },
    {
      id: 'q-situational-1',
      category: 'Situational',
      title: 'Handling unclear requirements and changing priorities',
      question: 'You receive a task with an unclear outcome and a deadline that may change. What would you clarify first, how would you decide what to do, and how would you keep the relevant people informed?',
      difficulty: 'Foundational',
      keyConcepts: ['Clarifying questions', 'Prioritization', 'Communication', 'Review'],
      suggestedFramework: 'Clarify → agree priorities → communicate a plan → act → review and update.',
      sampleEvidencePrompt: '',
      isGenericPractice: true,
      hasEvidence: false
    }
  ];
}
