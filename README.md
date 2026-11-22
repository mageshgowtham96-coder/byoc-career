# BYOC — Build Your Own Career
### Local-First Career Search and Application Workspace

BYOC is a mobile-first career workspace for resume intake, remote-job discovery, evidence-grounded AI assistance, document export, and manually tracked applications. Sensitive career records are stored in an AES-256-GCM encrypted local vault. BYOC has no BYOC-hosted backend, no inbox connection, and no complete global job-board index.

**BYOC is designed for personal use and small-circle sharing.** It does not automatically apply to jobs, scrape authenticated job portals, or guarantee that a discovered vacancy or employer is genuine.

---

## 1. System Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
- **Client state:** Zustand with encrypted-vault persistence and versioned workspace metadata migration.
- **Android:** Capacitor 8, package ID `com.byoc.career`.
- **AI:** Gemini is the only AI provider. The Gemini API key is entered and verified on the login screen, then stored in the encrypted local vault. AI requests are user-triggered and generated content requires review.
- **Documents:** Selectable-text PDF, DOCX, TXT, and Markdown intake; TXT, PDF, and DOCX export.
- **Offline:** Local vault and previously downloaded app assets remain available offline. Live employer-board refreshes, Gemini actions, and first-time downloads of unvisited workspace modules require connectivity.

## 2. Career Workflow

### Resume intake and Master Profile
- Supported intake formats: PDF, DOCX, TXT, and MD.
- DOCX/TXT/MD extraction is local. PDF intake uses a lightweight selectable-text parser and may fail on complex font encodings, unusual object streams or encrypted PDFs; scanned/image-only PDFs and raster OCR are not supported.
- File size is limited to 10 MB. Corrupt or empty files are rejected.
- Extracted facts are staged for user review before replacing the Master Resume. The source file itself is not modified or retained as a separate encrypted binary archive; extracted source text remains in the encrypted profile.
- Experience bullets and skills are grounded in user-provided source material; missing facts must not be invented.
- A guided Master Resume builder supports people who do not already have a CV. It asks role- and experience-specific questions locally, saves drafts inside the encrypted vault, and replaces the active profile only after the user confirms.
- An optional Gemini wording-optimization action proposes changes to the staged Master Resume. The user compares the headline, summary, experience bullets and project descriptions before accepting; a second confirmation is required to update the active Master Resume. The optimized profile remains structured and encrypted.
- Optional English translation uses the encrypted Gemini key only after an explicit click. Dedicated contact, employer, institution, date, skill, technology, issuer, and link fields are omitted; free-text summaries, role titles, bullets, and project descriptions may still contain personal or organization details. Users preview the translation and can restore the original-language draft.

### Job discovery
- **Live employer boards:** BYOC queries a curated directory of 13 public Greenhouse and Workable employer boards directly, without aggregator credentials. Job summaries are refreshed at a bounded interval and role search runs locally against published title/metadata. The directory is selective, not a complete India-wide or global vacancy index.
- **Posted-date filter:** Employer-board listings are retained regardless of age by default, with 7-day, 30-day, 90-day and any-date filters available. Missing/unreadable dates are not treated as recent. A published date is a freshness signal, not proof that an employer is still accepting applications.
- **Manual import:** Users can paste a job description and original URL from another employer page when it is not present in the curated live directory. BYOC does not scrape authenticated portals or apply automatically.
- **Source limits:** BYOC deliberately avoids unverified aggregators and brittle portal scraping. A source is active only when its public employer-board endpoint passes the live smoke check; unsupported or unavailable sources are not presented as live feeds.
- **Matching:** User-entered required skills are scored separately from optional preferred skills. Public-feed tags are stored as provider-listed skills because feeds do not reliably classify them as required or preferred; any overlap is labelled with that uncertainty. Market eligibility is classified only from the published location as explicit, regional, not stated, or not assessed; job-description mentions are not used as location proof. Experience depth is not assessed by the keyword score, and neither the score nor location label proves that a vacancy is still open or that an employer is legitimate.

### Public vacancy evidence
- BYOC can check direct Greenhouse job-board URLs against Greenhouse's public Job Board API. It requires the exact posting ID plus matching title and company before reporting a matching public record.
- The evidence panel records the public ATS title, company, publication/update/deadline fields when supplied, evidence endpoint, and check time.
- A matching public ATS record is **not** proof of legal employer identity, a safe recruiter, or a guaranteed open application window. The app always keeps `employerIdentityVerified: false`.
- Lever, Ashby, Workday, SmartRecruiters, and other unsupported sources are labelled for manual review rather than sent to guessed endpoints.
- Local description checks flag certain fee/deposit, financial-detail, messaging-app, and consumer-email phrases. These are caution signals, not fraud determinations.

