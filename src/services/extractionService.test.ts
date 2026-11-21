import { describe, expect, it } from 'vitest';
import { extractExternalHyperlinkTargets, extractResumeFile, parseRawResumeToStructured } from './extractionService';

function makeOversizedDocxArchive(): Uint8Array {
  const entryName = new TextEncoder().encode('word/document.xml');
  const bytes = new Uint8Array(30 + 46 + entryName.length + 22);
  const view = new DataView(bytes.buffer);

  // Local file header
  view.setUint32(0, 0x04034b50, true);

  // Central directory entry
  const central = 30;
  view.setUint32(central, 0x02014b50, true);
  view.setUint16(central + 10, 8, true);
  view.setUint32(central + 20, 1, true);
  view.setUint32(central + 24, 21 * 1024 * 1024, true);
  view.setUint16(central + 28, entryName.length, true);
  view.setUint32(central + 42, 0, true);
  bytes.set(entryName, central + 46);

  // End of central directory
  const eocd = central + 46 + entryName.length;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 16, central, true);
  return bytes;
}

describe('PDF text extraction', () => {
  const makePdf = (body: string) => {
    const bytes = new TextEncoder().encode(body);
    return {
      name: 'renuka-resume.pdf',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;
  };

  it('extracts text only from PDF content streams and counts two pages', async () => {
    const pdf = [
      '%PDF-1.4',
      '1 0 obj << /Type /Page /Contents 3 0 R >> endobj',
      '2 0 obj << /Type /Page /Contents 4 0 R >> endobj',
      '3 0 obj << /Length 58 >> stream',
      'BT (Renuka Resume) Tj (Financial Accounts Analyst) Tj ET',
      'endstream endobj',
      '4 0 obj << /Length 36 >> stream',
      'BT (Reviewed fraud reports) Tj ET',
      'endstream endobj',
      '%%EOF'
    ].join('\n');
    const result = await extractResumeFile(makePdf(pdf));
    expect(result.success).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.rawText).toContain('Renuka Resume');
    expect(result.rawText).toContain('Financial Accounts Analyst');
    expect(result.rawText).toContain('Reviewed fraud reports');
    expect(result.rawText).not.toContain('/Contents');
    expect(result.rawText).not.toContain('endstream');
  });

  it('clearly identifies image-only scanned PDFs and explains that OCR is unavailable', async () => {
    const result = await extractResumeFile(makePdf([
      '%PDF-1.4',
      '1 0 obj << /Type /Page /Resources << /XObject << /Im1 2 0 R >> >> >> endobj',
      '2 0 obj << /Type /XObject /Subtype /Image /Width 1200 /Height 1600 >> stream',
      'binary-image-data',
      'endstream endobj',
      '%%EOF'
    ].join('\n')));
    expect(result.success).toBe(false);
    expect(result.isScannedImage).toBe(true);
    expect(result.error).toMatch(/image-only or scanned/i);
    expect(result.error).toMatch(/does not perform OCR/i);
  });
});

describe('empty resume schema validation', () => {
  it('describes missing career evidence without making paid work history mandatory', async () => {
    const { validateExtractedSchema } = await import('./extractionService');
    const validation = validateExtractedSchema(null);
    expect(validation.missingMandatoryFields).toContain('Work, project or education evidence');
    expect(validation.missingMandatoryFields).not.toContain('Work Experience Milestones');
  });
});

