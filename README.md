# BYOC — Build Your Own Career
### Local-First Career Search and Application Workspace

BYOC is a mobile-first career workspace for resume intake, remote-job discovery, evidence-grounded AI assistance, document export, and manually tracked applications. Sensitive career records are stored in an AES-256-GCM encrypted local vault. BYOC has no BYOC-hosted backend, no inbox connection, and no complete global job-board index.

**BYOC is designed for personal use and small-circle sharing.** It does not automatically apply to jobs, scrape authenticated job portals, or guarantee that a discovered vacancy or employer is genuine.

---

## 1. System Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
- **Client state:** Zustand with encrypted-vault persistence and versioned workspace metadata migration.
- **Android:** Capacitor 8, package ID `com.byoc.career`.
- **AI:** Optional Groq BYOK requests initiated by the user. AI-generated content must be reviewed before use.
- **Documents:** Selectable-text PDF, DOCX, TXT, and Markdown intake; TXT, PDF, and DOCX export.
- **Offline:** Local vault and previously downloaded app assets remain available offline. Live feeds, Groq actions, and first-time downloads of unvisited workspace modules require connectivity.

## 2. Career Workflow

### Resume intake and Master Profile
- Supported intake formats: PDF, DOCX, TXT, and MD.
- Selectable-text extraction is supported; scanned/image-only PDFs and raster OCR are not.
- File size is limited to 10 MB. Corrupt or empty files are rejected.
- Extracted facts are staged for user review before replacing the Master Resume.
- Experience bullets and skills are grounded in user-provided source material; missing facts must not be invented.

### Job discovery
- **Public live feeds:** Remotive, Remote OK, and Jobicy are queried on demand. They are not a complete global index.
- **Groq Browser Search:** Optional discovery through Groq's hosted browser-search capability, using role/skill search terms and location filters. Results are candidates, not verified vacancies.
- **Manual portals:** LinkedIn, Glassdoor, Indeed, Naukri, Foundit, Instahyre, and custom shortcuts open external sites. Users select and import listings themselves; BYOC does not scrape those portals.
- **Adzuna:** Not active in this client-only build because protected server-side credentials would be required.
- **Matching:** Candidate/job overlap is calculated locally. Insufficient profile data is shown as such rather than replaced with a fabricated score.

### Vetting and tailoring
- AI vetting is explicitly user-triggered. The selected job details and relevant Master Resume evidence are sent to Groq only after the user chooses **Run AI Vetting**.
- Vetting is career-fit guidance. It does **not** independently verify employer identity, company legitimacy, vacancy status, or salary claims.
- Three tailored variants are available: Leadership & Scale, Systems & Reliability, and ATS Alignment.
- AI-generated summaries, cover letters, screening answers, and interview prompts require user review.
- Tailored application snapshots preserve the selected job description and generated materials. Moving a saved application to Applied requires explicit confirmation.

### Tracking and preparation
- Application stages, notes, interview stages, and follow-up dates are managed manually.
- Local email records may be stored in the encrypted vault, but Gmail/Workspace OAuth is not connected and no inbox messages are fetched.
- Interview preparation is available as an optional AI-assisted workflow.

## 3. Privacy and Security

- Career records and the Groq API key are stored in the local encrypted vault using AES-256-GCM. The current vault format derives wrapping keys with PBKDF2-HMAC-SHA256 (100,000 iterations).
- A passphrase or Emergency Recovery Phrase is required to unlock the vault after a cold start.
- Platform biometrics are an in-session convenience gate for an already-unlocked session. They do not unlock the encrypted vault and are not server-verified identity proof.
- BYOC sends no career data to Groq merely because the app is opened. Each AI action is user-triggered. Groq Browser Search sends role/skill search terms and filters only. Resume structuring sends the extracted resume text, which may contain contact information. Vetting sends the selected job and relevant profile evidence, without contact fields. Tailoring sends the selected job and resume evidence, including the candidate name, but not email, phone, or social-profile URLs.
- Groq processes requests under its own service terms. BYOC does not control the provider's processing or retention policies. Do not use AI features on a shared device if you are not comfortable sending the selected content to Groq.
- Automatic Android app-data backup is disabled so local workspace metadata is not silently copied into device/cloud backups. Use BYOC's encrypted vault export for manual device migration and recovery. **Readable Workspace Snapshot exports are unencrypted** and may contain personal career information; store them carefully.
- If BYOC reports a vault save failure, keep the app open and retry before closing. Sign-out is blocked while an unsaved-vault warning is active.

## 4. Known Limits

- No scanned-document OCR.
- No Gmail/Workspace inbox integration.
- No automatic applications or authenticated job-portal scraping.
- No independent guarantee of employer legitimacy or vacancy freshness.
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
