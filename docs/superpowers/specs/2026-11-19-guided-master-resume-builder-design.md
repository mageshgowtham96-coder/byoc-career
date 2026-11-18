# Guided Master Resume Builder — Design

## Goal
Let a person create their first useful Master Resume from a basic phone even if they do not already have a resume file or computer. The flow must be simple, local-first, and truthful.

## User flow
1. From the empty Master Resume state, choose **Build from scratch**.
2. Select a role family, experience level, target/current role, and writing language.
3. Answer short, role-specific prompts. The prompts are deterministic local content and do not call an AI model.
4. Add any real work, internship, volunteer, project, education, and certification evidence. Work experience is optional for students and career changers.
5. The draft autosaves to the encrypted local vault.
6. Optionally choose **Translate to English**. This is a single explicit Groq request; show a preview and require the user to accept it. Preserve the original-language draft.
7. Review the assembled Master Resume in the existing staged-review flow. It is not committed as the active profile until the user confirms.

## Data and privacy
- Reuse the existing encrypted `careerFormDraft`; do not create another profile store or cloud backend.
- Add optional fields to the existing draft schema and preserve them in sanitization/migration.
- Role prompts are local and free.
- Translation is opt-in and sends only resume text fields needed for translation. Do not send email, phone, or social-profile URLs.
- Preserve proper names, company/institution names, dates, numbers, and technical terms. Do not add achievements, metrics, responsibilities, or qualifications.
- Keep source text and translated preview separate until the user explicitly accepts the translation.

## Role-specific prompt families
Technology/software, data/analytics, design/research, sales/customer success, operations/project management, finance/accounting, healthcare, education, student/early-career, and general/career-change.

Prompts should help users describe:
- What they actually did or built
- Tools, methods, or domain knowledge they actually used
- Who benefited and what changed
- Measurable outcomes only when the user knows them
- Scope, ownership, collaboration, and constraints appropriate to their level

## Acceptance criteria
- A first-time user can create a Master Resume without uploading or pasting a resume.
- Draft survives navigation and app restart because it is stored in the encrypted vault.
- Questions change with role family and experience level without any AI request.
- Users with no work history can proceed using projects, education, volunteering, and skills.
- Translation is optional, clearly disclosed, previewed, and never silently overwrites the source.
- The assembled profile uses only user-provided facts and enters the existing staged-review/approval flow.
- Tests cover role prompts, draft sanitization, mapping, translation validation, and the no-auto-send behaviour.
- Existing upload, manual paste, and add-milestone workflows remain intact.
