# Groq Browser Job Discovery Design

**Date:** 2026-11-19  
**Status:** Implementation in progress; requires CI and device verification.

## Intent
Expand BYOC job discovery for personal job searching without introducing a BYOC server, new API credentials, or moving candidate data out of the local encrypted vault.

## Goals
- Add one additional discovery provider using Groq's built-in Browser Search with the user's existing Groq API key.
- Keep the existing Remotive, Remote OK, Jobicy, and local saved-job sources.
- Send only the requested role/skill terms and coarse search filters to Groq.
- Never send Master Resume content, contact details, saved applications, or application history to the search provider.
- Normalize candidate results into the existing JobPosting model and run existing local matching, filtering, and deduplication.
- Clearly label Browser Search results as unverified discovery candidates.
- Reject malformed records and non-HTTP(S) URLs.
- Keep the UI unchanged apart from the existing source status reporting.

## Non-goals
- No Cloudflare Worker, server, database, proxy, or new BYOC backend.
- No Freehire hosted API integration in the shared BYOC build because its free tier terms restrict redistribution/product display.
- No Apify, Gmail, LinkedIn/Indeed/Glassdoor scraping, or new API keys.
- No claim that an LLM result proves an employer or vacancy is genuine.
- No automatic application submission.

## Constraints
- Existing data remains in the local encrypted vault.
- The existing Groq key is used; no resume/profile data is sent in the discovery request.
- Groq Browser Search requires `openai/gpt-oss-20b` or `openai/gpt-oss-120b`, and is not compatible with structured outputs.
- Groq quotas, model access, and pricing depend on the user's Groq account; this feature is not promised to be unlimited or always free.
- The app is client-only for this feature. Search orchestration occurs in the existing local service layer; Groq's browser search itself runs on Groq infrastructure.

## Approaches considered
1. **Freehire public API:** keyless and broad, but hosted outside BYOC. Its current terms restrict displaying its free-tier listings in a product/service offered to others; unsuitable for BYOC's small-circle sharing vision.
2. **Groq Browser Search (chosen):** reuses the configured Groq key and existing service architecture, no new backend or provider key. Trade-off: queries go to Groq, quotas apply, and search output needs defensive parsing and must remain unverified until independently checked.
3. **Port Job Forager / ATS adapters:** more control and less LLM dependence, but a larger source-by-source integration and maintenance project. Suitable as a later phase after the first additional source is proven.

## Architecture
The existing LiveJobSearchEngine adds GroqBrowserSearchJobAdapter only when a Groq key is available. It receives the role/skills, country, preferred location and workplace type filters only. The adapter asks Groq's supported GPT-OSS model to browse and return a compact job list. BYOC validates each record, sanitizes URLs, and converts it to JobPosting. The existing engine deduplicates, scores against the locally held Master Resume, and applies current filters. The Sourcing UI receives source status through its existing report.

## Trust and privacy
- Browser Search listings are discovery candidates, not verified vacancies.
- The source label explicitly says to verify before applying.
- A valid HTTPS URL is not proof that the employer or vacancy is legitimate.
- No Master Resume, personal contact data, application history, or saved job records are included in the request.
- The Groq API key is passed only in the authorization header and is not added to the search prompt.

## Acceptance criteria
- Existing providers remain unchanged and are still queried.
- With no Groq key, the app behaves as before and reports no Groq provider call.
- With a Groq key, one Browser Search request is made with only role/location/workplace search context.
- Malformed JSON, missing required fields, and non-HTTP(S) URLs do not create jobs.
- Results carry an explicit unverified source label.
- Existing local matching and filters are preserved.
- TypeScript, unit tests and Vite build pass; Android debug APK build and real-device smoke test are required before calling the feature complete.
