# PDF Intelligence Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first, mobile PDF workspace with local PDF operations and explicitly user-triggered Groq document Q&A.

**Architecture:** A small PDF service owns validation, metadata, page operations and safe export using the existing `pdf-lib` dependency. A dedicated React tab owns ephemeral file/chat state and calls the existing extraction and Groq services only after user action. Navigation adds one tab; no store schema changes or automatic persistence.

**Tech Stack:** React 19, TypeScript, Vitest, existing `pdf-lib`, existing extractionService and Groq `callGroqChat`, Capacitor Android.

**Spec:** `docs/superpowers/specs/2026-11-19-pdf-intelligence-workspace.md`

## Global Constraints
- Preserve local-first behavior and existing encrypted-vault schema.
- No backend, new API key, automatic provider failover, or silent upload.
- Max PDF size: 10 MiB; max page count: 250.
- AI input text ceiling: 18,000 characters; user explicitly submits each question.
- OCR is not claimed or implemented in this tranche.
- No merge to `main`; build on PR #9 head.

## Review Focus
- Malformed/encrypted/zero-byte PDFs — reject cleanly with no uncaught error.
- PDF page bombs / oversized files — enforce limits before rendering or copying pages.
- Corrupt or out-of-range page selections — reject and preserve original bytes.
- Missing Groq key/offline/429/5xx/empty output — surface actionable state without silent provider changes.
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

- [ ] Write tests for valid metadata, empty/oversized/wrong-signature/malformed PDFs and page ceiling.
- [ ] Run tests to verify failures.
- [ ] Implement validation and metadata inspection with `pdf-lib`.
- [ ] Write tests for merge, split/extract, rotate and reorder including invalid indexes.
- [ ] Run tests to verify failures, then implement operations.
- [ ] Run the focused test suite.

### Task 2: Explicit document Q&A service

**Files:**
- Create: `src/services/pdfQuestionService.ts`
- Test: `src/services/pdfQuestionService.test.ts`

**Interfaces:**
- `askPdfQuestion(question: string, extractedText: string, apiKey: string): Promise<string>`

- [ ] Test missing key, blank/oversized question, empty text, text limit, prompt-injection-resistant system instructions, empty model output and provider errors.
- [ ] Verify RED, then implement using existing `callGroqChat`.
- [ ] Keep answer bounded and require the model to identify unsupported facts as not found.
- [ ] Run focused tests.

### Task 3: Documents workspace UI and navigation

**Files:**
- Create: `src/components/documents/DocumentsTab.tsx`
- Create: `src/components/documents/DocumentsTab.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/NavigationShell.tsx`
- Modify: `src/types/index.ts`

**Interfaces:**
- Component reads existing `groqApiKey` from `useWizardStore`.
- No new persisted store fields.

- [ ] Test upload, validation errors, local operations, explicit AI consent/submission, missing key, removal and object URL cleanup.
- [ ] Verify RED, then implement responsive UI with clear local/AI data-boundary disclosure.
- [ ] Add lazy-loaded Documents tab to desktop and mobile navigation.
- [ ] Run focused tests.

### Task 4: Integration and release evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-11-19-pdf-intelligence-workspace.md`
- Modify: `docs/superpowers/plans/2026-11-19-pdf-intelligence-workspace.md`

- [ ] Run TypeScript, full Vitest suite and production web build.
- [ ] Run Android debug build through CI and inspect job logs/artifact.
- [ ] Review diff for data leaks, memory/resource hazards, accessibility and error handling.
- [ ] Document any remaining limitations, especially OCR and physical Android testing.
- [ ] Create/update a draft PR; do not merge.
