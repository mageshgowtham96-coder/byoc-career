import assert from 'node:assert/strict';

const boards = [
  { provider: 'Greenhouse', board: 'Capco', callback: 'byocSmokeCapco', url: 'https://boards-api.greenhouse.io/v1/boards/capco/jobs?callback=byocSmokeCapco' },
  { provider: 'Greenhouse', board: 'WPP', callback: 'byocSmokeWpp', url: 'https://boards-api.greenhouse.io/v1/boards/wpp/jobs?callback=byocSmokeWpp' },
  { provider: 'Greenhouse', board: 'VML', callback: 'byocSmokeVml', url: 'https://boards-api.greenhouse.io/v1/boards/vmlenterprisesolutions/jobs?callback=byocSmokeVml' },
  { provider: 'Greenhouse', board: 'Payoneer', callback: 'byocSmokePayoneer', url: 'https://boards-api.greenhouse.io/v1/boards/payoneer/jobs?callback=byocSmokePayoneer' },
  { provider: 'Greenhouse', board: 'Tide', callback: 'byocSmokeTide', url: 'https://boards-api.greenhouse.io/v1/boards/tide/jobs?callback=byocSmokeTide' },
  { provider: 'Greenhouse', board: 'InMobi', callback: 'byocSmokeInMobi', url: 'https://boards-api.greenhouse.io/v1/boards/inmobi/jobs?callback=byocSmokeInMobi' },
  { provider: 'Greenhouse', board: 'PubMatic', callback: 'byocSmokePubMatic', url: 'https://boards-api.greenhouse.io/v1/boards/pubmatic/jobs?callback=byocSmokePubMatic' },
  { provider: 'Greenhouse', board: 'Zenoti', callback: 'byocSmokeZenoti', url: 'https://boards-api.greenhouse.io/v1/boards/zenoti/jobs?callback=byocSmokeZenoti' },
  { provider: 'Workable', board: 'Weekday AI', callback: 'byocSmokeWeekday', url: 'https://www.workable.com/api/accounts/weekday-1?callback=byocSmokeWeekday' },
  { provider: 'Workable', board: 'Rentokil Initial', callback: 'byocSmokeRentokil', url: 'https://www.workable.com/api/accounts/rentokil-initial?callback=byocSmokeRentokil' },
  { provider: 'Workable', board: 'Capgemini', callback: 'byocSmokeCapgemini', url: 'https://www.workable.com/api/accounts/capgemini-insurance?callback=byocSmokeCapgemini' },
  { provider: 'Workable', board: 'Keywords Studios', callback: 'byocSmokeKeywords', url: 'https://www.workable.com/api/accounts/keywords-intl1?callback=byocSmokeKeywords' },
  { provider: 'Workable', board: 'Unison Group', callback: 'byocSmokeUnison', url: 'https://www.workable.com/api/accounts/unisongroup?callback=byocSmokeUnison' }
];

function parseJsonp(body, callback) {
  const marker = `${callback}(`;
  const start = body.indexOf(marker);
  const end = body.lastIndexOf(')');
  assert.notEqual(start, -1, `Expected JSONP callback ${callback}; response began: ${body.slice(0, 180)}`);
  assert.ok(end > start + marker.length, `Malformed JSONP response for ${callback}`);
  return JSON.parse(body.slice(start + marker.length, end).trim());
}

function jobLocation(job) {
  const locations = [
    job.location?.name,
    typeof job.location === 'string' ? job.location : '',
    JSON.stringify(job.location || {}),
    job.city,
    job.state,
    job.country,
    job.country_code === 'IN' || job.location?.country_code === 'IN' ? 'India' : '',
    ...(Array.isArray(job.locations) ? job.locations.map((item) => JSON.stringify(item)) : [])
  ];
  return locations.filter(Boolean).join(' ');
}

let lastWorkableRequestAt = 0;
let totalResponseBytes = 0;
const allIndiaJobs = [];
for (const board of boards) {
  if (board.provider === 'Workable' && lastWorkableRequestAt > 0) {
    const waitMs = Math.max(0, 1500 - (Date.now() - lastWorkableRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const response = await fetch(board.url, {
    headers: { Accept: 'application/javascript, application/json;q=0.9', 'User-Agent': 'BYOC-JobDiscovery/1.0' },
    signal: AbortSignal.timeout(20000)
  });
  if (board.provider === 'Workable') lastWorkableRequestAt = Date.now();
  assert.equal(response.ok, true, `${board.provider} ${board.board} returned HTTP ${response.status}`);
  const body = await response.text();
  const responseBytes = Buffer.byteLength(body, 'utf8');
  totalResponseBytes += responseBytes;
  const payload = parseJsonp(body, board.callback);
  assert.ok(Array.isArray(payload.jobs), `${board.provider} ${board.board} response has no jobs array`);
  assert.ok(payload.jobs.length > 0, `${board.provider} ${board.board} returned no public jobs`);
  const indiaMarkers = [
    'india', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'pune',
    'mumbai', 'gurugram', 'gurgaon', 'noida', 'new delhi', 'kolkata',
    'ahmedabad', 'jaipur', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram'
  ];
  const indiaJobs = payload.jobs.filter((job) => {
    const normalizedLocation = ` ${jobLocation(job).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    return indiaMarkers.some((marker) => normalizedLocation.includes(` ${marker} `));
  });
  assert.ok(indiaJobs.length > 0, `${board.provider} ${board.board} returned no India-located postings`);
  allIndiaJobs.push(...indiaJobs.map((job) => ({ ...job, __source: `${board.provider} / ${board.board}` })));
  process.stdout.write(`LIVE SOURCE PASS: ${board.provider} / ${board.board}: ${payload.jobs.length} open postings, ${indiaJobs.length} India-located, ${(responseBytes / 1024).toFixed(0)} KiB\n`);
}

process.stdout.write(`LIVE SOURCE TOTAL: ${(totalResponseBytes / (1024 * 1024)).toFixed(2)} MiB across ${boards.length} boards\n`);

const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'senior', 'junior', 'lead', 'associate', 'specialist', 'manager']);
const roleTitles = [...new Set(allIndiaJobs
  .map((job) => String(job.title || job.name || '').trim())
  .filter((title) => title.length >= 8 && title.length <= 90))]
  .slice(0, 10);
assert.equal(roleTitles.length, 10, `Expected at least 10 distinct live role titles; found ${roleTitles.length}`);

for (const roleTitle of roleTitles) {
  const terms = roleTitle.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !stopWords.has(term));
  assert.ok(terms.length > 0, `Could not derive search terms from live role title: ${roleTitle}`);
  const matches = allIndiaJobs.filter((job) => {
    const searchable = [job.title, job.name, job.description, job.full_description, job.department]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  assert.ok(matches.length > 0, `Live role search returned no results for "${roleTitle}"`);
  process.stdout.write(`LIVE INDIA ROLE SEARCH PASS: "${roleTitle}" -> ${matches.length} matching postings (sample source: ${matches[0].__source})\n`);
}
process.stdout.write('LIVE INDIA ROLE SEARCH TOTAL: 10/10 role queries returned at least one posting\n');
