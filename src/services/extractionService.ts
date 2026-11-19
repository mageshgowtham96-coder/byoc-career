import type { MasterResume, ExperienceItem, EducationItem, ProjectItem, CertificationItem, ByocStructuredApplicationData } from '../types';
export type { ByocStructuredApplicationData };

export interface ExtractionResult {
  success: boolean;
  isScannedImage?: boolean;
  rawText: string;
  parsedProfile?: MasterResume;
  error?: string;
  wordCount: number;
  pageCount: number;
  charCount: number;
  fileName: string;
}

/**
 * Client-Side Binary & Stream Text Extractor for PDF, DOCX, TXT, MD
 * Operates purely locally with 0 external network dependencies and zero fabrication.
 */
export async function extractResumeFile(file?: File | null): Promise<ExtractionResult> {
  if (!file) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName: 'unknown',
      error: 'No file was provided for extraction.'
    };
  }

  const fileName = file.name || 'uploaded_document';
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Guard against 0-byte or corrupted empty files
  if (file.size === 0) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'The uploaded file is empty (0 bytes). Please upload a valid document or paste text directly.'
    };
  }

  // 2. Guard against files exceeding memory limits (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'File size exceeds the 10MB limit. Please upload a smaller document.'
    };
  }

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'heic', 'svg']);
  const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'docx']);

  if (IMAGE_EXTENSIONS.has(fileExt)) {
    return {
      success: false,
      isScannedImage: true,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'Raster image OCR is not supported in local extraction. Please upload a .docx, .txt, .md, or selectable-text .pdf file, or paste your resume text in Manual Paste Fallback.'
    };
  }

  if (fileExt && !SUPPORTED_EXTENSIONS.has(fileExt)) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: `Unsupported file format (.${fileExt}). Local extraction supports .docx, .txt, .md, and basic selectable-text .pdf files; otherwise paste text directly.`
    };
  }

  try {
    let rawText = '';
    let detectedPages = 1;

    if (fileExt === 'txt' || fileExt === 'md' || !fileExt) {
      rawText = await file.text();
      const words = rawText.split(/\s+/).filter(Boolean);
      detectedPages = Math.max(1, Math.ceil(words.length / 450));
    } else if (fileExt === 'pdf') {
      const pdfExtraction = await extractPdfText(file);
      rawText = pdfExtraction.text;
      detectedPages = pdfExtraction.pageCount;
    } else if (fileExt === 'docx') {
      rawText = await extractDocxText(file);
      const words = rawText.split(/\s+/).filter(Boolean);
      detectedPages = Math.max(1, Math.ceil(words.length / 450));
    }

    // Clean text
    const cleanedText = (rawText || '').replace(/\r\n/g, '\n').trim();
    const words = cleanedText ? cleanedText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const charCount = cleanedText.length;

    // Empty extraction is a failure; short but readable documents remain valid input.
    // Do not label encrypted/complex PDFs or short DOCX files as scanned images.
    if (wordCount === 0) {
      return {
        success: false,
        isScannedImage: false,
        rawText: cleanedText,
        wordCount,
        pageCount: detectedPages || 1,
        charCount,
        fileName,
        error:
          'No readable text could be extracted. The document may be image-based, encrypted, or use an unsupported encoding. The original file is not modified; try another export or use Manual Paste.'
      };
    }

    const parsedProfile = parseRawResumeToStructured(cleanedText, fileName, wordCount, detectedPages, charCount);

    return {
      success: true,
      rawText: cleanedText,
      parsedProfile,
      wordCount,
      pageCount: detectedPages,
      charCount,
      fileName
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown parsing error occurred while reading document';
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: errorMsg
    };
  }
}

function collectPdfOperatorText(content: string): string[] {
  const chunks: string[] = [];

  // Match Tj operator (single string in parentheses)
  const tjRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tjRegex.exec(content)) !== null) {
    const clean = cleanPdfString(match[1]);
    if (clean) chunks.push(clean);
  }

  // Standard PDF writers often encode text operands as hexadecimal strings,
  // including pdf-lib's built-in fonts. Do not scan arbitrary stream bytes for
  // words; only decode hex strings immediately followed by a text-show operator.
  const hexTjRegex = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  while ((match = hexTjRegex.exec(content)) !== null) {
    const clean = cleanPdfHexString(match[1]);
    if (clean) chunks.push(clean);
  }

  // Match TJ operator (array of strings)
  const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/g;
  while ((match = arrayTjRegex.exec(content)) !== null) {
    const inner = match[1];
    const itemRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)|<([0-9a-fA-F\s]+)>/g;
    let itemMatch: RegExpExecArray | null;
    let combined = '';
    while ((itemMatch = itemRegex.exec(inner)) !== null) {
      combined += itemMatch[1] !== undefined ? cleanPdfString(itemMatch[1]) : cleanPdfHexString(itemMatch[2]);
    }
    if (combined.trim()) chunks.push(combined.trim());
  }

  return chunks;
}

/**
 * Client-side PDF stream extractor for basic uncompressed or FlateDecode ASCII text-operator PDFs.
 * Does not OCR raster pages or decode encrypted / complex CID glyph-mapped PDFs.
 */
