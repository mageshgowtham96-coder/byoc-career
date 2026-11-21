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

- [x] Audit parser and profile schema for content loss and structural assumptions; strict section boundaries and broader additional-evidence capture are implemented.
- [x] Add generated DOCX archive regression fixtures for paragraphs, real table cells, mixed runs, line breaks, headers/footers, footnotes, endnotes, comments, hyperlinks and Unicode. One list-numbering structure is covered; numbering-format and style variants still need broader fixtures.
- [x] Preserve complete extracted text in the encrypted profile and classify supported non-standard career sections as additional evidence. Fine-grained per-field provenance/uncertainty metadata remains incomplete.
- [x] Make profile sections editable through the guided builder launched from intake review, including education, experience, skills, projects and other career evidence.
- [x] Remove employment-centric readiness penalties for students/freshers; education, projects and additional evidence can establish profile readiness.
- [x] Keep the user's original file unchanged and retain extracted source text/metadata in the encrypted Master Resume. A separate binary archive is intentionally not part of the approved local-first workflow.
- [x] Test actual generated DOCX upload -> extraction -> structured profile -> store confirmation -> encrypted vault round-trip. Physical UI/browser workflow remains separate.

### Workstream 2: Resume Studio, truthful optimisation and export

- [x] Audit MasterResume, guided builder, tailoring and exporters as one data flow.
- [x] Store the approved optimized result as structured fields in the active encrypted MasterResume after user confirmation. A separate version-history feature is not required by the user's approved workflow.
- [x] Add optional optimization draft, before/after comparison, user acceptance, separate Master Resume approval and DOCX/PDF export. The approved profile replaces the active Master Resume only after confirmation.
- [x] Add exact source-text mapping for optimized headline/summary, experience bullets and project descriptions, preserve record identity/count, and require explicit human review. AI semantic correctness is not guaranteed.
- [x] Ensure the approved Master Resume is exported as DOCX and PDF where supported.
- [x] Remove lossy Unicode stripping. DOCX preserves Unicode; PDF rejects unsupported glyphs rather than silently corrupting text. Embedded multilingual PDF fonts remain open.
- [x] Keep original-layout preservation optional; default styled document generation is available.
- [x] Add DOCX/PDF export -> re-import round-trip tests and verify Master Profile source immutability. Visual layout comparisons across office suites and devices remain open.

### Workstream 3: Job intelligence correctness

- [x] Replace substring matching and "Verified Match" labels with token-boundary keyword overlap. The UI explicitly says experience and eligibility are not assessed; separate dimensions remain unimplemented rather than guessed.
- [x] Add token-boundary regression tests for short skills (Go, R, C) and unrelated-word false positives.
- [x] Extend the job model to separate user-specified required skills, preferred skills and provider-listed tags. Record published-location eligibility as explicitly eligible, regionally eligible, explicitly ineligible, not stated or not assessed; do not infer eligibility from job-description prose.
- [x] Ensure ranking labels and uses the value as keyword overlap only, not verified qualification evidence.
- [x] Clarify provider/source coverage in README and UI; do not imply exhaustive India-wide coverage.

### Workstream 4: AI vetting and authenticity

- [x] Audit AI prompts and output types for unsupported claims.
- [x] Relabel AI estimates and not-assessed fields; no unsupported employer, salary-market, culture or growth assertions are presented as verified facts.
- [x] Remove or relabel unsupported salary-market, culture, growth and company-risk assertions.
- [x] Require explicit human factual review before exporting generated summaries, cover letters and interview content. Experience bullets are source-mapped; tailored summaries and non-empty cover letters must carry valid Master Profile evidence IDs; interview questions carry per-question evidence references. References are displayed in the UI and cleared when the profile changes or a different variant is selected.
- [ ] Per-sentence semantic verification is not claimed: evidence links are review aids, not proof that each generated sentence is fully supported. Human review remains mandatory.
- [x] Keep explicit user-triggered AI calls and no silent provider fallback.

### Workstream 5: Vault, offline and lifecycle safety

- [x] Audit encrypted storage boundaries, snapshots, import/export and recovery.
- [x] Add a warning for readable Workspace Snapshot exports; generated resume artifacts and profile data are stored through the encrypted vault.
- [x] Implement versioned PBKDF2 v5 migration with v3/v4 compatibility and recovery-path tests.
- [x] Keep local resume editing and document export available without network/API; AI optimization remains optional.
- [x] Add tests for export cancellation and vault migration/recovery; interrupted device-level write/reload testing remains open.

### Workstream 6: Whole-product regression and release

- [x] Add a whole-product integration journey from structured profile through keyword match, evidence-validated tailoring, reviewed DOCX/PDF export, application tracking and encrypted vault reload. DOCX intake/approval/encrypted-vault round-trip is separately covered.
- [ ] Complete a full five-phase mobile UI consistency and physical-device accessibility review; current cinematic redesign is not yet applied to every workflow screen.
- [x] Run TypeScript, all Vitest tests, production build and Android debug build on the exact PR head; the final documentation sync will be revalidated before handoff.
- [x] Inspect the exact-head CI logs and APK artifact; record SHA-256 and artifact ID in the handoff.
- [x] Complete a post-implementation conceptual review of the changed data flows and add regression tests for issues found. A physical-device and full visual UI review remain separate.
- [ ] Keep PR draft until evidence is complete; do not merge to main.

