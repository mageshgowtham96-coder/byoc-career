# BYOC Release Candidate — Acceptance Evidence

**Updated:** 2026-11-20  
**Repository:** `mageshgowtham96-coder/byoc-career`  
**Pull request:** [#19 — BYOC: product integrity and end-to-end completion](https://github.com/mageshgowtham96-coder/byoc-career/pull/19)  
**Branch:** `feat/byoc-release-candidate-verified`  
**State:** Draft / unmerged. No merge to `main` is authorized by this report.

## Acceptance scope

This report replaces the outdated 2026-11-15 acceptance statement. It does not claim the app is production-ready merely because the repository has functional components.

### Product work included in the release candidate

- Local-first encrypted career profile and application data.
- Versioned vault migration and recovery compatibility tests.
- Resume import, structured review, correction, guided resume creation, and user-confirmed activation.
- Expanded DOCX extraction and regression fixtures for tables and additional document parts.
- Optional AI structuring and optional Master Resume optimization with a visible comparison and separate approval step.
- Structured encrypted Master Resume persistence and DOCX/PDF export.
- Job fit terminology corrected to keyword overlap rather than verified match.
- AI vetting language corrected to distinguish supplied facts, estimates and unassessed claims.
- Role/evidence-aware tailoring rather than fixed leadership/architecture variants.
- Human review required before exporting job-tailored AI materials.

## Verification evidence

The earlier verified commit `578ae5a38a7a47ea5f080a731c8315adf141bcc7` passed TypeScript, 225 tests across 26 files, production web build, Android debug APK build and artifact upload.

That evidence is historical. It does **not** verify the newer commits on PR #19. Final acceptance must use the exact current PR head and a completed green CI run. The exact-head CI run and artifact details will be recorded here only after they are available.

## Known technical boundaries

- The PDF intake implementation is a lightweight custom text extractor, not PDF.js or a full standards-compliant parser. Complex font encodings, unusual object streams, encryption and scanned pages may fail. OCR is not included.
- The PDF exporter uses standard built-in fonts and rejects unsupported Unicode rather than corrupting it. DOCX export is the Unicode-preserving alternative. Uploaded layout preservation is not implemented; export generates a new document layout.
- The app does not retain the original uploaded binary as a separate encrypted archive. It does not modify the original file; it retains extracted source text in the encrypted Master Resume.
- AI optimization is a proposal, not a guarantee of factual correctness. The user must compare the output and approve the staged profile.
- Job feeds are limited and remote-heavy; external portal links are not integrated vacancy feeds.
- The app has not been installed and exercised on a physical Android device in this cycle.
- Android CI creates a debug APK, not a signed Play Store/release APK.
- Live Groq calls require the user's existing API key and quota; CI does not validate account-specific live API access.

## Acceptance decision

**Not yet accepted as a production release.** Keep PR #19 open until exact-head CI, artifact inspection and post-implementation review are complete. After that, physical-device testing and release signing remain separate release activities.

No changes to `main` are made by this report.
