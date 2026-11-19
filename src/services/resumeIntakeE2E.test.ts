import { describe, expect, it } from 'vitest';
import { parseRawResumeToStructured, validateExtractedSchema } from './extractionService';
import { assessResumeReadiness } from '../utils/resumeReadiness';

const DUMMY_FRAUD_ANALYST_RESUME = `Priya Sharma
priya.sharma@example.com
+91 98765 43210
Bengaluru, India

Professional Summary
Fraud and risk analyst with experience investigating suspicious transactions, reviewing alerts, documenting cases, and supporting operational controls across digital payments.

Experience
Senior Fraud Analyst - Northstar Bank - 2022 - Present
- Investigate suspicious card and UPI transactions and document case outcomes.
- Review transaction monitoring alerts and escalate confirmed risks to the compliance team.
Fraud Operations Analyst - CityPay Services - 2020 - 2022
- Reviewed payment disputes and chargeback evidence within internal service timelines.
- Coordinated with customer support and risk teams to resolve account misuse reports.

Core Competencies
Fraud Detection, Transaction Monitoring, AML, KYC, Chargeback Analysis, SQL, Microsoft Excel

Education
Bachelor of Commerce - Bangalore University - 2020
`;

describe('resume upload parsing and readiness end-to-end fixture', () => {
  it('extracts a realistic fraud analyst resume without inventing experience or competencies', () => {
    const parsed = parseRawResumeToStructured(
      DUMMY_FRAUD_ANALYST_RESUME,
      'dummy-fraud-analyst-resume.txt',
      100,
      1,
      DUMMY_FRAUD_ANALYST_RESUME.length
    );

    expect(parsed.contactInfo).toMatchObject({
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com'
    });
    expect(parsed.experiences).toHaveLength(2);
    expect(parsed.experiences[0]).toMatchObject({
      role: 'Senior Fraud Analyst',
      company: 'Northstar Bank',
      bullets: expect.arrayContaining([
        expect.stringContaining('Investigate suspicious card'),
        expect.stringContaining('Review transaction monitoring')
      ])
    });
    expect(parsed.skills.domains).toEqual(expect.arrayContaining([
      'Fraud Detection', 'Transaction Monitoring', 'AML', 'KYC', 'Chargeback Analysis'
    ]));
    expect(parsed.rawText).toBe(DUMMY_FRAUD_ANALYST_RESUME);
  });

  it('does not flag the complete dummy resume as half-built', () => {
    const parsed = parseRawResumeToStructured(DUMMY_FRAUD_ANALYST_RESUME);
    expect(assessResumeReadiness(parsed)).toEqual({
      completenessPercent: 100,
      missingSections: []
    });
  });

  it('extracts inline competency headings used by compact resume layouts', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha.rao@example.com
Professional Summary
Risk analyst experienced in reviewing payment alerts and supporting fraud operations.
Skills: Fraud Detection, AML, KYC, SQL, Chargeback Analysis
Experience
Risk Analyst - Sample Bank - 2023 - Present
- Reviewed payment alerts and documented investigations.
- Escalated suspicious activity to the compliance team.`);
    expect(parsed.skills.domains).toEqual(expect.arrayContaining([
      'Fraud Detection', 'AML', 'KYC', 'Chargeback Analysis'
    ]));
    expect(assessResumeReadiness(parsed).completenessPercent).toBe(100);
  });

  it('reports the actual missing section for a sparse profile instead of claiming multiple experience milestones', () => {
    const parsed = parseRawResumeToStructured(`Priya Sharma
priya.sharma@example.com
Professional Summary
Fraud analyst with experience supporting digital payment investigations and customer cases.
Experience
Fraud Analyst - Example Bank - 2022 - Present
- Reviewed payment alerts and documented case notes.`);
    const readiness = assessResumeReadiness(parsed);
    expect(readiness.completenessPercent).toBe(80);
    expect(readiness.missingSections).toContain('three or more relevant skills or competencies');
    expect(readiness.missingSections).not.toContain('work experience');
  });
  it('recognizes a student profile with education and projects as meaningful resume evidence without employment history', () => {
    const student = parseRawResumeToStructured(`Asha Rao
asha.rao@example.com
Professional Summary
Final-year commerce student interested in financial operations and data analysis.
Education
Bachelor of Commerce - City University - 2026
Projects
Retail Sales Analysis
Analysed a sample retail dataset using Excel and SQL to identify monthly sales trends.
Skills
Excel, SQL, Data Analysis`);
    expect(student.experiences).toHaveLength(0);
    expect(student.education.length).toBeGreaterThan(0);
    expect(student.projects.length).toBeGreaterThan(0);
    expect(student.projects[0].description).toContain('Analysed a sample retail dataset');
    const readiness = assessResumeReadiness(student);
    expect(readiness.completenessPercent).toBe(100);
    expect(readiness.missingSections).toEqual([]);
  });

  it('does not treat paid work history as mandatory when a student has education and project evidence', () => {
    const student = parseRawResumeToStructured(`Asha Rao
asha.rao@example.com
Professional Summary
Final-year commerce student interested in financial operations and data analysis.
Education
Bachelor of Commerce - City University - 2026
Projects
Retail Sales Analysis
Analysed a sample retail dataset using Excel and SQL to identify monthly sales trends.
Skills
Excel, SQL, Data Analysis`);
    const validation = validateExtractedSchema(student);
    expect(validation.missingMandatoryFields).not.toContain('Work Experience Milestones');
  });

  it('recognizes a name written in Tamil script without requiring English transliteration', () => {
    const parsed = parseRawResumeToStructured(`தமிழ் வேட்பாளர்
candidate@example.com
தொழில்முறை சுருக்கம்
வாடிக்கையாளர் சேவை மற்றும் தரவு பகுப்பாய்வு திறன்கள்.`);
    expect(parsed.contactInfo.name).toBe('தமிழ் வேட்பாளர்');
    expect(parsed.rawText).toContain('தொழில்முறை சுருக்கம்');
  });

  it('preserves non-standard career sections such as volunteering, awards and languages', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha@example.com
Professional Summary
Commerce graduate with experience in student projects and community work.
Education
Bachelor of Commerce - City University - 2025
Volunteering
Volunteer coordinator at a local learning centre.
Awards
University merit scholarship, 2024.
Languages
Tamil — Native; English — Professional working proficiency.`);
    expect(parsed.additionalEvidence).toEqual(expect.arrayContaining([
      expect.stringContaining('Volunteering: Volunteer coordinator'),
      expect.stringContaining('Awards: University merit scholarship'),
      expect.stringContaining('Languages: Tamil')
    ]));
  });

});

describe('resume section boundary regression', () => {
  it('stops skills extraction at every supported non-standard career section', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha@example.com
Professional Summary
Commerce graduate with data analysis project experience.
Skills
SQL, Excel
Volunteering
Volunteer coordinator at a local learning centre.
Languages
Tamil — Native; English — Professional working proficiency.
Awards
University merit scholarship, 2024.`);

    expect(parsed.skills.domains).toEqual(expect.arrayContaining(['SQL', 'Excel']));
    expect(parsed.skills.domains).not.toContain('Volunteering');
    expect(parsed.skills.domains).not.toContain('Volunteer coordinator at a local learning centre.');
    expect(parsed.skills.domains).not.toContain('Tamil — Native');
    expect(parsed.additionalEvidence).toEqual(expect.arrayContaining([
      expect.stringContaining('Volunteering: Volunteer coordinator'),
      expect.stringContaining('Languages: Tamil'),
      expect.stringContaining('Awards: University merit scholarship')
    ]));
  });
});
