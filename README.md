# BYOC — Build Your Own Career
### Local-First Career Search and Application Workspace

BYOC is a mobile-first career workspace for resume intake, remote-job discovery, evidence-grounded AI assistance, document export, and manually tracked applications. Sensitive career records are stored in an AES-256-GCM encrypted local vault. BYOC has no BYOC-hosted backend, no inbox connection, and no complete global job-board index.

**BYOC is designed for personal use and small-circle sharing.** It does not automatically apply to jobs, scrape authenticated job portals, or guarantee that a discovered vacancy or employer is genuine.

---

## 1. System Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
- **Client state:** Zustand with encrypted-vault persistence and versioned workspace metadata migration.
- **Android:** Capacitor 8, package ID `com.byoc.career`.
- **AI:** Optional Groq BYOK requests initiated by the user, currently selecting supported GPT-OSS 120B / 20B chat models when available. Free-plan quota is limited and account-specific; AI-generated content must be reviewed before use. Experimental OpenRouter/Gemini adapters are not connected to the user-facing workflows.
- **Documents:** Selectable-text PDF, DOCX, TXT, and Markdown intake; TXT, PDF, and DOCX export.
- **Offline:** Local vault and previously downloaded app assets remain available offline. Live feeds, Groq actions, and first-time downloads of unvisited workspace modules require connectivity.

## 2. Career Workflow

### Resume intake and Master Profile
- Supported intake formats: PDF, DOCX, TXT, and MD.
- DOCX/TXT/MD extraction is local. PDF intake uses a lightweight selectable-text parser and may fail on complex font encodings, unusual object streams or encrypted PDFs; scanned/image-only PDFs and raster OCR are not supported.
- File size is limited to 10 MB. Corrupt or empty files are rejected.
- Extracted facts are staged for user review before replacing the Master Resume. The source file itself is not modified or retained as a separate encrypted binary archive; extracted source text remains in the encrypted profile.
- Experience bullets and skills are grounded in user-provided source material; missing facts must not be invented.
- A guided Master Resume builder supports people who do not already have a CV. It asks role- and experience-specific questions locally, saves drafts inside the encrypted vault, and replaces the active profile only after the user confirms.
- An optional Groq wording-optimization action proposes changes to the staged Master Resume. The user compares the headline, summary, experience bullets and project descriptions before accepting; a second confirmation is required to update the active Master Resume. The optimized profile remains structured and encrypted.
- Optional English translation uses the existing Groq key only after an explicit click. Dedicated contact, employer, institution, date, skill, technology, issuer, and link fields are omitted; free-text summaries, role titles, bullets, and project descriptions may still contain personal or organization details. Users preview the translation and can restore the original-language draft.

### Job discovery
- **Public live feeds:** Remotive, Remote OK, Jobicy, and Arbeitnow are queried on demand without a new API key. Jobicy uses its public seven-day feed with keyword filtering and bounded cursor pagination (up to three pages per search). Arbeitnow adds a public CORS-enabled Europe-focused feed (one bounded page per search); its API has no keyword filter, so BYOC filters results locally and links back to the original posting. These feeds are not a complete global or India-wide job index.
- **Recent-post filter:** Live-feed results default to the past 30 days, with 7-day, 90-day, and any-date options. Listings with missing/unreadable publication dates are excluded from recent windows rather than assumed current. A recent date is a freshness signal, not proof that an employer is still accepting applications.
- **External portal fallback:** LinkedIn, Indeed, Naukri, Foundit, Glassdoor, Instahyre, and saved custom portals open their own search pages. For city-specific or missing vacancies, users can verify the portal listing, then import its description and original URL into BYOC. No authenticated scraping or automatic application is performed.
- **No-key source assessment:** The Himalayas remote-jobs API has a public no-key endpoint and an open-source client repository, but its own documentation says browser JavaScript calls are blocked by CORS. Adding it directly to this client-only app would therefore require a backend/proxy, which conflicts with BYOC's local-first/no-backend design. JobSpy-based LinkedIn/Naukri/Indeed scraping is not adopted because it scrapes portals against their terms and is brittle.
- **Adzuna:** Not active in this client-only build because protected server-side credentials would be required.
- **Matching:** Candidate/job overlap is calculated locally from the Master Resume and job-description skills. This is BYOC's fit assessment; it does not establish that a vacancy is still open or that an employer is legitimate.