async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert buffer to Latin-1 / byte-safe binary string
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binaryString += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  // Determine actual page count from PDF catalog
  const pageMatches = binaryString.match(/\/Type\s*\/Page\b/g);
  let pageCount = pageMatches ? pageMatches.length : 1;

  const textChunks = collectPdfOperatorText(binaryString);
  let totalPdfDecompressedBytes = 0;

  // Safely attempt FlateDecode decompression on streams to inspect Tj/TJ operators when uncompressed scan is sparse
  if (textChunks.join(' ').split(/\s+/).filter(Boolean).length < 15 && typeof DecompressionStream !== 'undefined') {
    const streamHeaderRegex = /<<([\s\S]*?)>>\s*stream\r?\n/g;
    let headerMatch: RegExpExecArray | null;
    while ((headerMatch = streamHeaderRegex.exec(binaryString)) !== null) {
      const dict = headerMatch[1];
      if (!/\/FlateDecode\b/.test(dict)) continue;

      const streamStart = headerMatch.index + headerMatch[0].length;
      const streamEnd = binaryString.indexOf('endstream', streamStart);
      if (streamEnd === -1 || streamEnd <= streamStart) continue;

      // Trim trailing CRLF / LF before endstream
      let endIdx = streamEnd;
      if (endIdx > streamStart && bytes[endIdx - 1] === 0x0a) endIdx--;
      if (endIdx > streamStart && bytes[endIdx - 1] === 0x0d) endIdx--;

      try {
        const compressedSlice = bytes.slice(streamStart, endIdx);
        const remainingBudget = MAX_DECOMPRESSED_DOCUMENT_BYTES - totalPdfDecompressedBytes;
        if (remainingBudget <= 0) break;
        const decompressed = await decompressBytes(compressedSlice, 'deflate', remainingBudget);
        totalPdfDecompressedBytes += decompressed.byteLength;
        const streamText = new TextDecoder('latin1').decode(decompressed);
        const decompressedChunks = collectPdfOperatorText(streamText);
        if (decompressedChunks.length > 0) {
          textChunks.push(...decompressedChunks);
        }
      } catch {
        // Ignore non-zlib or encrypted streams cleanly
      }
    }
  }

  let fullText = textChunks.join('\n');

  // Normalize page count if 0
  if (pageCount < 1) {
    const words = fullText.split(/\s+/).filter(Boolean).length;
    pageCount = Math.max(1, Math.ceil(words / 450));
  }

  return { text: fullText, pageCount };
}

function cleanPdfString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .trim();
}

function cleanPdfHexString(raw: string): string {
  const hex = raw.replace(/\s/g, '');
  if (!hex || hex.length % 2 !== 0) return '';

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  try {
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\0/g, '').trim();
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3)).trim();
    }
    return new TextDecoder('windows-1252', { fatal: false }).decode(bytes).trim();
  } catch {
    return '';
  }
}

const MAX_DECOMPRESSED_DOCUMENT_BYTES = 20 * 1024 * 1024;

async function decompressBytes(
  compressed: Uint8Array,
  format: 'deflate' | 'deflate-raw',
  maxOutputBytes = MAX_DECOMPRESSED_DOCUMENT_BYTES
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Compressed stream decompression is unavailable in this browser runtime.');
  }
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  const writePromise = writer.write(new Uint8Array(compressed)).then(() => writer.close());
  // Prevent Node/Web unhandledRejection if readable stream errors before writePromise finishes
  writePromise.catch(() => undefined);

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  let readFailed = false;
  let totalLen = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        totalLen += value.byteLength;
        if (totalLen > maxOutputBytes) {
          throw new Error('Document expands beyond the 20MB extraction safety limit. The file may be malformed or compressed unexpectedly.');
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    readFailed = true;
    await reader.cancel().catch(() => undefined);
    await writePromise.catch(() => undefined);
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (!readFailed) {
    await writePromise;
  }

  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

export function extractExternalHyperlinkTargets(relationshipsXml: string): Map<string, string> {
  const targets = new Map<string, string>();
  const relationshipTags = relationshipsXml.match(/<Relationship\b[^>]*>/gi) || [];
  for (const tag of relationshipTags) {
    const id = tag.match(/\bId="([^"]+)"/i)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/i)?.[1];
    const mode = tag.match(/\bTargetMode="([^"]+)"/i)?.[1];
    if (!id || !target || mode?.toLowerCase() !== 'external') continue;
    const decodedTarget = decodeXmlEntities(target);
    if (/^(?:https?:\/\/|mailto:|tel:)/i.test(decodedTarget)) targets.set(id, decodedTarget);
  }
  return targets;
}

