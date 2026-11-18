# Evidence-Based Vacancy Verification — Design

## Goal
Help BYOC users distinguish a public vacancy record from an unverified job-search result, without pretending that AI can certify an employer or vacancy. Checks must be deterministic, explainable, and local-first.

## Scope for the first implementation
- Support exact public-posting checks for Greenhouse URLs through Greenhouse's documented public Job Board GET endpoint, using its documented JSONP callback mechanism so the browser/Android app does not need a proxy server.
- For Lever, Ashby, Workday, SmartRecruiters, custom career sites, and other unsupported URLs, return **Manual review required**. Do not bypass CORS, scrape login pages, or introduce a backend proxy.
- Check only the posting URL's board token and job ID. Do not send the user's resume, profile, contact details, or application history anywhere.
- Compare the returned ATS posting ID, title, and company name with the selected job. Preserve the official title/company and publication/update/deadline timestamps as evidence.
- Run deterministic local risk-signal checks on the job description (fees/deposits, requests for financial details, off-platform messaging, consumer email addresses). These are warnings, not fraud findings.
- Store the evidence in the existing encrypted local job record.

## Evidence language
- **Public ATS record found**: the exact Greenhouse posting ID was returned and the title/company match.
- **Posting expired**: the ATS record exists but its explicit application deadline is in the past.
- **Details differ**: an ATS record exists but title or company does not match the imported job.
- **Not found**: the public endpoint returned no matching record.
- **Manual review required**: unsupported ATS or custom URL.
- **Check failed**: timeout, script/network error, or invalid response.

None of these statuses means the employer's legal identity or the offer's legitimacy has been verified. Keep `employerIdentityVerified: false` in the evidence model.

## Acceptance criteria
- Greenhouse URLs are parsed strictly; malformed tokens and non-numeric job IDs are rejected.
- The browser check uses only the official public GET endpoint and a generated JSONP callback name.
- The exact returned posting ID is required; title/company mismatches are never silently marked confirmed.
- Unsupported ATS providers do not trigger guessed API calls.
- Risk flags are computed locally and never label a company or job as fraudulent.
- Results persist in the encrypted local job record and can be rechecked by the user.
- UI clearly separates public-posting evidence from Groq AI career-fit analysis.
- Tests cover parsing, match/mismatch/not-found, manual review, risk signals, JSONP cleanup, and failure handling.
