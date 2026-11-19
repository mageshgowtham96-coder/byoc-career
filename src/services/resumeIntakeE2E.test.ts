import { describe, expect, it } from 'vitest';
import { extractResumeFile, parseRawResumeToStructured, validateExtractedSchema } from './extractionService';
import { assessResumeReadiness } from '../utils/resumeReadiness';
import { useWizardStore, buildVaultDataFromState } from '../store/useWizardStore';
import { encryptVault, decryptVault } from '../utils/cryptoVault';


function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeDocxUploadFixture(xml: string): Uint8Array {
  const encoder = new TextEncoder();
  const name = encoder.encode('word/document.xml');
  const data = encoder.encode(xml);
  const crc = crc32(data);
  const local = new Uint8Array(30 + name.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(6, 0x0800, true);
  lv.setUint16(8, 0, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(8, 0x0800, true);
  cv.setUint16(10, 0, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  central.set(name, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const archive = new Uint8Array(local.length + central.length + eocd.length);
  archive.set(local, 0);
  archive.set(central, local.length);
  archive.set(eocd, local.length + central.length);
  return archive;
}

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


describe('real DOCX intake lifecycle', () => {
  it('extracts a DOCX archive, structures its contents, and stages the confirmed profile in vault data', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Asha Rao</w:t></w:r></w:p>
      <w:p><w:r><w:t>asha@example.com</w:t></w:r></w:p>
      <w:p><w:r><w:t>Professional Summary</w:t></w:r></w:p>
      <w:p><w:r><w:t>Commerce graduate with project experience in data analysis.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Skills</w:t></w:r></w:p>
      <w:p><w:r><w:t>Excel, SQL, Data Analysis</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Project: Retail Sales Analysis</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Used Excel to review monthly sales trends.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>Education</w:t></w:r></w:p>
      <w:p><w:r><w:t>Bachelor of Commerce - City University - 2025</w:t></w:r></w:p>
      <w:p><w:r><w:t>Languages — Tamil — Native</w:t></w:r></w:p>
      </w:body></w:document>`;
    const bytes = makeDocxUploadFixture(xml);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = { name: 'asha-resume.docx', size: buffer.byteLength, arrayBuffer: async () => buffer } as unknown as File;

    const extracted = await extractResumeFile(file);
    expect(extracted.success).toBe(true);
    expect(extracted.rawText).toContain('Project: Retail Sales Analysis');
    expect(extracted.rawText).toContain('Used Excel to review monthly sales trends.');

    const parsed = parseRawResumeToStructured(extracted.rawText, extracted.fileName, extracted.wordCount, extracted.pageCount, extracted.charCount);
    expect(parsed.contactInfo.name).toBe('Asha Rao');
    expect(parsed.contactInfo.email).toBe('asha@example.com');
    expect(parsed.rawText).toBe(extracted.rawText);
    expect(parsed.additionalEvidence).toContain('Languages: Tamil — Native');

    useWizardStore.setState({ masterResume: null, stagedParsedResume: parsed, tailoredArtifacts: {} });
    useWizardStore.getState().confirmStagedResume();
    const state = useWizardStore.getState();
    expect(state.stagedParsedResume).toBeNull();
    expect(state.masterResume?.rawText).toBe(extracted.rawText);
    const vaultData = buildVaultDataFromState(state);
    expect(vaultData.masterResume?.rawText).toBe(extracted.rawText);
    const { envelope } = await encryptVault(vaultData, 'byoc-test-passphrase', {
      id: 'e2e-user', name: 'Asha Rao', email: 'asha@example.com',
      biometricEnabled: false, updatedAt: new Date().toISOString()
    }, 'BYOC-TEST-RECOVERY-PHRASE');
    const restored = await decryptVault(envelope, 'byoc-test-passphrase');
    expect(restored.masterResume).toEqual(parsed);
    useWizardStore.setState({ masterResume: null, stagedParsedResume: null, tailoredArtifacts: {}, toasts: [] });
  });
});