function extractParagraphsFromDocumentXml(xml: string, hyperlinkTargets: Map<string, string> = new Map()): string {
  const paragraphBlocks = xml.split(/<\/w:p>/i);
  const lines: string[] = [];
  const tokenRegex = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:br(?:\s[^>]*)?\/>/gi;

  for (const block of paragraphBlocks) {
    const pieces: string[] = [];
    tokenRegex.lastIndex = 0;
    let tokenMatch = tokenRegex.exec(block);
    while (tokenMatch !== null) {
      if (tokenMatch[1] !== undefined) {
        const relationshipId = tokenMatch[1].match(/\br:id="([^"]+)"/i)?.[1];
        const visibleText = Array.from(tokenMatch[2].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi))
          .map((item) => decodeXmlEntities(item[1]))
          .join('')
          .trim();
        const target = relationshipId ? hyperlinkTargets.get(relationshipId) : undefined;
        pieces.push(target && visibleText ? visibleText + ': ' + target : visibleText || target || '');
      } else if (tokenMatch[3] !== undefined) {
        pieces.push(decodeXmlEntities(tokenMatch[3]));
      } else if (/^<w:tab/i.test(tokenMatch[0])) {
        pieces.push('\t');
      } else {
        pieces.push('\n');
      }
      tokenMatch = tokenRegex.exec(block);
    }

    let line = pieces.join('').replace(/[ \t]+/g, ' ').trim();
    if (line && /<w:numPr\b/i.test(block)) line = '• ' + line;
    if (line) lines.push(line);
  }

  if (lines.length > 0) return lines.join('\n');

  // Fallback for non-standard XML fragments without paragraph wrappers.
  const fallbackRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
  const fallbackPieces: string[] = [];
  let fallbackMatch: RegExpExecArray | null;
  while ((fallbackMatch = fallbackRegex.exec(xml)) !== null) {
    if (fallbackMatch[1] !== undefined) fallbackPieces.push(decodeXmlEntities(fallbackMatch[1]));
  }
  return fallbackPieces.join(' ').trim();
}
function extractZipEntryViaCentralDirectory(
  bytes: Uint8Array,
  targetEntryPath: string
): { compressionMethod: number; compressedBytes: Uint8Array; uncompressedSize: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocdSearch = Math.max(0, bytes.length - 65557);

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (cdOffset >= bytes.length) return null;

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let cursor = cdOffset;

  for (let idx = 0; idx < entryCount && cursor + 46 <= bytes.length; idx++) {
    // Central directory header signature 0x02014b50
    if (view.getUint32(cursor, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const entryName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    if (entryName === targetEntryPath) {
      if (uncompressedSize > MAX_DECOMPRESSED_DOCUMENT_BYTES || uncompressedSize === 0xffffffff) {
        throw new Error('DOCX document.xml exceeds the 20MB extraction safety limit.');
      }
      if (localHeaderOffset + 30 > bytes.length) return null;
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) return null;

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) return null;

      return {
        compressionMethod,
        compressedBytes: bytes.subarray(dataStart, dataEnd),
        uncompressedSize
      };
    }

    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

/**
 * Extracts plain text from standard ZIP-packaged .docx files (word/document.xml)
 * supporting both stored (method 0) and deflate-raw (method 8) ZIP entries.
 */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (isZip) {
    const mainEntry = extractZipEntryViaCentralDirectory(bytes, 'word/document.xml');
    if (!mainEntry) {
      throw new Error('Could not locate word/document.xml inside this .docx archive. File may be corrupted or encrypted.');
    }

    const documentParts = [
      'word/document.xml',
      ...Array.from({ length: 10 }, (_, index) => 'word/header' + (index + 1) + '.xml'),
      ...Array.from({ length: 10 }, (_, index) => 'word/footer' + (index + 1) + '.xml'),
      'word/footnotes.xml',
      'word/endnotes.xml',
      'word/comments.xml'
    ];
    const extractedParts: string[] = [];
    let totalDocxUncompressedBytes = 0;
    let hyperlinkTargets = new Map<string, string>();
    const relationshipsEntry = extractZipEntryViaCentralDirectory(bytes, 'word/_rels/document.xml.rels');
    if (relationshipsEntry) {
      if (relationshipsEntry.uncompressedSize > 1024 * 1024) {
        throw new Error('DOCX relationship metadata exceeds the 1MB extraction safety limit.');
      }
      const relationshipBytes = relationshipsEntry.compressionMethod === 0
        ? relationshipsEntry.compressedBytes
        : relationshipsEntry.compressionMethod === 8
          ? await decompressBytes(relationshipsEntry.compressedBytes, 'deflate-raw', 1024 * 1024)
          : null;
      if (!relationshipBytes || relationshipBytes.byteLength !== relationshipsEntry.uncompressedSize) {
        throw new Error('DOCX relationship metadata uses an unsupported or invalid ZIP entry.');
      }
      totalDocxUncompressedBytes += relationshipBytes.byteLength;
      hyperlinkTargets = extractExternalHyperlinkTargets(new TextDecoder('utf-8', { fatal: false }).decode(relationshipBytes));
    }

    for (const partPath of documentParts) {
      const entry = partPath === 'word/document.xml'
        ? mainEntry
        : extractZipEntryViaCentralDirectory(bytes, partPath);
      if (!entry) continue;
      const remainingDocxBudget = MAX_DECOMPRESSED_DOCUMENT_BYTES - totalDocxUncompressedBytes;
      if (remainingDocxBudget <= 0 || entry.uncompressedSize > remainingDocxBudget) {
        throw new Error('DOCX document parts exceed the 20MB combined extraction safety limit.');
      }

      let xmlBytes: Uint8Array;
      if (entry.compressionMethod === 0) {
        xmlBytes = entry.compressedBytes;
      } else if (entry.compressionMethod === 8) {
        xmlBytes = await decompressBytes(entry.compressedBytes, 'deflate-raw', remainingDocxBudget);
      } else {
        throw new Error(
          'DOCX contains an unsupported ZIP compression method (' + entry.compressionMethod +
          ') in ' + partPath + '. Re-save as a standard .docx or use Manual Paste.'
        );
      }

      totalDocxUncompressedBytes += xmlBytes.byteLength;
      if (totalDocxUncompressedBytes > MAX_DECOMPRESSED_DOCUMENT_BYTES) {
        throw new Error('DOCX document parts exceed the 20MB combined extraction safety limit.');
      }
      if (xmlBytes.byteLength !== entry.uncompressedSize) {
        throw new Error('DOCX ' + partPath + ' did not match its declared uncompressed size. The archive may be damaged.');
      }

      const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);
      const extracted = extractParagraphsFromDocumentXml(xml, partPath === 'word/document.xml' ? hyperlinkTargets : new Map());
      if (extracted) extractedParts.push(extracted);
    }

    // Main body is first; additional document parts are appended without modifying the original file.
    return extractedParts.join('\n').trim();
  }

  // Fallback ONLY if raw uncompressed Word XML (containing <w:t>) was saved directly.
  const rawXml = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/<w:t[\s>]/i.test(rawXml)) {
    return extractParagraphsFromDocumentXml(rawXml);
  }

  return '';
}