### Vetting and tailoring
- AI vetting is explicitly user-triggered. The selected job details and relevant Master Resume evidence are sent to Gemini only after the user chooses **Run AI Vetting**.
- Vetting compares the supplied job description with candidate evidence. It does **not** independently verify employer identity, company legitimacy, vacancy status, culture, salary-market competitiveness, or hiring probability. Profile alignment is labelled as an AI estimate, not a verified match.
- Tailored resume versions are selected from evidence actually present in the profile (work experience, projects/education, and ATS alignment); BYOC does not force leadership or systems-architecture variants onto unrelated roles.
- AI-generated summaries, cover letters, screening answers, and interview prompts require user review.
- Tailored application snapshots preserve the selected job description and generated materials. Moving a saved application to Applied requires explicit confirmation.

### Tracking and preparation
- Application stages, notes, interview stages, and follow-up dates are managed manually.
- Local email records may be stored in the encrypted vault, but Gmail/Workspace OAuth is not connected and no inbox messages are fetched.
- Interview preparation is available as an optional AI-assisted workflow.

## 3. Privacy and Security

- Career records and the Gemini API key are stored in the local encrypted vault using AES-256-GCM. Vault v5 uses PBKDF2-HMAC-SHA256 with 600,000 iterations for user passphrases and separately records the recovery-phrase KDF. Existing v3/v4 vaults remain readable and are upgraded after successful passphrase unlock.
- A passphrase or Emergency Recovery Phrase is required to unlock the vault after a cold start.
- Platform biometrics are an in-session convenience gate for an already-unlocked session. They do not unlock the encrypted vault and are not server-verified identity proof.
- BYOC sends no career data to Gemini merely because the app is opened. Job discovery reads public employer-board endpoints directly and does not send job-search terms or the Master Resume to Gemini. Each remaining AI action is user-triggered. Resume structuring sends the extracted resume text, which may contain contact information. Vetting sends the selected job and relevant profile evidence, without contact fields. Tailoring sends the selected job and resume evidence, including the candidate name, but not email, phone, or social-profile URLs.
- Optional Master Resume optimization sends the structured headline, summary, skills, experience bullets, project descriptions, education, certifications and additional evidence. Dedicated contact fields and the original raw document text are excluded, but free-text career fields may themselves contain personal or organization details.
- Google Gemini processes requests under Google's API terms. BYOC does not control the provider's processing or retention policies. Do not use AI features on a shared device if you are not comfortable sending the selected content to Google Gemini.
- BYOC does not silently fail over to another AI company. BYOC has no provider switching or silent failover: all AI-assisted workflows use the single Gemini key entered at login. Transient provider failures receive a bounded retry; quota exhaustion is not retried in a loop.
- The Gemini key is requested at login and kept in the encrypted vault. Before using document analysis, tailoring or vetting, the user should understand that the selected document text/PDF or structured career evidence is sent directly to Google Gemini. Review Google's current API data-use terms and never send material you do not want processed by that provider.
- Automatic Android cloud backup and device-to-device app-data transfer are explicitly excluded so local workspace metadata is not silently copied into system backups. Use BYOC's encrypted vault export for manual device migration and recovery. **Readable Workspace Snapshot exports are unencrypted** and may contain personal career information; store them carefully.
- If BYOC reports a vault save failure, keep the app open and retry before closing. Sign-out is blocked while an unsaved-vault warning is active.

## 4. Known Limits

- Local extraction does not perform OCR. When the user explicitly chooses Gemini document analysis, Gemini can inspect the original PDF, including scanned pages; its interpretation still requires user review.
- No Gmail/Workspace inbox integration.
- No automatic applications or authenticated job-portal scraping.
- The separate PDF Workspace navigation page has been removed; supported PDF resume intake remains inside Master Intake.
- Public ATS evidence checks currently support Greenhouse only. A matching record does not independently guarantee employer legitimacy or that applications remain open.
- Gemini can still be unavailable or quota-limited. BYOC keeps local workflows available, but AI vetting/tailoring cannot be guaranteed free, uninterrupted, or available offline. Check the provider's current model and rate-limit dashboard before relying on a quota.
- No BYOC cloud account, cloud sync, or server-side data recovery. Keep an encrypted backup and protect the recovery phrase.
- The Android debug APK is suitable for installation/testing, not a signed production release. A release signing key has not been configured in this repository.

## 5. Local Development

This repository uses **Bun 1.4.4** and the committed `bun.lock`.

```bash
bun install --frozen-lockfile
bun run dev
```

Run all quality checks:

```bash
bun run check
```

Individual checks:

```bash
bun run lint
bun run test
bun run build
```

### Android debug APK

On Windows:

```powershell
bun run android:debug
```

Or directly:

```powershell
cd android
.\\gradlew.bat assembleDebug
```

On Linux/macOS:

```bash
cd android
chmod +x gradlew
./gradlew assembleDebug
```

The debug APK is generated at:

`android/app/build/outputs/apk/debug/app-debug.apk`

## 6. GitHub CI

The workflow in `.github/workflows/ci.yml` checks the exact commit that triggered it and runs:
1. TypeScript validation.
2. Unit tests.
3. Production web build.
4. Android debug APK build and artifact upload.

A green CI run proves compilation and automated checks for that commit. It does not replace installation and workflow testing on a physical Android device.
