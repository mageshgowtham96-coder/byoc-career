import assert from 'node:assert/strict';

const boards = [
  { provider: 'Greenhouse', board: 'Capco', callback: 'byocSmokeCapco', url: 'https://boards-api.greenhouse.io/v1/boards/capco/jobs?content=true&callback=byocSmokeCapco' },
  { provider: 'Greenhouse', board: 'WPP', callback: 'byocSmokeWpp', url: 'https://boards-api.greenhouse.io/v1/boards/wpp/jobs?content=true&callback=byocSmokeWpp' },
  { provider: 'Greenhouse', board: 'VML', callback: 'byocSmokeVml', url: 'https://boards-api.greenhouse.io/v1/boards/vmlenterprisesolutions/jobs?content=true&callback=byocSmokeVml' },
  { provider: 'Greenhouse', board: 'Payoneer', callback: 'byocSmokePayoneer', url: 'https://boards-api.greenhouse.io/v1/boards/payoneer/jobs?content=true&callback=byocSmokePayoneer' },
  { provider: 'Greenhouse', board: 'Tide', callback: 'byocSmokeTide', url: 'https://boards-api.greenhouse.io/v1/boards/tide/jobs?content=true&callback=byocSmokeTide' },
  { provider: 'Greenhouse', board: 'InMobi', callback: 'byocSmokeInMobi', url: 'https://boards-api.greenhouse.io/v1/boards/inmobi/jobs?content=true&callback=byocSmokeInMobi' },
  { provider: 'Greenhouse', board: 'PubMatic', callback: 'byocSmokePubMatic', url: 'https://boards-api.greenhouse.io/v1/boards/pubmatic/jobs?content=true&callback=byocSmokePubMatic' },
  { provider: 'Greenhouse', board: 'Zenoti', callback: 'byocSmokeZenoti', url: 'https://boards-api.greenhouse.io/v1/boards/zenoti/jobs?content=true&callback=byocSmokeZenoti' },
  { provider: 'Workable', board: 'Weekday AI', callback: 'byocSmokeWeekday', url: 'https://www.workable.com/api/accounts/weekday-1?details=true&callback=byocSmokeWeekday' },
  { provider: 'Workable', board: 'Rentokil Initial', callback: 'byocSmokeRentokil', url: 'https://www.workable.com/api/accounts/rentokil-initial?details=true&callback=byocSmokeRentokil' },
  { provider: 'Workable', board: 'Capgemini', callback: 'byocSmokeCapgemini', url: 'https://www.workable.com/api/accounts/capgemini-insurance?details=true&callback=byocSmokeCapgemini' },
  { provider: 'Workable', board: 'Keywords Studios', callback: 'byocSmokeKeywords', url: 'https://www.workable.com/api/accounts/keywords-intl1?details=true&callback=byocSmokeKeywords' },
  { provider: 'Workable', board: 'Unison Group', callback: 'byocSmokeUnison', url: 'https://www.workable.com/api/accounts/unisongroup?details=true&callback=byocSmokeUnison' }
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
  const payload = parseJsonp(await response.text(), board.callback);
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
  process.stdout.write(`LIVE SOURCE PASS: ${board.provider} / ${board.board}: ${payload.jobs.length} open postings, ${indiaJobs.length} India-located\n`);
}