/**
 * Parses raw text into MasterResume with STRICT ZERO-FABRICATION rules:
 * - If a field is not detected, it remains an empty string or empty array.
 * - NO fake companies (Premier Engineering Org), NO fake bullets, NO fake degrees, NO fake certifications.
 */
export function parseRawResumeToStructured(
  rawText: string,
  fileName: string = 'Uploaded_Resume.pdf',
  wordCount: number = 0,
  pageCount: number = 1,
  charCount: number = 0
): MasterResume {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Exact or explicitly delimited headings only; ordinary prose is never a boundary.
  const sectionHeadingPattern = /^(?:summary|profile|professional summary|about me|overview|executive summary|objective|career objective|professional objective|experience|work experience|professional experience|employment history|work history|education|academic background|academics|qualifications|projects|personal projects|key projects|certifications|licenses|certificates|skills|technical skills|core skills|core competencies|key competencies|key skills|skills and competencies|skills & competencies|relevant skills|competencies|technical competencies|areas of expertise|professional skills|tools and technologies|awards(?: and honours| and honors)?|honours|honors|volunteering|volunteer experience|community involvement|publications|research|languages|professional memberships|memberships|extracurricular activities|activities|leadership activities|training|professional development|courses|coursework|patents|references|personal details|contact|hobbies|interests)(?:\s*(?::|[-–—])\s*.*)?$/i;
  const isResumeSectionHeading = (line: string) => sectionHeadingPattern.test(line.trim());

  // 1. Contact Info Extraction (strictly from regex matches)
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const emailDomain = emailMatch?.[0].split('@')[1]?.toLowerCase() || '';
  const portfolioPattern = /(?:https?:\/\/|www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:dev|me|io|com|in|net|org|co|uk|tech|ai|app|edu)(?:\/[^\s|]*)?/i;
  const explicitPortfolioMatch = rawText.match(/(?:portfolio|personal website|website|web site)\s*[:：-]\s*([^\n|]+)/i);
  const explicitPortfolioCandidate = explicitPortfolioMatch?.[1].match(portfolioPattern)?.[0] || '';
  const isPersonalPortfolioUrl = (candidate: string): boolean => {
    const host = candidate.replace(/^(?:https?:\/\/|www\.)/i, '').split('/')[0].toLowerCase();
    const isEmailProvider = /^(?:gmail|googlemail|yahoo|outlook|hotmail|live|rediffmail|protonmail|icloud)\.(?:com|in|net)$/i.test(host);
    return Boolean(
      host &&
      host !== emailDomain &&
      !host.endsWith('.' + emailDomain) &&
      !isEmailProvider &&
      !/(?:^|\.)linkedin\.com$|(?:^|\.)github\.com$/i.test(host)
    );
  };
  const headerPortfolioCandidate = lines.slice(0, 8)
    .map((line) => line.match(portfolioPattern)?.[0] || '')
    .find((candidate) => candidate && isPersonalPortfolioUrl(candidate));
  const portfolioValue = explicitPortfolioCandidate && isPersonalPortfolioUrl(explicitPortfolioCandidate)
    ? explicitPortfolioCandidate.trim().replace(/[),.;]+$/, '')
    : (headerPortfolioCandidate || '').trim().replace(/[),.;]+$/, '');

  // Name extraction: inspect top lines for a standalone personal name
  let detectedName = '';
  const nameCandidates = lines.slice(0, 6).flatMap((line) =>
    line.split(/[|•]/).flatMap((part) => {
      const commaParts = part.split(',').map((item) => item.trim());
      return commaParts.length > 1 ? [commaParts[0], part.trim()] : [part.trim()];
    })
  );
  for (const line of nameCandidates) {
    // Check if line looks like a person's name (2-4 capitalized words, no punctuation/emails)
    if (
      line.length >= 3 &&
      line.length <= 45 &&
      !line.includes('@') &&
      !line.includes('http') &&
      !line.includes('/') &&
      !/^(resume|curriculum|cv|summary|experience|education|skills|page)/i.test(line) &&
      !/\b(engineer|developer|architect|manager|lead|director|specialist|designer|analyst|scientist|consultant|coordinator|administrator|assistant|teacher|nurse|accountant|executive|technician|intern|student|graduate|professional|officer|support|sales|marketing|finance|associate|representative|customer|service|operations|business|data|technical|program|retail|administrative|associate|representative|customer|service|operations|business|data|technical|program|retail|administrative|inc|llc|ltd|pvt|company|university|college)\b/i.test(line) &&
      /^[\p{L}\p{M}'’\-]+(?:\s+[\p{L}\p{M}'’\-]+){1,3}$/u.test(line)
    ) {
      detectedName = line;
      break;
    }
  }

  const explicitLocationMatch = rawText.match(/(?:^|\n)\s*(?:location|based in|city|address)\s*[:：-]\s*([^\n]+)/i);
  const headerLocationLine = lines.slice(0, 10)
    .flatMap((line) => line.split(/[|•]/))
    .map((part) => part.trim())
    .find((part) => {
      if (part.length < 5 || part.length > 90 || !part.includes(',')) return false;
      if (part.includes('@') || /https?:\/\//i.test(part) || /\d/.test(part)) return false;
      if (/\b(inc\.?|llc|ltd\.?|limited|corp\.?|corporation|pvt\.?|private limited|university|college|institute|technologies|solutions)\b/i.test(part)) return false;
      if (isResumeSectionHeading(part)) return false;
      if (/\b(engineer|developer|architect|manager|lead|director|specialist|designer|analyst|scientist|consultant|coordinator|administrator|assistant|teacher|nurse|accountant|executive|technician|intern|student|graduate|professional|officer|support|sales|marketing|finance)\b/i.test(part)) return false;
      return part.split(',').filter((item) => item.trim().length > 1).length >= 2;
    });
  const headerLocationParts = (headerLocationLine || '').split(',').map((part) => part.trim());
  if (detectedName && headerLocationParts[0]?.toLowerCase() === detectedName.toLowerCase()) {
    headerLocationParts.shift();
  }
  const detectedLocation = (explicitLocationMatch?.[1] || headerLocationParts.join(', ')).split(/[|•]/)[0].trim();

  // 2. Headline & Professional Summary
  let detectedHeadline = '';
  let summary = '';

  // Look for a headline in first few lines beneath the name
  const headlineCandidates = lines.slice(0, 6).flatMap((line) => line.split(/[|•]/).map((part) => part.trim()));
  for (const line of headlineCandidates) {
    if (line !== detectedName && !line.includes('@') && line.length > 5 && line.length < 60) {
      if (/(engineer|developer|architect|manager|lead|director|specialist|designer|analyst|scientist|support|associate|representative|coordinator|administrator|teacher|nurse|accountant|sales|marketing|operations|business|finance|retail|human resources)/i.test(line)) {
        detectedHeadline = line;
        break;
      }
    }
  }

  const summaryHeaderIdx = lines.findIndex((line) =>
    /^(?:summary|profile|professional summary|about me|overview|executive summary|objective|career objective|professional objective)(?:\s*(?::|[-–—])\s*.*)?$/i.test(line)
  );

  if (summaryHeaderIdx !== -1) {
    const summaryHeaderMatch = lines[summaryHeaderIdx].match(
      /^(?:summary|profile|professional summary|about me|overview|executive summary|objective|career objective|professional objective)(?:\s*(?::|[-–—])\s*(.*))?$/i
    );
    const inlineSummary = summaryHeaderMatch?.[1]?.trim();
    const summaryLines: string[] = inlineSummary ? [inlineSummary] : [];
    for (let i = summaryHeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isResumeSectionHeading(line)) break;
      summaryLines.push(line);
    }
    summary = summaryLines.join(' ').trim();
  }

  // 3. Skills extraction. A technology word elsewhere in a resume is not proof
  // that the candidate claims it as a skill. Populate structured skills only from
  // an explicit skills/competencies section; preserve all other text in rawText.
  const technicalSkills: string[] = [];
  const softSkills: string[] = [];
  const tools: string[] = [];
  const domains: string[] = [];

  const commonTech = [
    'React', 'TypeScript', 'JavaScript', 'Node.js', 'Next.js', 'Python', 'Go', 'Golang',
    'R', 'C', 'C++', 'C#', '.NET', 'Java', 'Rust', 'GraphQL', 'Tailwind CSS', 'Redux', 'Zustand', 'HTML5', 'CSS3',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'REST APIs',
    'Kafka', 'RabbitMQ', 'Microservices', 'FastAPI', 'Django', 'Spring Boot', 'SQL'
  ];
  const commonTools = ['Excel', 'Power BI', 'Tableau', 'Figma', 'Jira', 'Postman', 'VS Code', 'GitHub Actions', 'Datadog', 'Jest', 'Playwright', 'Git', 'Vite', 'Webpack', 'Docker', 'Terraform'];
  const commonSoft = [
    'System Architecture', 'Agile Delivery', 'Cross-Functional Leadership',
    'Mentorship', 'Code Review', 'Stakeholder Management', 'Sprint Planning'
  ];
  // Match only exact section headings or headings followed by an explicit delimiter.
  // This prevents ordinary prose such as "Awards platform migration" from ending a section.
  const sectionHeadings = [
    'summary', 'profile', 'professional summary', 'experience', 'work experience',
    'professional experience', 'employment history', 'work history', 'education',
    'academic background', 'academics', 'qualifications', 'projects', 'personal projects',
    'key projects', 'certifications', 'licenses', 'certificates', 'skills',
    'technical skills', 'core skills', 'core competencies', 'key competencies',
    'key skills', 'skills and competencies', 'skills & competencies', 'relevant skills',
    'competencies', 'technical competencies', 'areas of expertise', 'professional skills',
    'tools and technologies', 'awards', 'awards and honours', 'awards and honors',
    'honours', 'honors', 'volunteering', 'volunteer experience', 'community involvement',
    'publications', 'research', 'languages', 'professional memberships', 'memberships',
    'extracurricular activities', 'activities', 'leadership activities', 'training', 'professional development', 'courses', 'coursework', 'patents', 'references', 'personal details', 'contact', 'objective', 'career objective', 'professional objective', 'hobbies', 'interests'
  ];
  const matchSectionHeading = (line: string): { heading: string; inlineContent: string } | null => {
    const trimmed = line.trim();
    for (const heading of sectionHeadings) {
      const escaped = heading.replace(/[.*+?^()|[\]\\]/g, '\\$&');
      const match = trimmed.match(new RegExp('^' + escaped + '(?:\\s*[:–—-]\\s*(.*))?$', 'i'));
      if (match) return { heading, inlineContent: (match[1] || '').trim() };
    }
    return null;
  };
  const skillHeadings = [
    'skills', 'technical skills', 'core skills', 'core competencies', 'key competencies',
    'key skills', 'skills and competencies', 'skills & competencies', 'relevant skills',
    'competencies', 'technical competencies', 'areas of expertise', 'professional skills',
    'tools and technologies'
  ];
  const skillsHeaderIndex = lines.findIndex((line) =>
    skillHeadings.some((heading) => matchSectionHeading(line)?.heading === heading)
  );
  if (skillsHeaderIndex !== -1) {
    const inlineSkills = matchSectionHeading(lines[skillsHeaderIndex])?.inlineContent || '';
    const skillLines = [inlineSkills, ...lines.slice(skillsHeaderIndex + 1)];
    for (const line of skillLines) {
      if (matchSectionHeading(line)) break;
      const entries = line.replace(/^[•*\-]\s*/, '').split(/[,;|•]/).map((entry) => entry.trim()).filter(Boolean);
      for (const entry of entries) {
        if (entry.length > 0 && entry.length <= 80) {
          const normalized = entry.toLowerCase();
          const addUnique = (target: string[]) => {
            if (!target.some((item) => item.toLowerCase() === normalized)) target.push(entry);
          };
          if (commonTools.some((item) => item.toLowerCase() === normalized)) addUnique(tools);
          else if (commonTech.some((item) => item.toLowerCase() === normalized)) addUnique(technicalSkills);
          else if (commonSoft.some((item) => item.toLowerCase() === normalized)) addUnique(softSkills);
          else addUnique(domains);
        }
      }
    }
  }

  // 4. Experiences Extraction (support common one-line and multi-line layouts)
  const experiences: ExperienceItem[] = [];
  const expIndex = lines.findIndex((line) => /^(?:experience|work experience|employment history|work history|professional experience)(?:\s*(?::|[-–—])\s*.*)?$/i.test(line));

  if (expIndex !== -1) {
    const expSlice = lines.slice(expIndex + 1);
    let currentExp: Partial<ExperienceItem> | null = null;
    let bullets: string[] = [];
    let pendingDates: { startDate: string; endDate: string; isCurrent: boolean } | null = null;

    const flushExperience = () => {
      if (!currentExp || !(currentExp.role || currentExp.company || bullets.length)) return;
      experiences.push({
        id: 'exp-' + experiences.length,
        company: currentExp.company || '',
        role: currentExp.role || '',
        startDate: currentExp.startDate || '',
        endDate: currentExp.endDate || '',
        location: currentExp.location || '',
        bullets: [...bullets],
        isCurrent: Boolean(currentExp.isCurrent || /^(present|current)$/i.test(currentExp.endDate || ''))
      });
      currentExp = null;
      bullets = [];
    };

    const parseExperienceHeader = (value: string): Pick<ExperienceItem, 'role' | 'company' | 'location'> => {
      const cleaned = value.replace(/[()[\]]/g, '').replace(/[|,–—-]+$/g, '').trim();
      const atMatch = cleaned.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch) return { role: atMatch[1].trim(), company: atMatch[2].trim(), location: '' };

      const parts = cleaned.split(/\s*\|\s*|\s+[-–—]\s+|\s*,\s*/).map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const companyFirst = /\b(inc\.?|llc|ltd\.?|limited|corp\.?|corporation|technologies|solutions|services|bank|university|hospital|group|pvt\.?)\b/i.test(parts[0]);
        const roleSecond = /\b(engineer|developer|architect|manager|lead|director|specialist|designer|analyst|scientist|consultant|coordinator|administrator|assistant|teacher|nurse|accountant|executive|technician|intern|officer|support|sales|marketing|finance)\b/i.test(parts[1]);
        return companyFirst && roleSecond
          ? { role: parts[1], company: parts[0], location: parts.slice(2).join(', ') }
          : { role: parts[0], company: parts[1], location: parts.slice(2).join(', ') };
      }
      return { role: cleaned, company: '', location: '' };
    };

    const dateRangePattern = /((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*)?(?:19|20)\d{2})\s*(?:[-–—]|to)\s*((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*)?(?:19|20)\d{2}|present|current)/i;
    const dateOnlyPattern = /^(?:(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*)?(?:19|20)\d{2}|present|current)$/i;

    for (const rawLine of expSlice) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isResumeSectionHeading(line)) break;

      const isBullet = /^[•*\-–]\s*/.test(line) || /^\d+[.)]\s*/.test(line);
      if (isBullet) {
        if (currentExp) bullets.push(line.replace(/^[•*\-–]\s*/, '').replace(/^\d+[.)]\s*/, '').trim());
        continue;
      }

      const dateRange = dateRangePattern.exec(line);
      if (dateRange) {
        const headerText = line.slice(0, dateRange.index).replace(/[|,–—-]+$/g, '').trim();
        if (headerText) {
          if (currentExp && bullets.length > 0) flushExperience();
          if (!currentExp) currentExp = parseExperienceHeader(headerText);
          else if (currentExp.role && !currentExp.company) {
            const parsedHeader = parseExperienceHeader(headerText);
            currentExp.company = parsedHeader.company || parsedHeader.role;
            currentExp.location = parsedHeader.location || currentExp.location;
          }
          else {
            flushExperience();
            currentExp = parseExperienceHeader(headerText);
          }
        }
        if (!currentExp) currentExp = {};
        currentExp.startDate = dateRange[1].trim();
        currentExp.endDate = dateRange[2].trim();
        currentExp.isCurrent = /^(present|current)$/i.test(dateRange[2].trim());
        continue;
      }

      if (dateOnlyPattern.test(line)) {
        if (!currentExp) {
          pendingDates = { startDate: line, endDate: '', isCurrent: /^(present|current)$/i.test(line) };
        } else if (!currentExp.startDate) {
          currentExp.startDate = line;
        } else if (!currentExp.endDate) {
          currentExp.endDate = line;
          currentExp.isCurrent = /^(present|current)$/i.test(line);
        } else if (bullets.length > 0) {
          flushExperience();
          pendingDates = { startDate: line, endDate: '', isCurrent: /^(present|current)$/i.test(line) };
        }
        continue;
      }

      if (!currentExp) {
        currentExp = { ...parseExperienceHeader(line), ...(pendingDates || {}) };
        pendingDates = null;
        continue;
      }

      if (!currentExp.company && currentExp.role && bullets.length === 0) {
        currentExp.company = line;
        if (pendingDates) {
          currentExp.startDate = pendingDates.startDate;
          currentExp.endDate = pendingDates.endDate;
          currentExp.isCurrent = pendingDates.isCurrent;
          pendingDates = null;
        }
        continue;
      }

      if (currentExp.company && !currentExp.location && bullets.length === 0 && line.includes(',') && line.length < 90) {
        currentExp.location = line;
        continue;
      }

      if (bullets.length > 0) {
        flushExperience();
        currentExp = { ...parseExperienceHeader(line), ...(pendingDates || {}) };
        pendingDates = null;
      } else if (!currentExp.role) {
        currentExp.role = line;
      }
    }

    flushExperience();
  }

  // 5. Education Extraction (strictly parsed, zero fabrication)
  const education: EducationItem[] = [];
  const eduIndex = lines.findIndex((line) => /^(?:education|academic background|academics|qualifications)(?:\s*(?::|[-–—])\s*.*)?$/i.test(line));

  if (eduIndex !== -1) {
    const eduSlice = lines.slice(eduIndex + 1);
    for (let i = 0; i < Math.min(eduSlice.length, 20); i++) {
      const line = eduSlice[i];
      if (isResumeSectionHeading(line)) {
        break;
      }
      if (/(bachelor|master|phd|b\.s|m\.s|b\.tech|m\.tech|bca|mca|degree|diploma|university|college|institute)/i.test(line)) {
        const yearMatch = line.match(/(20\d\d|19\d\d)/);
        education.push({
          id: 'edu-' + education.length,
          institution: line.split(/[-–|,]/)[0]?.trim() || line,
          degree: line.split(/[-–|,]/)[1]?.trim() || '',
          field: '',
          gradYear: yearMatch ? yearMatch[0] : ''
        });
      }
    }
  }

  // 6. Projects & Certifications (strictly from detected headers, zero fabrication)
  const projects: ProjectItem[] = [];
  const projIndex = lines.findIndex((line) => /^(?:projects|personal projects|key projects)(?:\s*(?::|[-–—])\s*.*)?$/i.test(line));
  if (projIndex !== -1) {
    const projSlice = lines.slice(projIndex + 1);
    let currentProject: ProjectItem | null = null;
    const saveProject = () => {
      if (currentProject && currentProject.title.trim()) projects.push(currentProject);
      currentProject = null;
    };
    for (const rawLine of projSlice.slice(0, 40)) {
      const line = rawLine.trim();
      if (isResumeSectionHeading(line)) break;
      if (!line || line.length > 500) continue;
      const isBullet = /^[•*\-–]\s*/.test(line) || /^\d+[.)]\s*/.test(line);
      const cleanLine = line.replace(/^[•*\-–]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      if (!currentProject) {
        currentProject = { id: 'proj-' + projects.length, title: cleanLine, description: '', technologies: [] };
        continue;
      }
      // Long or explicitly bulleted lines are contribution details, not new project titles.
      if (isBullet || cleanLine.length > 55) {
        currentProject.description = [currentProject.description, cleanLine].filter(Boolean).join(' ');
      } else if (!currentProject.description) {
        currentProject.description = cleanLine;
      } else {
        saveProject();
        currentProject = { id: 'proj-' + projects.length, title: cleanLine, description: '', technologies: [] };
      }
    }
    saveProject();
  }

  const additionalEvidence: string[] = [];
  const additionalSectionPattern = /^(awards(?: and honours| and honors)?|honours|honors|volunteering|volunteer experience|community involvement|publications|research|languages|professional memberships|memberships|extracurricular activities|activities|leadership activities|training|professional development|courses|coursework|patents|hobbies|interests)(?:\s*(?::|[-–—])\s*(.*))?$/i;
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(additionalSectionPattern);
    if (!heading) continue;
    const category = heading[1].trim();
    const inlineContent = (heading[2] || '').trim();
    if (inlineContent) additionalEvidence.push(category + ': ' + inlineContent);
    for (let next = index + 1; next < lines.length; next++) {
      if (isResumeSectionHeading(lines[next])) break;
      const item = lines[next].replace(/^[•*\-–]\s*/, '').trim();
      if (item) additionalEvidence.push(category + ': ' + item);
    }
  }

  const certifications: CertificationItem[] = [];
  const certIndex = lines.findIndex((line) => /^(?:certifications|licenses|certificates)(?:\s*(?::|[-–—])\s*.*)?$/i.test(line));
  if (certIndex !== -1) {
    const certSlice = lines.slice(certIndex + 1);
    for (let i = 0; i < Math.min(certSlice.length, 10); i++) {
      const line = certSlice[i];
      if (isResumeSectionHeading(line)) break;
      if (line.length > 5 && line.length < 90) {
        certifications.push({
          id: 'cert-' + certifications.length,
          name: line,
          issuer: '',
          issueDate: ''
        });
      }
    }
  }

  return {
    rawText,
    contactInfo: {
      name: detectedName,
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      location: detectedLocation,
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      github: githubMatch ? githubMatch[0] : '',
      portfolio: portfolioValue
    },
    headline: detectedHeadline,
    summary,
    skills: {
      technical: technicalSkills,
      soft: softSkills,
      tools,
      domains
    },
    experiences,
    education,
    projects,
    certifications,
    additionalEvidence,
    stats: {
      wordCount: wordCount || rawText.split(/\s+/).filter(Boolean).length,
      pageCount: pageCount || 1,
      charCount: charCount || rawText.length,
      lastParsedDate: new Date().toISOString(),
      sourceFileName: fileName
    }
  };
}

