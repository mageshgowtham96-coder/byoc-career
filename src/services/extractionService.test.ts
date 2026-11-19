import { describe, expect, it } from 'vitest';
import { extractResumeFile } from './extractionService';

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

describe('DOCX document structure extraction', () => {
  it('includes content from the main document, tables, headers and footers', async () => {
    const xml = (text: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
    const archive = makeStoredDocxArchive([
      { name: 'word/document.xml', xml: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Asha Rao Bachelor of Commerce with strong analytical project experience and practical skills</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>List item from course work</w:t></w:r></w:p><w:p><w:r><w:t>Role</w:t><w:br/><w:t>Company</w:t><w:tab/><w:t>2024</w:t></w:r></w:p></w:body></w:document>` },
      { name: 'word/header1.xml', xml: xml('asha@example.com') },
      { name: 'word/footer1.xml', xml: xml('Portfolio: asha.example') }
    ]);
    const buffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
    const file = { name: 'resume.docx', size: buffer.byteLength, arrayBuffer: async () => buffer } as unknown as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('Asha Rao');
    expect(result.rawText).toContain('• List item from course work');
    expect(result.rawText).toContain('Role\nCompany 2024');
    expect(result.rawText).toContain('asha@example.com');
    expect(result.rawText).toContain('Portfolio: asha.example');
  });
  it('accepts a short but readable resume instead of imposing an arbitrary ten-word minimum', async () => {
    const text = `Asha Rao\nasha@example.com\nSQL`;
    const file = { name: 'short-resume.txt', size: text.length, text: async () => text } as unknown as File;
    const result = await extractResumeFile(file);
    expect(result.success).toBe(true);
    expect(result.wordCount).toBe(4);
  });

});