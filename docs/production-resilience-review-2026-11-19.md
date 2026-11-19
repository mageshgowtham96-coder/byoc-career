# BYOC production resilience review — 19 November 2026

## Scope

Review the current PR #8 head and its local-first architecture for failure modes likely to appear during live use. This is a targeted code review, not a claim that every possible production failure can be eliminated. The app has no BYOC backend, so it cannot provide server-side circuit breakers, centralized quota sharing, provider health telemetry, or secret isolation from a compromised client device.

## Findings and remediation

| Finding | Risk | Remediation |
|---|---|---|
| Groq model defaults referenced Llama 3.3 70B and Llama 3.1 models after their announced 16 Aug 2026 shutdown for non-enterprise access | AI actions can fail with model-not-found errors | Prefer current Groq production chat models: `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`. Do not select speech, guard, or arbitrary catalog entries |
| Model cache was global and not tied to the active BYOK credential | A second workspace/key could inherit a model decision made with another key | Cache model selection against the key used for resolution; invalidate on model-not-found |
| Error handling returned immediately on transient failures and treated 429 as a generic wait-and-retry message | Temporary 5xx/network faults were brittle; quota retry could become wasteful | Two-attempt ceiling; bounded exponential backoff with jitter for transient failures; honor only short Retry-After values for 429; do not retry permanent 4xx errors or long quota waits |
| Provider abstraction advertised Gemini 1.5 model IDs and claimed all providers were client usable | Stale models and misleading capability claims | Update Gemini adapter model IDs but keep Gemini unavailable in this browser-only product; only Groq is enabled in the current user-facing workflow |
| Provider manager silently switched to another provider after failure, contrary to its own explicit-consent comment | Resume/profile information could be forwarded to a different company without the user's awareness | Remove automatic cross-provider failover. A failed selected provider returns its error; provider switching must be an explicit user choice |
| Groq model diagnostics reported the first catalog entry as the active model | It could report Whisper or another non-chat model as the chat model | Diagnostics now report only a supported chat model |
| Search suggestions were absent for partial roles | A partial query such as `fraud` relied entirely on broad text matching | Add local role suggestions with editable custom search, keyboard navigation, Escape dismissal, and WAI-ARIA combobox semantics |
| Live search results replaced the saved-job array with only the current query matches | Previously saved jobs could disappear when a narrower query was run | Merge new results into the existing saved collection |
| Job deduplication used only company + title | Two openings at the same employer/title in different cities could collapse into one | Include location in the deduplication identity |
| DOCX/deflate extraction trusted compressed input size without a decompressed-output ceiling | A small ZIP bomb could expand into a large XML stream and exhaust device memory | Reject DOCX document.xml above 20MB, enforce a streaming decompression ceiling, and verify actual output size against ZIP metadata |
| Native share-sheet cancellation returned a successful export result | A user cancelling the Android share sheet could see a false success state | Treat AbortError as a cancelled/unsuccessful export |
| Removing the Groq key or restoring a vault without a key could leave the UI's live-AI flag enabled | Settings could display a stale live-mode state | Derive live-AI mode from whether a Groq key is actually present |

## AI provider decision

### Current choice: Groq GPT-OSS, not a provider migration

Groq's current model catalogue lists GPT-OSS 120B and 20B as production models and identifies the older Llama models as deprecated for standard use. GPT-OSS 120B is the preferred model, with GPT-OSS 20B as the fallback when the account exposes it. Preview models are not selected for this production-oriented path. Model availability must still be checked against the user's own key.

Groq documents request/token rate limits and HTTP 429 behavior. A free tier is not an unlimited production SLA. BYOC therefore handles transient failures but does not promise uninterrupted AI availability.

### Why not switch BYOC to Gemini by default?

Gemini offers a free tier on eligible models, but Google's pricing page says free-tier prompts may be used to improve Google products. BYOC can send resume text, work history, skills and job context to the provider when the user explicitly invokes AI. That data-use trade-off is material. The Gemini adapter is therefore not enabled in this browser-only release. Enabling it should require an explicit user opt-in, a clear privacy notice, model/quota verification, and a reviewed transport/security implementation.

OpenRouter's free model availability and per-model limits can change, and the previous static adapter list included paid model IDs. It is not a reliable default free-provider replacement. Automatic failover is intentionally disabled because it would change the data recipient without consent.

## Production methodology references

- Google SRE, *Addressing Cascading Failures*: randomized exponential backoff, retry limits, retry budgets, and isolation of noncritical dependencies. https://sre.google/sre-book/addressing-cascading-failures/
- Groq, *Rate Limits*: organization-level RPM/TPM/RPD limits, 429 responses, and Retry-After/rate-limit headers. https://console.groq.com/docs/rate-limits
- Groq, *Supported Models*: production model catalogue and current model IDs. https://console.groq.com/docs/models
- Groq, *Model Deprecation*: retirement dates and recommended replacements. https://console.groq.com/docs/deprecations
- Groq, *Structured Outputs*: supported JSON/structured-output models. https://console.groq.com/docs/structured-outputs
- Google AI, *Gemini API pricing*: free-tier eligibility and content-use disclosure. https://ai.google.dev/gemini-api/docs/pricing
- W3C WAI-ARIA Authoring Practices, *Combobox Pattern*: editable suggestions, keyboard interactions and accessible roles. https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- OWASP, *Password Storage Cheat Sheet*: recommends PBKDF2-HMAC-SHA256 with 600,000 iterations where PBKDF2 is required. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Remaining risks / not claimed as fixed

1. A third-party provider can still go offline, change quotas, retire models, or deny a request. The app cannot remove provider-side outages.
2. The free tier's exact limits are account/project specific. BYOC cannot read the user's Groq billing tier or guarantee that the next request is within quota.
3. Direct browser-to-provider BYOK means the key must exist in the client runtime while a request is made. AES-GCM protects it at rest in BYOC's vault, not against malware, browser extensions, rooted-device compromise, or debugging access on the device.
4. The current UI-facing AI workflows still call the Groq service directly. The generic provider abstraction remains experimental scaffolding and is not yet the live workflow router.
5. Live public job feeds can time out, change schemas, return incomplete coverage, or contain stale/fraudulent listings. Provider isolation prevents one feed from discarding another's successful response; it cannot make the feeds authoritative.
6. Search-role suggestions are a convenience vocabulary, not a complete job-title taxonomy. Custom search text remains supported.
7. The vault currently uses PBKDF2-HMAC-SHA256 with 100,000 iterations. OWASP's current recommendation is 600,000 iterations where PBKDF2 is required. Raising it safely needs a versioned envelope migration because the passphrase and emergency-recovery wrappers currently share one iteration count; changing it in place could lock existing users out of their recovery path. This remains a security-hardening item, and mobile-device unlock performance must be benchmarked before choosing the new cost.
8. Automated tests cannot replace live API smoke tests or physical Android device testing. The release APK remains a debug build until a signing key and release process are configured.

## Validation required before calling this production-ready

- TypeScript check, all unit tests, production web build and Android debug APK build on this exact commit.
- Install and exercise the APK on a physical Android device.
- Manual Groq smoke tests with a valid key: success, 401 invalid key, 429 without Retry-After, 429 with short Retry-After, 503, timeout, empty response, truncated JSON and unavailable model.
- Manual search checks with partial and multi-word roles, no-result queries, provider timeout, and verification that saved jobs remain after multiple searches.
- Resume intake checks with multiple real-world layouts (redacted), selectable-text PDFs, DOCX and malformed files.