### Public vacancy evidence
- BYOC can check direct Greenhouse job-board URLs against Greenhouse's public Job Board API. It requires the exact posting ID plus matching title and company before reporting a matching public record.
- The evidence panel records the public ATS title, company, publication/update/deadline fields when supplied, evidence endpoint, and check time.
- A matching public ATS record is **not** proof of legal employer identity, a safe recruiter, or a guaranteed open application window. The app always keeps `employerIdentityVerified: false`.
- Lever, Ashby, Workday, SmartRecruiters, and other unsupported sources are labelled for manual review rather than sent to guessed endpoints.
- Local description checks flag certain fee/deposit, financial-detail, messaging-app, and consumer-email phrases. These are caution signals, not fraud determinations.

### Vetting and tailoring
- AI vetting is explicitly user-triggered. The selected job details and relevant Master Resume evidence are sent to Groq only after the user chooses **Run AI Vetting**.
- Vetting compares the supplied job description with candidate evidence. It does **not** independently verify employer identity, company legitimacy, vacancy status, culture, salary-market competitiveness, or hiring probability. Profile alignment is labelled as an AI estimate, not a verified match.
- Tailored resume versions are selected from evidence actually present in the profile (work experience, projects/education, and ATS alignment); BYOC does not force leadership or systems-architecture variants onto unrelated roles.
- AI-generated summaries, cover letters, screening answers, and interview prompts require user review.
- Tailored application snapshots preserve the selected job description and generated materials. Moving a saved application to Applied requires explicit confirmation.

### Tracking and preparation
- Application stages, notes, interview stages, and follow-up dates are managed manually.
- Local email records may be stored in the encrypted vault, but Gmail/Workspace OAuth is not connected and no inbox messages are fetched.
- Interview preparation is available as an optional AI-assisted workflow.

## 3. Privacy and Security

- Career records and the Groq API key are stored in the local encrypted vault using AES-256-GCM. Vault v5 uses PBKDF2-HMAC-SHA256 with 600,000 iterations for user passphrases and separately records the recovery-phrase KDF. Existing v3/v4 vaults remain readable and are upgraded after successful passphrase unlock.
- A passphrase or Emergency Recovery Phrase is required to unlock the vault after a cold start.
- Platform biometrics are an in-session convenience gate for an already-unlocked session. They do not unlock the encrypted vault and are not server-verified identity proof.
- BYOC sends no career data to Groq merely because the app is opened. Job discovery uses public no-key feeds and external portal links; it does not send job-search terms to Groq. Each remaining AI action is user-triggered. Resume structuring sends the extracted resume text, which may contain contact information. Vetting sends the selected job and relevant profile evidence, without contact fields. Tailoring sends the selected job and resume evidence, including the candidate name, but not email, phone, or social-profile URLs.
- Optional Master Resume optimization sends the structured headline, summary, skills, experience bullets, project descriptions, education, certifications and additional evidence. Dedicated contact fields and the original raw document text are excluded, but free-text career fields may themselves contain personal or organization details.
- Groq processes requests under its own service terms. BYOC does not control the provider's processing or retention policies. Do not use AI features on a shared device if you are not comfortable sending the selected content to Groq.
- BYOC does not silently fail over to another AI company. Resume/job data is sent only to the provider the user explicitly configured for that action. This avoids an unexpected change in data recipient. Groq 429 responses are retried only when a short `Retry-After` is supplied; other transient failures receive one bounded retry with jitter. Daily quota exhaustion is not retried in a loop.
- Gemini's API offers a free tier on eligible models, but Google's published pricing page states that free-tier submitted content may be used to improve its products. Because BYOC can transmit personal resume data, Gemini is not enabled in this browser-only release. It would require a separately reviewed opt-in integration and clear data-use disclosure.
- Automatic Android cloud backup and device-to-device app-data transfer are explicitly excluded so local workspace metadata is not silently copied into system backups. Use BYOC's encrypted vault export for manual device migration and recovery. **Readable Workspace Snapshot exports are unencrypted** and may contain personal career information; store them carefully.
- If BYOC reports a vault save failure, keep the app open and retry before closing. Sign-out is blocked while an unsaved-vault warning is active.

## 4. Known Limits

- No scanned-document OCR.
- No Gmail/Workspace inbox integration.
- No automatic applications or authenticated job-portal scraping.
- Public ATS evidence checks currently support Greenhouse only. A matching record does not independently guarantee employer legitimacy or that applications remain open.
- AI providers can still be unavailable or quota-limited. BYOC keeps local workflows available, but AI vetting/tailoring cannot be guaranteed free, uninterrupted, or available offline. Check the provider's current model and rate-limit dashboard before relying on a quota.
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