/**
 * Maps raw unstructured text or MasterResume into the strict BYOC Target Output Schema
 */
export function mapResumeToTargetSchema(
  resume?: MasterResume | null,
  rawText?: string
): ByocStructuredApplicationData {
  if (!resume && rawText && rawText.trim().length > 0) {
    resume = parseRawResumeToStructured(rawText);
  }

  if (!resume) {
    return {
      personal_details: {
        full_name: '',
        email: '',
        phone: '',
        location: ''
      },
      professional_summary: '',
      work_experience: [],
      skills: [],
      education: []
    };
  }

  return {
    personal_details: {
      full_name: resume.contactInfo?.name || '',
      email: resume.contactInfo?.email || '',
      phone: resume.contactInfo?.phone || '',
      location: resume.contactInfo?.location || ''
    },
    professional_summary: resume.summary || '',
    work_experience: (resume.experiences || []).map((exp) => ({
      company: exp.company || '',
      role: exp.role || '',
      duration: [exp.startDate, exp.endDate].filter(Boolean).join(' - '),
      key_responsibilities: exp.bullets || []
    })),
    skills: Array.from(
      new Set([
        ...(resume.skills?.technical || []),
        ...(resume.skills?.soft || []),
        ...(resume.skills?.tools || []),
        ...(resume.skills?.domains || [])
      ])
    ),
    education: (resume.education || []).map((edu) => ({
      degree: [edu.degree, edu.field].filter(Boolean).join(' in '),
      institution: edu.institution || '',
      year: edu.gradYear || ''
    }))
  };
}

