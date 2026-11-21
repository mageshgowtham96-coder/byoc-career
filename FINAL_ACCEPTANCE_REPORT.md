# BYOC Release Candidate — Acceptance Evidence

**Updated:** 2026-11-20  
**Repository:** `mageshgowtham96-coder/byoc-career`  
**Pull request:** [#19 — BYOC: product integrity and end-to-end completion](https://github.com/mageshgowtham96-coder/byoc-career/pull/19)  
**Branch:** `feat/byoc-release-candidate-verified`  
**Source implementation commit:** `11edd591f521a815f184ea23877bb7da071b718a`  
**Exact-head CI commit verified before this report refresh:** `da98f6b0a7e1af5ad0550f42d4ae6aa69567ea5b`  
**State:** Draft / unmerged. No merge to `main` is authorized.

## Acceptance scope

This report records implementation and CI/package evidence. A successful build and archive check are not proof that every physical-device workflow is complete or that the app is production-ready.

### Product work included

- Local-first encrypted career profile and application data.
- Versioned PBKDF2 v5 migration to 600,000 iterations, with v3/v4 and emergency-recovery compatibility tests.
- Resume import, structured review, correction, guided resume creation, and user-confirmed activation.
- Expanded DOCX extraction and regression fixtures for tables and additional document parts.
- Optional AI structuring and Master Resume optimization with a visible comparison and separate approval step.
- Structured encrypted Master Resume persistence and DOCX/PDF export.
- Job fit terminology corrected to keyword overlap rather than verified qualification or experience match.
- Required, preferred and provider-listed skills kept distinct; provider-listed tags disclose unknown requirement status.
- Match criteria use one shared resolver for scoring and the displayed denominator.
- Guided profiles with education, projects, certifications or additional user-authored evidence can be assessed without conventional employment history; blank placeholder-only profiles remain insufficient.
- Search matching respects token boundaries and common singular/plural role wording.
- Country-wide remote scope is distinguished from unknown eligibility; malformed saved portal shortcuts are ignored safely.
- AI vetting distinguishes supplied facts, estimates and unassessed claims.
- Role/evidence-aware tailoring, source references and human factual review before export.

## Exact-head verification

GitHub Actions run [#574 — BYOC Release Validation](https://github.com/mageshgowtham96-coder/byoc-career/actions/runs/44712010302) completed successfully for source commit `da98f6b0a7e1af5ad0550f42d4ae6aa69567ea5b`.

- TypeScript check: passed.
- Vitest: **308 passed across 31 test files**.
- Production web build: passed.
- Android debug APK build: passed.
- APK archive validation: passed; Android manifest, Capacitor configuration and packaged web entry point were present.
- Artifact ID: `14617329486`.
- Artifact ZIP SHA-256: `e70ec5c3ad788c53d04267f65eb14f117c904896fcc7ddb1f9da0ef19b2dcb44`.
- APK SHA-256: `38515d47c53b9c28e3372bc0e31b3369438ccde4899d32f2da747372cbd5834c`.

The APK archive was downloaded and independently checked after the run.

## Known technical boundaries and remaining validation

- **Android runtime:** the GitHub-hosted runner did not expose usable `/dev/kvm`; emulator attempts could not start an Android device. The final CI therefore validates the APK archive and packaged app contents, not an emulator launch. Physical Android installation, first-launch and workflow smoke tests remain outstanding.
- **Release signing:** the pipeline produces a debug APK, not a signed production/Play Store release.
- **PDF intake:** the lightweight local text extractor is not a full standards-compliant parser. Complex font encodings, unusual object streams, encrypted PDFs and scanned pages may fail. OCR is not included.
- **PDF export:** standard built-in fonts are used and unsupported Unicode is rejected rather than silently corrupted. DOCX is the Unicode-preserving export path. Uploaded visual layout preservation is not implemented.
- **Original uploads:** the app does not retain the uploaded original binary as a separate encrypted archive; extracted source text and metadata are retained in the encrypted profile.
- **AI integrity:** AI optimization and tailoring are not guaranteed to preserve meaning. Evidence references are review aids, not semantic proof; human factual review remains mandatory.
- **Job discovery:** public feeds are limited and remote-heavy; local India vacancy coverage is not exhaustive. External portal shortcuts open the portals and are not integrated live vacancy feeds.
- **Mobile UX:** full five-phase mobile UI consistency/accessibility review and cross-device visual validation remain outstanding.
- **Vault runtime:** interrupted device-level vault write/reload behavior still requires physical-device validation.
- **Live AI:** live Groq calls depend on the user's existing key, network and account quota; CI does not validate account-specific API access.

## Acceptance decision

**Release candidate code and package checks are green; production acceptance is not yet complete.** Keep PR #19 draft and unmerged. Complete physical Android installation and workflow testing, the mobile UI/accessibility review, and production signing before calling BYOC a verified production release.

No changes to `main` are made by this report.