describe('resume extraction resource limits', () => {
  it('rejects a DOCX whose declared uncompressed document exceeds the safety limit', async () => {
    const archive = makeOversizedDocxArchive();
    const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    const file = { name: 'oversized.docx', size: archiveBuffer.byteLength, arrayBuffer: async () => archiveBuffer } as unknown as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('20MB extraction safety limit');
  });

  it('rejects an upload above the 10MB file-size limit before parsing', async () => {
    const file = { name: 'large.txt', size: 10 * 1024 * 1024 + 1 } as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('10MB limit');
  });
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredDocxArchive(entries: Array<{ name: string; xml: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.xml);
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
    localParts.push(local);

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
    cv.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  const all = [...localParts, ...centralParts, eocd];
  const result = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of all) { result.set(part, offset); offset += part.length; }
  return result;
}

describe('DOCX external hyperlink relationships', () => {
  it('extracts only external HTTP(S) relationships', () => {
    const targets = extractExternalHyperlinkTargets(`<Relationships>
      <Relationship Id="rId1" Target="https://www.linkedin.com/in/asha-rao" TargetMode="External"/>
      <Relationship Id="rId2" Target="file:///private/path" TargetMode="External"/>
      <Relationship Id="rId3" Target="mailto:asha@example.com" TargetMode="External"/>
      <Relationship Id="rId4" Target="https://example.com/internal"/>
    </Relationships>`);
    expect(targets.get('rId1')).toBe('https://www.linkedin.com/in/asha-rao');
    expect(targets.has('rId2')).toBe(false);
    expect(targets.get('rId3')).toBe('mailto:asha@example.com');
    expect(targets.has('rId4')).toBe(false);
  });
});

describe('DOCX document structure extraction', () => {
  it('includes content from the main document, tables, headers, footers and notes', async () => {
    const xml = (text: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
    const archive = makeStoredDocxArchive([
      { name: 'word/document.xml', xml: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Asha Rao Bachelor of Commerce with strong analytical project experience and practical skills</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item from course work</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table skill</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Advanced Excel</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Role</w:t><w:br/><w:t>Company</w:t><w:tab/><w:t>2024</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table role: Risk Analyst</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table employer: Sample Bank</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>மொழி: தமிழ்</w:t></w:r></w:p><w:p><w:hyperlink r:id="rId1"><w:r><w:t>LinkedIn Profile</w:t></w:r></w:hyperlink></w:p></w:body></w:document>` },
      { name: 'word/_rels/document.xml.rels', xml: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/asha-rao" TargetMode="External"/></Relationships>` },
      { name: 'word/header1.xml', xml: xml('asha@example.com') },
      { name: 'word/footer1.xml', xml: xml('Portfolio: asha.example') },
      { name: 'word/footnotes.xml', xml: xml('Footnote: project methodology.') },
      { name: 'word/endnotes.xml', xml: xml('Endnote: reporting source.') },
      { name: 'word/comments.xml', xml: xml('Comment: confirm this date.') }
    ]);
    const buffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    const file = { name: 'resume.docx', size: buffer.byteLength, arrayBuffer: async () => buffer } as unknown as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('Asha Rao');
    expect(result.rawText).toContain('• List item from course work');
    expect(result.rawText).toContain('Table skill');
    expect(result.rawText).toContain('Advanced Excel');
    expect(result.rawText).toContain('Role\nCompany 2024');
    expect(result.rawText).toContain('asha@example.com');
    expect(result.rawText).toContain('Portfolio: asha.example');
    expect(result.rawText).toContain('Footnote: project methodology.');
    expect(result.rawText).toContain('Endnote: reporting source.');
    expect(result.rawText).toContain('Comment: confirm this date.');
    expect(result.rawText).toContain('Table role: Risk Analyst');
    expect(result.rawText).toContain('Table employer: Sample Bank');
    expect(result.rawText).toContain('மொழி: தமிழ்');
    expect(result.rawText).toContain('LinkedIn Profile: https://www.linkedin.com/in/asha-rao');
    expect(result.rawText.match(/LinkedIn Profile/g)).toHaveLength(1);
  });
  it('accepts a short but readable resume instead of imposing an arbitrary ten-word minimum', async () => {
    const text = `Asha Rao\nasha@example.com\nSQL`;
    const file = { name: 'short-resume.txt', size: text.length, text: async () => text } as unknown as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(true);
    expect(result.wordCount).toBe(4);
  });

});

describe('explicit skill extraction', () => {
  it('does not promote ordinary prose mentions into structured skills', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Professional Summary
I go to market; R is a course grade; C is a campus code. SQL was mentioned in a job description.
Education
Bachelor of Commerce - City University - 2025`);
    expect(parsed.skills.technical).not.toContain('Go');
    expect(parsed.skills.technical).not.toContain('R');
    expect(parsed.skills.technical).not.toContain('C');
    expect(parsed.skills.technical).not.toContain('SQL');
  });

  it('classifies short skill tokens when the user explicitly lists them under Skills', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Skills
Go, R, C, SQL
Education
Bachelor of Commerce - City University - 2025`);
    expect(parsed.skills.technical).toEqual(expect.arrayContaining(['Go', 'R', 'C', 'SQL']));
  });
});



describe('resume experience extraction across common layouts', () => {
  it('handles role, employer and date on separate lines plus inline date-range entries', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Professional Experience
Software Engineer
Acme Technologies
Jan 2022 – Present
• Built services using Go.
• Improved API reliability.
Product Analyst | Beta Labs | 2020 - 2021
- Analysed customer data.
Education
Bachelor of Commerce - City University - 2019`);

    expect(parsed.experiences).toHaveLength(2);
    expect(parsed.experiences[0]).toMatchObject({
      role: 'Software Engineer',
      company: 'Acme Technologies',
      startDate: 'Jan 2022',
      endDate: 'Present',
      isCurrent: true
    });
    expect(parsed.experiences[0].bullets).toEqual([
      'Built services using Go.',
      'Improved API reliability.'
    ]);
    expect(parsed.experiences[1]).toMatchObject({
      role: 'Product Analyst',
      company: 'Beta Labs',
      startDate: '2020',
      endDate: '2021',
      isCurrent: false
    });
    expect(parsed.experiences[1].bullets).toEqual(['Analysed customer data.']);
  });
});

describe('unfamiliar personal evidence section headings', () => {
  it('captures one editable evidence item per line under unfamiliar headings', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
My Journey
Started as a volunteer tutor in 2022.
What I Have Done
Created a monthly sales report for a family business.
My Contributions
Helped coordinate a community event.
Personal Achievements
Won second place in a district-level competition.`);
    expect(parsed.additionalEvidence).toEqual([
      'My Journey: Started as a volunteer tutor in 2022.',
      'What I Have Done: Created a monthly sales report for a family business.',
      'My Contributions: Helped coordinate a community event.',
      'Personal Achievements: Won second place in a district-level competition.'
    ]);
  });
});