export interface SchemaValidationResult {
  isValid: boolean;
  isComplete: boolean;
  missingMandatoryFields: string[];
  warnings: string[];
  completenessPercent: number;
}

/**
 * Validates extracted career data against the mandatory application schema
 * and provides clear, user-friendly fallback alerts/empty-states.
 */
export function validateExtractedSchema(
  data: ByocStructuredApplicationData | MasterResume | null | undefined
): SchemaValidationResult {
  if (!data) {
    return {
      isValid: false,
      isComplete: false,
      missingMandatoryFields: [
        'Candidate Full Name',
        'Email Address',
        'Professional Summary',
        'Work Experience Milestones',
        'Skills & Competencies'
      ],
      warnings: ['No profile data is currently staged or loaded.'],
      completenessPercent: 0
    };
  }

  const missing: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const isTargetSchema = 'personal_details' in data;

  const name = isTargetSchema
    ? data.personal_details?.full_name
    : data.contactInfo?.name;
  const email = isTargetSchema
    ? data.personal_details?.email
    : data.contactInfo?.email;
  const phone = isTargetSchema
    ? data.personal_details?.phone
    : data.contactInfo?.phone;
  const summary = isTargetSchema
    ? data.professional_summary
    : data.summary;
  const experiences = isTargetSchema ? data.work_experience : data.experiences;
  const education = isTargetSchema ? data.education : data.education;
  const projects = isTargetSchema ? [] : data.projects;
  const skills = isTargetSchema
    ? data.skills
    : [
        ...(data.skills?.technical || []),
        ...(data.skills?.soft || []),
        ...(data.skills?.tools || []),
        ...(data.skills?.domains || [])
      ];

  // 1. Mandatory: Candidate Name
  if (!name || name.trim().length === 0 || name.trim().toLowerCase() === 'candidate') {
    missing.push('Candidate Full Name');
    warnings.push('Full name could not be extracted with high confidence.');
  } else {
    score += 20;
  }

  // 2. Mandatory: Email Address
  if (!email || !email.includes('@')) {
    missing.push('Email Address');
    warnings.push('Valid email address is missing from contact details.');
  } else {
    score += 20;
  }

  // Optional: Phone
  if (!phone || phone.trim().length === 0) {
    warnings.push('Phone number is empty. (Optional, recommended for recruiter callbacks)');
  }

  // 3. Mandatory: Professional Summary
  if (!summary || summary.trim().length < 15) {
    missing.push('Professional Summary');
    warnings.push('Professional summary is missing or brief.');
  } else {
    score += 20;
  }

  // 4. Career evidence: paid employment is not mandatory for students or career changers.
  const hasCareerEvidence = (Array.isArray(experiences) && experiences.length > 0) ||
    (Array.isArray(projects) && projects.length > 0) ||
    (Array.isArray(education) && education.length > 0) ||
    (!isTargetSchema && Array.isArray(data.additionalEvidence) && data.additionalEvidence.length > 0);
  if (!hasCareerEvidence) {
    missing.push('Work, project or education evidence');
    warnings.push('No work, project or education evidence was detected. You can add whichever applies to your situation.');
  } else {
    score += 25;
  }

  // 5. Skills and competencies
  if (!Array.isArray(skills) || skills.length === 0) {
    missing.push('Skills & Competencies');
    warnings.push('No skills or competencies detected; add only those you can support with your experience, studies or projects.');
  } else {
    score += 15;
  }

  return {
    isValid: missing.length === 0,
    isComplete: missing.length === 0 && warnings.length === 0,
    missingMandatoryFields: missing,
    warnings,
    completenessPercent: Math.min(100, score)
  };
}
