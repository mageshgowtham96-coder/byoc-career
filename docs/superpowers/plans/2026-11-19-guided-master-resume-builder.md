# Implementation Plan — Guided Master Resume Builder

1. **Draft schema and migration**
   - Extend `CareerApplicationFormState` with optional role, level, language, project, and certification fields.
   - Extend `sanitizeCareerFormState` and meaningful-draft detection.
   - Add migration/sanitizer tests to prove old drafts remain readable and new fields survive encrypted persistence.

2. **Local role-question engine**
   - Add a pure role-family/experience-level prompt helper.
   - Add tests for every supported role family and early-career/no-experience guidance.
   - Keep this path entirely offline and token-free.

3. **Optional translation service**
   - Add one explicit Groq translation call for resume text fields only.
   - Validate the returned structure and preserve the original draft.
   - Add tests for valid translation, malformed output, missing fields, and proper-name/date preservation.

4. **Mobile-first guided form**
   - Build a short stepper for profile, experience/projects, skills, education/certifications, and review.
   - Autosave the draft through the existing encrypted `careerFormDraft`.
   - Include add/remove controls and allow sections to be skipped.

5. **Intake integration**
   - Add **Build from scratch** to the empty Master Resume state.
   - Map the completed draft into the existing `MasterResume` shape.
   - Stage it for review; only `confirmStagedResume` activates it.
   - Preserve existing upload, paste, and milestone workflows.

6. **Verification**
   - Run TypeScript, unit tests, production build, and Android debug build.
   - Check that no AI request occurs when opening the builder or answering prompts.
   - Leave the PR in draft until the owner reviews the feature and physical-device testing is completed.
