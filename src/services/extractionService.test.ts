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
      <Relationship Id="rId3" Target="https://example.com/internal"/>
    </Relationships>`);
    expect(targets.get('rId1')).toBe('https://www.linkedin.com/in/asha-rao');
    expect(targets.has('rId2')).toBe(false);
    expect(targets.has('rId3')).toBe(false);
  });
});

describe('DOCX document structure extraction', () => {
  it('includes content from the main document, tables, headers and footers', async () => {
    const xml = (text: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
    const archive = makeStoredDocxArchive([
      { name: 'word/document.xml', xml: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Asha Rao Bachelor of Commerce with strong analytical project experience and practical skills</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item from course work</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table skill</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Advanced Excel</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Role</w:t><w:br/><w:t>Company</w:t><w:tab/><w:t>2024</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table role: Risk Analyst</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table employer: Sample Bank</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>மொழி: தமிழ்</w:t></w:r></w:p><w:p><w:hyperlink r:id="rId1"><w:r><w:t>LinkedIn Profile</w:t></w:r></w:hyperlink></w:p></w:body></w:document>` },
      { name: 'word/_rels/document.xml.rels', xml: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/asha-rao" TargetMode="External"/></Relationships>` },
      { name: 'word/header1.xml', xml: xml('asha@example.com') },
      { name: 'word/footer1.xml', xml: xml('Portfolio: asha.example') }
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
