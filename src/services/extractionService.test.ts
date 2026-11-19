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
    const file = new File([makeOversizedDocxArchive()], 'oversized.docx');
    const result = await extractResumeFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('20MB extraction safety limit');
  });

  it('rejects an upload above the 10MB file-size limit before parsing', async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt');
    const result = await extractResumeFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain('10MB limit');
  });
});