describe('additional resume section boundaries', () => {
  it('captures training while keeping references out of AI-ready additional evidence', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Professional Summary
Commerce graduate with analytical project experience.
Skills
SQL, Excel
Professional Development
Completed a business analytics course in 2025.
References
John Doe — john@example.com — +91 9876543210`);
    expect(parsed.additionalEvidence).toContain('Professional Development: Completed a business analytics course in 2025.');
    expect((parsed.additionalEvidence || []).some((item) => item.includes('john@example.com'))).toBe(false);
    expect(parsed.skills.domains).not.toContain('John Doe — john@example.com — +91 9876543210');
  });
});

describe('summary extraction completeness', () => {
  it('keeps every summary line until the next exact section heading', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Professional Summary
First sentence describes the candidate.
Second sentence describes the candidate.
Third sentence describes the candidate.
Fourth sentence describes the candidate.
Fifth sentence describes the candidate.
Sixth sentence describes the candidate.
Skills
SQL, Excel`);
    expect(parsed.summary).toContain('Sixth sentence describes the candidate.');
    expect(parsed.summary).not.toContain('SQL, Excel');
  });

  it('captures inline summary text after a colon', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Professional Summary: Commerce graduate with practical data analysis experience.
Skills
Excel, SQL`);
    expect(parsed.summary).toContain('Commerce graduate with practical data analysis experience.');
  });
});

describe('resume identity and location extraction', () => {
  it('does not mistake a role headline for a candidate name and extracts a clear header location', () => {
    const parsed = parseRawResumeToStructured(`Software Engineer
Chennai, Tamil Nadu, India
asha@example.com
Professional Summary
Builds reliable software systems.`);
    expect(parsed.contactInfo.name).toBe('');
    expect(parsed.headline).toBe('Software Engineer');
    expect(parsed.contactInfo.location).toBe('Chennai, Tamil Nadu, India');
  });

  it('extracts an explicitly labelled location while preserving a Unicode candidate name', () => {
    const parsed = parseRawResumeToStructured(`ஆஷா ராவ்
Location: Chennai, India
asha@example.com
Professional Summary
Commerce graduate with project experience.`);
    expect(parsed.contactInfo.name).toBe('ஆஷா ராவ்');
    expect(parsed.contactInfo.location).toBe('Chennai, India');
  });

  it('extracts only the location from a pipe-separated contact line', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
Location: Chennai, India | asha@example.com | +91 90000 00000
Professional Summary
Commerce graduate with project experience.`);
    expect(parsed.contactInfo.location).toBe('Chennai, India');
    expect(parsed.contactInfo.email).toBe('asha@example.com');
  });

  it('extracts a name and location from a pipe-separated resume header', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao | Chennai, Tamil Nadu, India
Software Engineer
asha@example.com
Professional Summary
Builds reliable software systems.`);
    expect(parsed.contactInfo.name).toBe('Asha Rao');
    expect(parsed.contactInfo.location).toBe('Chennai, Tamil Nadu, India');
    expect(parsed.headline).toBe('Software Engineer');
  });

  it('separates a comma-delimited candidate name from a location in the same header line', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao, Chennai, India
Software Engineer
asha@example.com
Professional Summary
Builds reliable software systems.`);
    expect(parsed.contactInfo.name).toBe('Asha Rao');
    expect(parsed.contactInfo.location).toBe('Chennai, India');
  });

  it('detects non-technical role headlines from pipe-separated contact lines', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao | Chennai, India | Customer Support Associate
asha@example.com
Professional Summary
Helps customers resolve product issues.`);
    expect(parsed.contactInfo.name).toBe('Asha Rao');
    expect(parsed.contactInfo.location).toBe('Chennai, India');
    expect(parsed.headline).toBe('Customer Support Associate');
  });

  it('does not treat an email provider or social profile URL as a personal portfolio', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha@gmail.com
https://www.linkedin.com/in/asha-rao
https://github.com/asha-rao
Professional Summary
Commerce graduate with project experience.`);
    expect(parsed.contactInfo.portfolio).toBe('');
    expect(parsed.contactInfo.linkedin).toContain('linkedin.com/in/asha-rao');
    expect(parsed.contactInfo.github).toContain('github.com/asha-rao');
  });

  it('extracts a portfolio URL only when explicitly labelled or clearly present in the header', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha@gmail.com
Portfolio: asha.dev
Professional Summary
Commerce graduate with project experience.`);
    expect(parsed.contactInfo.portfolio).toBe('asha.dev');
  });

  it('continues past email and social domains to find a separate personal site', () => {
    const parsed = parseRawResumeToStructured(`Asha Rao
asha@gmail.com
https://www.linkedin.com/in/asha-rao
asha.dev
Professional Summary
Commerce graduate with project experience.`);
    expect(parsed.contactInfo.portfolio).toBe('asha.dev');
  });
});
