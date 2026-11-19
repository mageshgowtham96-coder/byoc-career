# BYOC Integrity Completion Implementation Plan

> **For agentic workers:** Use the executing-plans skill task-by-task. The owner has explicitly authorized implementation on this feature branch; do not merge to main.

**Goal:** Correct the documented product-model and logic errors across resume intake, job intelligence, AI assessments, security and release verification while preserving BYOC's local-first principles.

**Architecture:** Keep the existing React/TypeScript/Capacitor application and encrypted local store. Make the career profile the evidence source of truth; keep originals immutable and generated resume versions separate. Separate source facts, calculations and AI interpretation in job intelligence.

**Tech Stack:** React 19, TypeScript 7, Zustand 5, Vite 8, Capacitor 8, pdf-lib, docx, Vitest, Bun.

**Spec:** `docs/superpowers/designs/2026-11-19-byoc-integrity-completion.md`

## Global Constraints

- No merge to main.
- No mandatory backend, cloud storage, new API keys, authenticated scraping or automatic applications.
- Preserve existing vault and recovery compatibility; use versioned migration only.
- Do not invent candidate facts or job/employer facts.
- Original-format resume preservation is optional.
- Approved resumes must be exportable as DOCX/PDF and stored as structured records, not raw text alone.
- Run CI on the exact final commit before reporting completion.

## Review Focus

- Unusual DOCX structures, tables, Unicode, headers/footers, lists and malformed archives.
- Students, freshers, career changers and profiles with no work experience.
- Short skill tokens (e.g. Go, R, C) and misleading substring matches.
- Missing or contradictory job requirements, unknown dates and ambiguous remote eligibility.
- AI outputs with no supporting evidence, truncated output or unavailable model.
- Existing vaults and emergency recovery backups during any security change.

---

### Workstream 1: Resume evidence and document lifecycle

- [ ] Audit parser and profile schema for content loss and structural assumptions.
- [ ] Add regression tests using real generated DOCX fixtures with paragraphs, tables, links, headers/footers, lists and Unicode.
- [ ] Preserve extracted content that cannot be confidently classified; add provenance/uncertainty instead of dropping it.
- [ ] Make all profile sections editable during review, including education, experience, skills, projects and other career evidence.
- [ ] Remove employment-centric readiness penalties for students/freshers; report missing information contextually, not as universal incompleteness.
- [ ] Keep original uploaded bytes separate from structured profile and resume versions.
- [ ] Test upload -> extraction -> review -> confirmation -> reload using actual DOCX archives.

### Workstream 2: Resume Studio, truthful optimisation and export

- [ ] Audit MasterResume, guided builder, tailoring and exporters as one data flow.
- [ ] Define versioned structured resume records linked to the career profile and source evidence.
- [ ] Add a resume version workflow: draft, compare, edit, approve, export and retain prior approved versions.
- [ ] Enforce evidence mapping for factual claims; unsupported suggestions require explicit user confirmation.
- [ ] Ensure optimised output is generated as a document and exported as DOCX and PDF.
- [ ] Preserve Unicode; remove lossy character stripping.
- [ ] Keep original-layout preservation as an optional path; default styled generation remains available.
- [ ] Add round-trip tests: export DOCX/PDF, re-import, compare content and verify original/master unchanged.

### Workstream 3: Job intelligence correctness

- [ ] Replace substring matching and "Verified Match" labels with distinct keyword overlap, evidence-backed skill fit, experience alignment and eligibility dimensions.
- [ ] Add token-boundary tests for short skills (Go, R, C) and phrase/context cases.
- [ ] Distinguish required vs preferred skills and explicit vs inferred eligibility; unknown remains unknown.
- [ ] Ensure ranking does not treat lexical overlap as qualification evidence.
- [ ] Clarify provider/source coverage in UI and source metadata; do not imply exhaustive India-wide coverage.

### Workstream 4: AI vetting and authenticity

- [ ] Audit AI prompts and output types for unsupported claims.
- [ ] Separate employer/job-description facts, external verified facts, deterministic calculations and AI interpretation.
- [ ] Remove or relabel unsupported salary-market, culture, growth and company-risk assertions.
- [ ] Ensure generated resume claims and interview/cover-letter content map to source evidence or require confirmation.
- [ ] Keep explicit user-triggered AI calls and no silent provider fallback.

### Workstream 5: Vault, offline and lifecycle safety

- [ ] Audit encrypted storage boundaries, snapshots, import/export and recovery.
- [ ] Add prominent warning for plaintext workspace snapshots and ensure no accidental plaintext persistence of sensitive resume artifacts.
- [ ] Evaluate PBKDF2 work-factor migration with versioned compatibility tests before changing existing vault parameters.
- [ ] Ensure local resume editing/export works without network/API.
- [ ] Test cancellation, failed export, interrupted update and reload semantics.

### Workstream 6: Whole-product regression and release

- [ ] Add integration coverage for profile -> jobs -> match -> truthful tailoring -> export -> tracking -> reload.
- [ ] Review mobile navigation and five-phase workflow consistency.
- [ ] Run TypeScript, all Vitest tests, production build and Android debug build on exact branch head.
- [ ] Inspect CI logs and APK artifact; record SHA-256 and artifact ID.
- [ ] Perform a separate post-implementation conceptual review and fix any Critical/Important issues with regression tests.
- [ ] Keep PR draft until evidence is complete; do not merge to main.

