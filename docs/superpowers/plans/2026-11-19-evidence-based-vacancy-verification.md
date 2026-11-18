# Implementation Plan — Evidence-Based Vacancy Verification

1. **Evidence schema and persistence**
   - Add `JobVerificationEvidence` and optional `JobPosting.verification`.
   - Add a store action to update verification evidence without changing AI vetting.
   - Confirm job changes continue through the existing encrypted vault subscription.

2. **Deterministic local risk signals**
   - Add a pure scanner for fee/deposit requests, financial-detail requests, off-platform messaging, and consumer email addresses.
   - Add tests including common negative phrases such as “no application fee”.

3. **Greenhouse public-record checker**
   - Parse only supported Greenhouse board/job URL forms.
   - Use the documented public GET endpoint through JSONP, with a strict callback name, timeout, and cleanup.
   - Require exact posting ID plus title/company agreement before returning `confirmed`.
   - Record publication/update/deadline timestamps and evidence URL.

4. **Unsupported-provider handling**
   - Explicitly return manual review for Lever, Ashby, Workday, SmartRecruiters, and other unsupported URLs.
   - Never add a server proxy or call an undocumented endpoint.

5. **Vetting UI**
   - Add a separate Vacancy Evidence panel and explicit check button.
   - Show evidence, timestamps, mismatch/expiry explanations, and local risk flags.
   - Keep AI career-fit analysis separate and clearly labelled.

6. **Verification**
   - Run TypeScript, tests, production build, and Android debug build.
   - Review the final copy to ensure no UI label implies employer identity or offer authenticity has been certified.
   - Keep the PR draft until owner review and physical-device testing.
