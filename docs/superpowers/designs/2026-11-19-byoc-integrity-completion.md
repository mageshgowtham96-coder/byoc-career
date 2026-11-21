# BYOC Integrity Completion — Product Design

**Date:** 2026-11-19
**Status:** Implementation authorized by project owner

## Product invariants

1. BYOC remains local-first. No mandatory backend, cloud storage, new API key, authenticated job-portal scraping, or automatic job application.
2. The user may build a resume from scratch or import an existing DOCX/PDF without being forced into a BYOC template.
3. Preserve the uploaded original unchanged.
4. Keep three concepts separate:
   - Original document: the user's file is never modified. BYOC retains extracted source text and metadata in the encrypted profile; it does not create a separate binary archive of the uploaded file.
   - Master Career Profile / Master Resume: structured, editable user-confirmed career evidence. An optional optimized proposal can replace the active Master Resume only after the user reviews and confirms it.
   - Exported presentation: DOCX/PDF generated from the approved structured Master Resume. A separate version-history feature is not required for this release.
5. No experience, skill, credential, dates, results or claims may be invented. Unsupported suggestions must be clearly marked and require user confirmation.
6. Optimisation must produce a real exportable document (DOCX and PDF where supported), not only raw text. The approved artifact and its structured source must be stored in the existing encrypted local vault.
7. Preserving an uploaded document's original visual layout is an optional additional output path, not a mandatory workflow. A newly styled resume is also supported.
8. Students, freshers, career changers and people with employment gaps must not be penalized for lacking conventional employment history.
9. Job matching must distinguish lexical overlap from evidence-backed skill fit, experience alignment and eligibility. Never label simple keyword overlap as verified compatibility.
10. AI vetting must separate sourced facts from estimates and AI interpretation; it must not claim salary competitiveness, company culture, growth or risk facts without evidence.
11. Job discovery must accurately disclose source coverage and distinguish public feeds, portal searches and manually imported jobs.
12. Offline capability must be explicit per operation. Core profile editing and local document workflows must not depend on AI.
13. Preserve existing vault data and recovery compatibility. Any cryptographic migration must be versioned, tested against existing vault/recovery fixtures and fail safely.
14. Release claims require evidence from the exact commit: TypeScript, full tests, production web build, Android debug build and artifact hash. No claim of physical-device verification without actual device testing.

## User-approved choices

- Original-format preservation is optional, not mandatory.
- User explicitly authorizes implementation and build of all corrections on a feature branch.
- Do not merge to main.
- Ignore MarkItDown.
- Apply the user's stated principles; do not add new product requirements based solely on assistant preference.

## Architecture direction

Keep one BYOC app and one encrypted local data model. Separate ingestion, career evidence, resume presentation/export, job intelligence and AI assessment into explicit boundaries. Do not create a separate sibling app or introduce a server solely to address parsing.

## Resume data lifecycle

User-owned original file (left unchanged) -> local extraction result -> user review/correction -> structured Master Career Profile -> optional optimization proposal -> user approval -> active encrypted Master Resume -> exportable DOCX/PDF.

Extracted text is retained as source evidence in the encrypted Master Resume. The app does not modify the source file or retain a separate binary copy. The approved optimized profile is stored in structured fields, not as raw text alone.

## Review requirements

After implementation, inspect changed code and cross-component data flows for newly introduced conceptual errors. Specifically review data provenance, loss of source evidence, overwrite semantics, export fidelity, Unicode, false-positive matching, AI factual claims, offline behavior, vault migration/recovery, job-source semantics, accessibility and error recovery.
