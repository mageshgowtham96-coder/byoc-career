# BYOC — Bring Your Own Career
### Autonomous, Mobile-First Career Command Center & AI Intelligence Engine

BYOC is an offline-first, zero-telemetry mobile and desktop career acceleration platform built with React, Vite, Tailwind CSS, Zustand, and Capacitor. It empowers job seekers with authentic document intelligence, real-time live opportunity discovery, cultural risk auditing, and strict zero-fabrication tailored resume synthesis.

---

## 1. System Architecture Overview

- **Frontend Core**: React 19 + TypeScript + Vite.
- **Styling**: Tailwind CSS with dark-mode primary palette (`#0f172a` deep navy).
- **Client State**: Zustand with persistent storage and versioned schema migrations (`version: 2`).
- **Mobile Container**: Native Android Capacitor 8 project (`com.byoc.career`).
- **AI Intelligence**: Direct live provider orchestration via Groq (`llama-3.3-70b-versatile`) with systemic originality locks (`SYSTEMIC_AUTHENTICITY_FILTER`).
- **Hardware Security**: Native WebAuthn platform authenticator (Touch ID, Face ID, Windows Hello) and SHA-backed workspace passkey locks.
- **Document Engine**: Client-side binary parsing for PDF, DOCX, TXT, and Markdown with automatic scanned/raster image detection.
- **Export Formats**: Authentic Plain Text (`.txt`), styled PDF (`.pdf` via `pdf-lib`), and Microsoft Word (`.docx` via `docx`).

---

## 2. Parts 1–14 Architecture & Feature Matrix

### Part 1: Permanent Production Mock Removal
- **Zero Mock Mode**: All Smart Mock Mode toggles, labels, and synthetic mock fixtures (`INITIAL_MOCK_JOBS`) have been purged from production.
- **Honest Feedback**: Provider errors, rate limits, or missing keys result in visible, actionable configuration prompts rather than fabricated fallback data.

### Part 2: Genuine Live Job Sourcing & Dashboard Sync
- **Multi-Provider Architecture**: Decoupled `JobProviderAdapter` pattern with `PublicFeedsJobAdapter` (querying real open technical remote feeds) and `AdzunaJobAdapter` (official API specifications).
- **Dynamic Preference Inputs**: Search respects user's selected country (India baseline, US, UK, CA, EU, SG, UAE, Global), target role, skills, and work mode without assumed defaults.
- **Honest Scoring**: Computes genuine mathematical overlap between candidate's ingested skills and job requirements. Displays `"Insufficient Profile Data"` when no master resume is available.
- **Dashboard Synchronization**: Dashboard and Sourcing share the same validated job records and support instant on-demand live synchronization.

### Part 3: Candidate Data Integrity
- **No Fabricated Defaults**: Purged hardcoded assumptions (e.g., 8 years of experience, software engineer universal role, ₹40-65 LPA salary, 30-day notice period, Bengaluru location).
- **Separation of Concerns**: User account name (`user.name`) and resume candidate name (`masterResume.contactInfo.name`) are maintained as separate entities.

### Part 4: Master Resume, Document Parsing & OCR
- **Supported Formats**: PDF, DOCX, TXT, and MD.
- **Memory & File Guards**: File size limit enforced at 10MB; 0-byte corrupt files rejected with descriptive error notifications.
- **Scanned Document Detection**: Detects raster or image-only PDFs with word count < 10, alerting users to use selectable text or OCR.
- **Traceable Extraction**: Regex-driven and header-indexed extraction with zero synthetic milestones.

### Part 5: Groq AI Provider Reliability
- **Model Resolution**: Resolves `llama-3.3-70b-versatile` dynamically from the live Groq catalog.
- **Systemic Experience Originality Lock**: Every LLM prompt constructor enforces strict anti-fabrication rules: the AI can only emphasize or reorder verified evidence.
- **Schema Validation**: Validates structured outputs with fallback handling for malformed JSON, timeouts (30s), and HTTP rate limits (429).

### Part 6: Master Profile, Tailor & Immutable Application Snapshots
- **3 Sibling Variants**:
  1. *Variant A*: Leadership & Measurable Metric Outcomes.
  2. *Variant B*: Systems Architecture & Reliability.
  3. *Variant C*: Direct ATS Keyword Alignment.
- **Immutable Snapshots**: Saving or submitting an application freezes a deep copy of the tailored kit and original job description (`jobDescriptionRaw`). Subsequent edits to the Master Profile never mutate past records.
- **User-Confirmed Applications**: Saving a kit creates a `Saved` draft; transitioning to `Applied` requires explicit confirmation.

### Part 7: Email Integration & Tracking Pipeline
- **Production Email Vault**: IndexedDB-backed `emailInteractionVault` stores verified incoming emails.
- **Automated Follow-Up Reminders**: Computes 7-day cold outreach templates based on the actual application timestamp (`appliedDate`).

### Part 8: Credential Security & WebAuthn Biometrics
- **Separation of Credentials**: Workspace passkey login is separate from Groq BYOK API key validation.
- **Genuine WebAuthn Ceremony**: Registration (`navigator.credentials.create`) and verification (`navigator.credentials.get`) ceremonies interact directly with platform authenticators.

### Part 9: Persistence & Safe Migrations
- **Zustand Version 2**: Safe migration strips obsolete mock properties, normalizes preference objects, and preserves genuine candidate data.
- **Storage Limits**: Try-catch guards protect `localStorage` and `IndexedDB` against quota limits.

### Part 10: Native Android & Capacitor Integration
- **Package ID**: Preserved as `com.byoc.career`.
- **Version Tracking**: `versionCode 2`, `versionName "2.0.0"`.
- **Branding**: Sri Sudarsana Chakra adaptive vector drawables (`drawable/ic_launcher_foreground.xml` and `ic_launcher_background.xml`), adaptive XML configurations (`mipmap-anydpi-v26`), and multi-density raster mipmaps (`mdpi` to `xxxhdpi`).

### Part 11: Service Worker & PWA Reliability
- **Cache Version**: `byoc-cache-v2`.
- **Privacy Protections**: The service worker explicitly excludes AI endpoints (`api.groq.com`), external APIs, and credentials from cache storage.
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
npm run lint
npm run build
```

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

1. **Groq API Key**: Obtain a key from [console.groq.com](https://console.groq.com/keys) and enter it in **Settings > Groq API**.
2. **Adzuna Job Sourcing API** *(Optional)*: Set `__BYOC_ADZUNA_APP_ID` and `__BYOC_ADZUNA_APP_KEY` in environment configuration for extended international aggregation.
3. **Gmail / Workspace OAuth** *(Optional)*: Required only when authorizing real-time inbox synchronization.
