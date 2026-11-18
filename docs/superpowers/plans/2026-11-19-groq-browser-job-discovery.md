# Groq Browser Job Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Groq-hosted Browser Search as an additional BYOC job source without sending candidate data or adding a backend/key.

**Architecture:** Add a provider adapter to the existing LiveJobSearchEngine, gated by the already stored Groq API key. The adapter sends role and coarse filters only, validates the returned records, and leaves all profile matching and persistence inside BYOC.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Groq Chat Completions built-in Browser Search.

**Spec:** `docs/superpowers/specs/2026-11-19-groq-browser-job-discovery-design.md`

## Global Constraints
- No new API keys, backend, database, Cloudflare Worker, Apify, or Gmail.
- Never send Master Resume, contact details, saved jobs, or application history to Groq Browser Search.
- Keep existing Remotive, Remote OK, Jobicy and local saved jobs.
- Treat Browser Search results as unverified candidates, not genuine/active vacancy confirmations.
- Preserve local vault persistence and existing Sourcing UI.

## Review Focus
- Empty or whitespace-only role query: do not make a provider request.
- Missing/invalid listing URL: reject the record.
- Malformed or unexpected model response: surface a provider error; do not import partial junk.
- Groq HTTP 429/5xx/timeout: preserve saved local jobs and report provider failure.
- Saved preferred location/workplace filters: ensure they still apply to discovered results.

---

### Task 1: Add and test Groq Browser Search adapter

**Files:**
- Modify: `src/services/jobSearchService.ts`
- Create: `src/services/jobSearchService.groq.test.ts`

**Interfaces:**
- Produces: `GroqBrowserSearchJobAdapter implements JobProviderAdapter`; `search(params: JobSearchQueryParams): Promise<JobPosting[]>`.

- [x] Add adapter with GPT-OSS 20B and Browser Search tool.
- [x] Send only role/skills, country, preferred location and workplace type.
- [x] Validate required title/company/direct HTTP(S) URL and cap result count.
- [x] Mark source as unverified discovery.
- [x] Add tests for successful mapping, URL rejection and malformed JSON.
- [ ] Run `bun run test -- src/services/jobSearchService.groq.test.ts`; expected: all adapter tests pass.

### Task 2: Connect existing Sourcing flow and local filtering

**Files:**
- Modify: `src/components/sourcing/SourcingTab.tsx`
- Modify: `src/services/jobSearchService.ts`

**Interfaces:**
- Consumes: existing `groqApiKey` from `useWizardStore`.
- Produces: one additional provider status in the existing live search report.

- [x] Pass the existing Groq key to `executeLiveSearch`.
- [x] Keep provider disabled when key is absent.
- [x] Preserve the existing saved location filter for Groq results.
- [ ] Review workplace/country filter behavior on representative India and worldwide searches.
- [ ] Run `bun run lint` and `bun run build`; expected: no TypeScript errors and successful Vite build.

### Task 3: CI and Android verification

**Files:**
- No product code unless verification reveals a defect.

- [ ] Open a pull request and inspect GitHub Actions.
- [ ] Fix only verified failures, with regression tests.
- [ ] Run `bun run check`.
- [ ] Run `bun run android:debug` and confirm APK artifact.
- [ ] Install on Android and smoke-test search, filtering, offline saved jobs, and no-key behavior.

## Completion rule
Do not call this feature complete until all verification steps pass. A green CI run does not prove the Groq account has Browser Search entitlement or that the Android WebView can reach Groq; test those separately on the user's device.
