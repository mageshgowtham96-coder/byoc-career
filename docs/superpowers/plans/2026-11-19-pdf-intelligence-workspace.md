# PDF Intelligence Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first, mobile PDF workspace with local PDF operations and explicitly user-triggered Groq document Q&A.

**Architecture:** A small PDF service owns validation, metadata, page operations and safe export using the existing `pdf-lib` dependency. A dedicated React tab owns ephemeral file/chat state and calls the existing extraction and Groq services only after user action. Navigation adds one tab; no store schema changes or automatic persistence.

**Tech Stack:** React 19, TypeScript, Vitest, existing `pdf-lib`, existing extractionService and Groq `callGroqChat`, Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-11-19-pdf-intelligence-workspace.md`

## Global Constraints
- Preserve local-first behavior and existing encrypted-vault schema.
- No backend, new API key, automatic provider failover, or silent upload.
- Max PDF size: 10 MiB; max page count: 250; combined merge input: 20 MiB.
- AI input text ceiling: 18,000 characters; question ceiling: 2,000 characters; user explicitly submits each question.
- OCR is not claimed or implemented in this tranche.
- No merge to `main`; build on PR #9 head.

## Review Focus
- Malformed/encrypted/zero-byte PDFs — reject cleanly with no uncaught error.
- PDF page bombs / oversized files — enforce byte/page ceilings before copying pages.
- Corrupt or out-of-range page selections — reject and preserve original bytes.
- Missing Groq key/offline/429/5xx/empty output — surface provider errors without silent provider changes.
- Sensitive document text — no automatic network call, persistence or console logging.

---

### Task 1: PDF domain service

**Files:**
- Create: `src/services/pdfWorkspaceService.ts`
- Test: `src/services/pdfWorkspaceService.test.ts`

**Interfaces:**
- `inspectPdf(file: File): Promise<PdfInspection>`
- `mergePdfs(files: File[]): Promise<Uint8Array>`
- `extractPdfPages(file: File, pageNumbers: number[]): Promise<Uint8Array>` (1-based page numbers)
- `rotatePdfPage(file: File, pageNumber: number, degrees: 90 | 180 | 270): Promise<Uint8Array>`
- `reorderPdfPages(file: File, pageNumbers: number[]): Promise<Uint8Array>`
- `createPdfBlob(bytes: Uint8Array): Blob`
- `parsePdfPageNumbers(value: string): number[]`

- [x] Write tests for valid metadata, empty/oversized/wrong-signature/malformed PDFs and page ceiling.
- [x] Run tests to verify failures.
- [x] Implement validation and metadata inspection with `pdf-lib`.
- [x] Write tests for merge, split/extract, rotate and reorder including invalid indexes.
- [x] Run tests to verify failures, then implement operations.
- [x] Run the focused test suite.

### Task 2: Explicit document Q&A service

**Files:**
- Create: `src/services/pdfQuestionService.ts`
- Test: `src/services/pdfQuestionService.test.ts`

**Interface:**
- `askPdfQuestion(question: string, extractedText: string, apiKey: string): Promise<string>`

- [x] Test missing key, blank/oversized question, empty text, text limit, prompt-injection-resistant system instructions, empty model output and provider errors.
- [x] Verify RED, then implement using existing `callGroqChat`.
- [x] Keep answer bounded and require the model to identify unsupported facts as not found.
- [x] Run focused tests.

### Task 3: Documents workspace UI and navigation

**Files:**
- Create: `src/components/documents/DocumentsTab.tsx`
- Test: `src/components/documents/DocumentsTab.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/NavigationShell.tsx`
- Modify: `src/types/index.ts`

**Interfaces:**
- Component reads existing `groqApiKey` from `useWizardStore`.
- No new persisted store fields.

- [x] Test workspace mount without AI submission, explicit question submission, missing-key local use, removal and temporary preview cleanup.
- [x] Test local PDF validation and page operations in service tests.
- [ ] Verify RED before implementing the React component (component interaction tests were added after the first UI implementation; see execution note).
- [x] Implement responsive UI with clear local/AI data-boundary disclosure and explicit Groq question submission.
- [x] Add lazy-loaded Documents tab to desktop and mobile navigation.
- [x] Run focused tests and full CI test suite.

### Task 4: Integration and release evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-11-19-pdf-intelligence-workspace.md`
- Modify: `docs/superpowers/plans/2026-11-19-pdf-intelligence-workspace.md`

- [x] Run TypeScript, full Vitest suite and production web build — passed on code head `454b614ff2d22e4a5698deb7269e2b1e560437b5`; 201 tests across 23 files.
- [x] Run Android debug build through CI and inspect job logs/artifact — passed for code head `454b614ff2d22e4a5698deb7269e2b1e560437b5`; artifact `14524967789` was downloaded, ZIP integrity verified, and APK identified as an Android package.
- [x] Review diff for data leaks, memory/resource hazards, accessibility and error handling; no new persistence, backend or silent AI transfer introduced.
- [x] Document remaining limitations: OCR and full PDF.js rendering are not included; Android preview depends on platform support; physical Android testing remains manual.
- [x] Create/update draft PR #10 stacked on PR #9; do not merge.

## Execution notes
- Service tests were written first. Early CI runs exposed real issues: jsdom File API gaps, a missing mocked Groq error export, malformed-PDF page-tree exceptions, and numeric page-list validation. Each was corrected and re-run.
- The React component interaction tests were added after the first UI implementation rather than observing a pre-implementation RED state. They now cover no automatic AI call, explicit question submission, missing-key local use, and temporary preview cleanup.
- The tested application-code head is `454b614ff2d22e4a5698deb7269e2b1e560437b5`. TypeScript, 201 tests across 23 files, production web build and Android debug APK all passed for this head. The artifact ZIP SHA-256 is `72f48d9cf9881f2e3010bfd1a3aa524eefbcd22a57a02d0727fda5bbe0ecd7ca`; extracted APK SHA-256 is `45e5d4a27ecadcf4e56b1356a4b5d33e29eee2f127a7cacf7d629c609b33181f`. Later branch commits only update tests/documentation; no application code changed after the tested code head.
