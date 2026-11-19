# BYOC PDF Intelligence Workspace — Design Specification

**Status:** Approved implementation direction, delegated to the assistant by the project owner on 2026-11-19.

## Goal
Add a mobile-first PDF workspace to BYOC that provides safe local document inspection and common PDF operations, with explicitly user-triggered AI questions grounded in extracted document text.

## Product decisions
- Integrate as a first-class BYOC workspace tab, not a detached utility.
- Preserve the existing local-first, encrypted-vault architecture. The selected PDF, extracted text, and chat transcript remain in component memory and are not persisted to the vault by default.
- PDF loading, metadata inspection, page selection, merge/split/reorder/rotate and export are local.
- AI document questions are optional and require a deliberate user action. Before sending, disclose that extracted PDF text will be sent to Groq. Never auto-send or silently fail over to another provider.
- Reuse the existing Groq API key and `callGroqChat`; do not add another API key or backend.
- Never invent missing document content. AI responses must distinguish evidence in the document from information not found and cite page numbers only where page-level source mapping is available.
- Preserve existing 10MB upload protection and introduce a page-count ceiling to protect low-memory Android devices.

## First implementation tranche
- A dedicated Documents tab with a mobile-first PDF workspace.
- Validate PDF extension/signature, size and page count before processing.
- Read PDF metadata and page count with the already-installed `pdf-lib`.
- Use the existing local extraction pipeline for selectable text; identify scanned/unsupported PDFs honestly and do not claim OCR is available.
- Provide local merge/split/rotate/reorder operations and export.
- Provide explicit Groq Q&A for extracted text with bounded input and response handling.
- Preview through the platform PDF viewer when supported; provide a safe open/download fallback rather than assuming Android WebView embeds PDFs.
- Keep files and conversation ephemeral in memory; clear object URLs and selected document state when removed/unmounted.

## Out of scope for this tranche
- OCR for scanned/image-only PDFs. This requires a separately evaluated on-device OCR engine, language packs, memory profiling and Android device testing.
- PDF editing of text/images, digital signatures, password removal, cloud storage, server processing, or automatic upload.
- Promising PDF preview support in every Android WebView.
- Persistent document library; this would need explicit encrypted-vault schema and storage-quota design.

## Acceptance criteria
1. Reject empty, oversized, malformed, non-PDF and encrypted/unreadable files with actionable errors and no crash.
2. Enforce a documented maximum page count before expensive processing.
3. Metadata/page count and local page operations do not call network services.
4. Merge, split, rotate and reorder preserve expected page counts and produce loadable PDFs.
5. AI Q&A cannot run without an explicitly supplied Groq key and user submission.
6. AI requests are bounded; errors, empty output, malformed output, timeout and offline state are surfaced without losing the original PDF.
7. No PDF bytes, extracted text or chat transcript are persisted automatically.
8. UI is keyboard-accessible and usable at narrow Android viewport widths.
9. Automated tests cover validation, operation correctness, Q&A gating/bounds/error handling and component flows.
10. CI runs TypeScript, full test suite, web production build and Android debug build. A real Android install remains a manual acceptance test.
