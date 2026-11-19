# BYOC — Verification Status

**Repository:** `mageshgowtham96-coder/byoc-career`  
**Release-candidate branch:** `feat/byoc-release-candidate-verified`  
**Pull request:** [#19 — BYOC: product integrity and end-to-end completion](https://github.com/mageshgowtham96-coder/byoc-career/pull/19)  
**Status:** Draft, unmerged. PR #19 is currently based on the PR #10 PDF workspace branch; it is not a change to `main`.

This document reports implementation and verification evidence. A passing build is not treated as proof that every user workflow is complete.

## Implemented on the release-candidate branch

- Local-first career workspace with AES-256-GCM encrypted vault persistence.
- Versioned vault v5 migration: 600,000 PBKDF2 iterations for passphrases and a separately recorded KDF for the high-entropy recovery phrase; v3/v4 compatibility paths and tests are retained.
- Resume intake for DOCX, basic selectable-text PDF, TXT, Markdown and manual paste. DOCX extraction reads the main document and selected related XML parts, including tables and supported headers/footers/notes. It is a local parser, not a complete Microsoft Word rendering engine.
- Resume review and correction before activation; profile sections include experience, education, projects, skills, certifications and additional career evidence.
- Guided Master Resume creation for people without an existing resume, including students and career changers.
- Optional Groq-assisted resume structuring and optional Master Resume wording optimization. Optimization is a staged proposal with before/after review; the active Master Resume changes only after user confirmation. The optimized result is retained as structured Master Resume fields in the encrypted vault, not as a TXT-only record.
- Master Resume DOCX and PDF export. PDF export refuses unsupported Unicode rather than silently dropping characters; DOCX supports Unicode. The current PDF exporter creates a newly styled document and does not preserve an uploaded document's original visual layout.
- Job discovery from the supported public feeds and external portal shortcuts. Coverage is not exhaustive, especially for local India vacancies.
- Job fit display is explicitly labelled keyword overlap. It is not a verified qualification, experience or eligibility assessment.
- AI vetting and tailoring are user-triggered. Unsupported employer, salary-market, culture and growth claims are labelled as unverified or not assessed. AI-generated wording still requires human factual review.
- Application tracking and local document workflows remain available without requiring a BYOC-hosted backend.

## Important boundaries

- PDF text extraction remains a custom lightweight parser. It is not reliable for every PDF construction, including some complex CID/font encodings, encrypted PDFs, unusual object streams and scanned documents. OCR is not included.
- Original uploaded file bytes are not retained as a separate encrypted binary archive by the current intake flow. BYOC does not modify the user's source file; extracted source text is retained in the encrypted profile.
- Master Resume optimization rewrites presentation wording from structured profile evidence. Source mapping, record-count checks and user review reduce risk, but AI wording is not mathematically guaranteed to preserve meaning.
- A successful DOCX/PDF export is not proof of layout fidelity for every office suite or device.
- Job discovery does not cover every portal or every local vacancy. External portal shortcuts are destinations, not live integrated feeds.
- No automatic applications, authenticated portal scraping, BYOC cloud sync or Gmail inbox access.
- No physical Android device smoke test has been performed in this verification cycle.
- The current APK pipeline produces a debug APK, not a signed production release.

## Verification policy

A release candidate is only considered verified when the exact current PR head has all of the following:

1. TypeScript check.
2. Full Vitest suite, including actual generated DOCX archive extraction and approval-path tests.
3. Production web build.
4. Android debug APK build and artifact upload.
5. Inspection of the APK artifact and recorded SHA-256.
6. Post-implementation review of the changed data flows and newly introduced logic.

CI results from an earlier commit do not verify a later commit. Physical Android installation and live API smoke tests must be reported separately from CI.

## Branch protection

PR #19 remains unmerged. No changes are made directly to `main`, and no merge is performed without the repository owner's explicit approval.
