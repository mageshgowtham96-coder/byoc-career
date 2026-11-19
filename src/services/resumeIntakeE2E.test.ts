import { describe, expect, it } from 'vitest';
import { parseRawResumeToStructured } from './extractionService';
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
    expect(readiness.completenessPercent).toBe(65);
    expect(readiness.missingSections).toContain('three or more core competencies');
    expect(readiness.missingSections).toContain('at least two specific contribution bullets for one role');
  });
});
