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
- [x] Add generated DOCX archive regression fixtures for paragraphs, real table cells, mixed runs, line breaks, headers/footers/notes and Unicode. Hyperlink relationships and all Word list-numbering styles still need broader fixtures.
- [x] Preserve complete extracted text in the encrypted profile and classify supported non-standard career sections as additional evidence. Fine-grained per-field provenance/uncertainty metadata remains incomplete.
- [x] Make profile sections editable through the guided builder launched from intake review, including education, experience, skills, projects and other career evidence.
- [x] Remove employment-centric readiness penalties for students/freshers; education, projects and additional evidence can establish profile readiness.
- [ ] Keep a separately encrypted copy of original uploaded file bytes. Current intake does not retain the binary; it leaves the user's source file unchanged and stores extracted source text in the encrypted profile.
- [x] Test actual generated DOCX upload -> extraction -> structured profile -> store confirmation -> encrypted vault round-trip. Physical UI/browser workflow remains separate.

### Workstream 2: Resume Studio, truthful optimisation and export

- [x] Audit MasterResume, guided builder, tailoring and exporters as one data flow.
- [ ] Add a separate version-history model for multiple approved Master Resume presentations. Current approved optimization is saved as structured fields in the active encrypted MasterResume; prior approved versions are not retained as a version list.
- [x] Add optional optimization draft, before/after comparison, user acceptance, separate Master Resume approval and DOCX/PDF export. Retaining prior approved versions remains open.
- [x] Add exact source-text mapping for optimized headline/summary, experience bullets and project descriptions, preserve record identity/count, and require explicit human review. AI semantic correctness is not guaranteed.
- [x] Ensure the approved Master Resume is exported as DOCX and PDF where supported.
- [x] Remove lossy Unicode stripping. DOCX preserves Unicode; PDF rejects unsupported glyphs rather than silently corrupting text. Embedded multilingual PDF fonts remain open.
- [x] Keep original-layout preservation optional; default styled document generation is available.
- [ ] Add full DOCX/PDF export -> re-import round-trip tests and visual layout comparisons. Master profile immutability is covered by current export/optimization tests.

### Workstream 3: Job intelligence correctness

- [x] Replace substring matching and "Verified Match" labels with token-boundary keyword overlap. The UI explicitly says experience and eligibility are not assessed; separate dimensions remain unimplemented rather than guessed.
- [x] Add token-boundary regression tests for short skills (Go, R, C) and unrelated-word false positives.
- [ ] Extend the job data model to distinguish required vs preferred skills and explicit vs inferred eligibility. Current provider data does not consistently supply these distinctions.
- [x] Ensure ranking labels and uses the value as keyword overlap only, not verified qualification evidence.
- [x] Clarify provider/source coverage in README and UI; do not imply exhaustive India-wide coverage.

### Workstream 4: AI vetting and authenticity

- [x] Audit AI prompts and output types for unsupported claims.
- [x] Relabel AI estimates and not-assessed fields; no unsupported employer, salary-market, culture or growth assertions are presented as verified facts.
- [x] Remove or relabel unsupported salary-market, culture, growth and company-risk assertions.
- [x] Require explicit human factual review before exporting generated summaries, cover letters and interview content; source-map experience bullet replacements. Programmatic evidence mapping for all prose remains open.
- [x] Keep explicit user-triggered AI calls and no silent provider fallback.

### Workstream 5: Vault, offline and lifecycle safety

- [x] Audit encrypted storage boundaries, snapshots, import/export and recovery.
- [x] Add a warning for readable Workspace Snapshot exports; generated resume artifacts and profile data are stored through the encrypted vault.
- [x] Implement versioned PBKDF2 v5 migration with v3/v4 compatibility and recovery-path tests.
- [x] Keep local resume editing and document export available without network/API; AI optimization remains optional.
- [x] Add tests for export cancellation and vault migration/recovery; interrupted device-level write/reload testing remains open.

### Workstream 6: Whole-product regression and release

- [ ] Add a complete whole-product integration journey from profile through jobs, match, tailoring, export, tracking and reload. DOCX intake/encrypted-vault round-trip is covered separately.
- [ ] Complete a full five-phase mobile UI consistency and physical-device accessibility review; current cinematic redesign is not yet applied to every workflow screen.
- [ ] Run TypeScript, all Vitest tests, production build and Android debug build on the exact final PR head.
- [ ] Inspect final exact-head CI logs and APK artifact; record SHA-256 and artifact ID.
- [ ] Complete a final post-implementation conceptual review and fix any Critical/Important issues with regression tests.
- [ ] Keep PR draft until evidence is complete; do not merge to main.

