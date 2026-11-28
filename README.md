# BYOC — Bring Your Own Career
### Local-First Career Search and Application Workspace

BYOC is a client-side career workspace for resume intake, remote-job discovery, evidence-grounded AI drafts, document export, and manually tracked applications. Sensitive career records are kept in an AES-256-GCM encrypted local vault. BYOC does not provide a backend inbox connection or a complete global job-board index. AI actions explicitly send selected content from this device to Google Gemini using Gemini 2.5 Flash; local vault and manual workflows do not require AI. The Gemini API key is persisted only in the AES-256-GCM encrypted vault.

---

## 1. System Architecture Overview

- **Frontend Core**: React 19 + TypeScript + Vite.
- **Styling**: Tailwind CSS with dark-mode primary palette (`#0f172a` deep navy).
- **Client State**: Zustand with encrypted-vault persistence and versioned workspace metadata migrations (`version: 4`).
- **Mobile Container**: Native Android Capacitor 8 project (`com.byoc.career`).
- **AI Intelligence**: Optional, user-triggered Gemini BYOK requests for resume structuring, tailoring, vetting, and interview preparation. Generated content must be reviewed.
- **Session Security**: WebAuthn is an in-session screen lock. Cold starts require the vault passphrase or Emergency Recovery Phrase to unlock the encrypted vault.
- **Document Engine**: Client-side extraction for supported selectable-text PDF, DOCX, TXT, and Markdown files. Raster OCR is not included.
- **Export Formats**: Authentic Plain Text (`.txt`), styled PDF (`.pdf` via `pdf-lib`), and Microsoft Word (`.docx` via `docx`).

---

## 2. Parts 1–14 Architecture & Feature Matrix

### Part 1: Permanent Production Mock Removal
- **Zero Mock Mode**: All Smart Mock Mode toggles, labels, and synthetic mock fixtures (`INITIAL_MOCK_JOBS`) have been purged from production.
- **Honest Feedback**: Provider errors, rate limits, or missing keys result in visible, actionable configuration prompts rather than fabricated fallback data.

### Part 2: Local Job Search & Dashboard Sync
- **Local Job Search**: BYOC searches locally stored and manually imported job positions. External portal shortcuts open websites; BYOC does not fetch listings from those sites.
- **Manual Portals**: LinkedIn, Glassdoor, Indeed, Naukri, Foundit, Instahyre, and custom shortcuts open external sites; users paste selected listings into BYOC. BYOC does not scrape these portals.
- **Location and Work Mode**: Country and optional city filters apply to returned remote listings. Worldwide remote inclusion is explicit. Hybrid and on-site filters apply to saved or pasted listings because connected live feeds are remote-only.
- **Honest Scoring**: Computes genuine mathematical overlap between candidate's ingested skills and job requirements. Displays `"Insufficient Profile Data"` when no master resume is available.
- **Dashboard Synchronization**: Dashboard and Sourcing share the same validated job records and support instant on-demand live synchronization.

### Part 3: Candidate Data Integrity
- **No Fabricated Defaults**: Purged hardcoded assumptions (e.g., 8 years of experience, software engineer universal role, ₹40-65 LPA salary, 30-day notice period, Bengaluru location).
- **Separation of Concerns**: User account name (`user.name`) and resume candidate name (`masterResume.contactInfo.name`) are maintained as separate entities.

### Part 4: Master Resume and Local Document Extraction
- **Supported Formats**: PDF, DOCX, TXT, and MD.
- **Memory & File Guards**: File size limit enforced at 10MB; 0-byte corrupt files rejected with descriptive error notifications.
- **Extraction Limits**: Raster images and scanned/image-only PDFs are not OCR-processed. Encrypted PDFs and some complex CID/custom-font PDFs may require manual paste.
- **Traceable Extraction**: Regex-driven and header-indexed extraction with zero synthetic milestones.

### Part 5: Gemini AI Provider Reliability
- **Model**: Uses `gemini-2.5-flash` through the official `@google/genai` SDK.
- **Systemic Experience Originality Lock**: Every LLM prompt constructor enforces strict anti-fabrication rules: the AI can only emphasize or reorder verified evidence.
- **Schema Validation**: Validates structured outputs with fallback handling for malformed JSON, timeouts (45s), and HTTP rate limits (429).

### Part 6: Master Profile, Tailor & Immutable Application Snapshots
- **3 Sibling Variants**:
  1. *Variant A*: Leadership & Measurable Metric Outcomes.
  2. *Variant B*: Systems Architecture & Reliability.
  3. *Variant C*: Direct ATS Keyword Alignment.
- **Immutable Snapshots**: Saving or submitting an application freezes a deep copy of the tailored kit and original job description (`jobDescriptionRaw`). Subsequent edits to the Master Profile never mutate past records.
- **User-Confirmed Applications**: Saving a kit creates a `Saved` draft; transitioning to `Applied` requires explicit confirmation.

### Part 7: Local Email Records and Tracking Pipeline
- **Encrypted Local Records**: Email interaction records, if present, are stored inside the encrypted vault. Gmail/Workspace OAuth is not connected; the local mail check does not fetch new messages.
- **Application Tracking**: Users update application stages manually. Follow-up reminders are calculated from the recorded application date.

### Part 8: Credential Security and Session Biometrics
- **Separation of Credentials**: Workspace passkey login is separate from Gemini BYOK API key validation.
- **WebAuthn Scope**: Platform biometrics protect an active unlocked session only; they do not unwrap the vault key or replace cold-start passphrase/recovery unlock.

### Part 9: Persistence & Safe Migrations
- **Zustand Version 4**: Safe migration strips obsolete mock properties, normalizes preference objects, and preserves genuine candidate data.
- **Storage Limits**: Try-catch guards protect `localStorage` and `IndexedDB` against quota limits.

### Part 10: Native Android & Capacitor Integration
- **Package ID**: Preserved as `com.byoc.career`.
- **Version Tracking**: `versionCode 2`, `versionName "2.0.0"`.
- **Branding**: Sri Sudarsana Chakra adaptive vector drawables (`drawable/ic_launcher_foreground.xml` and `ic_launcher_background.xml`), adaptive XML configurations (`mipmap-anydpi-v26`), and multi-density raster mipmaps (`mdpi` to `xxxhdpi`).

### Part 11: Service Worker & PWA Reliability
- **Cache Version**: `byoc-cache-v3`.
- **Privacy Protections**: The service worker explicitly excludes AI endpoints (`generativelanguage.googleapis.com`), external APIs, and credentials from cache storage.
- **Network-First Navigation**: Navigation requests prioritize network fetch to ensure deployed updates arrive immediately.

---

## 3. Local Development & Build

### Running Locally
```bash
npm install
npm run dev
```

### Production Build & Linting
```bash
npm run check
```

`npm run check` runs TypeScript linting, the regression suite, and a production build in sequence. To run an individual step, use `npm run lint`, `npm test`, or `npm run build`.

### Android APK Compilation
To build the native Android APK using Android Studio or the Gradle wrapper:
```bash
cd android
./gradlew assembleDebug
# Or for release:
./gradlew assembleRelease
```
The resulting debug APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 4. External Credentials Required for Full Live Operation

1. **Gemini API Key**: Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey) and enter it in **Settings > Gemini API**.
3. **Gmail / Workspace OAuth**: Not implemented. Email settings currently inspect the encrypted local email vault and do not connect to an inbox.
