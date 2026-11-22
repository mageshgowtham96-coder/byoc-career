import assert from 'node:assert/strict';

const boards = [
  { provider: 'Greenhouse', board: 'Capco', callback: 'byocSmokeGreenhouse', url: 'https://boards-api.greenhouse.io/v1/boards/capco/jobs?content=true&callback=byocSmokeGreenhouse' },
  { provider: 'Workable', board: 'Weekday AI', callback: 'byocSmokeWorkable', url: 'https://www.workable.com/api/accounts/weekday-1?details=true&callback=byocSmokeWorkable' }
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
  return [
    job.location?.name,
    typeof job.location === 'string' ? job.location : '',
    job.city,
    job.state,
    job.country,
    ...(Array.isArray(job.locations) ? job.locations.map((item) => JSON.stringify(item)) : [])
  ].filter(Boolean).join(' ');
}

for (const board of boards) {
  const response = await fetch(board.url, {
    headers: { Accept: 'application/javascript, application/json;q=0.9' },
    signal: AbortSignal.timeout(20000)
  });
  assert.equal(response.ok, true, `${board.provider} ${board.board} returned HTTP ${response.status}`);
  const payload = parseJsonp(await response.text(), board.callback);
  assert.ok(Array.isArray(payload.jobs), `${board.provider} ${board.board} response has no jobs array`);
  assert.ok(payload.jobs.length > 0, `${board.provider} ${board.board} returned no public jobs`);
  const indiaJobs = payload.jobs.filter((job) => /india|bengaluru|bangalore|hyderabad|chennai|pune|mumbai|gurugram|gurgaon|noida/i.test(jobLocation(job)));
  assert.ok(indiaJobs.length > 0, `${board.provider} ${board.board} returned no India-located postings`);
  process.stdout.write(`LIVE SOURCE PASS: ${board.provider} / ${board.board}: ${payload.jobs.length} open postings, ${indiaJobs.length} India-located\n`);
}
