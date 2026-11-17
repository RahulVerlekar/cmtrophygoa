import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const eventsUrl = asModule(await readFile(new URL('../public/register/events.js', import.meta.url), 'utf8'));
const validationSource = (await readFile(new URL('../public/register/validation.js', import.meta.url), 'utf8'))
  .replace("'./events.js'", `'${eventsUrl}'`);
const validationUrl = asModule(validationSource);
const { validateRegistration, sanitizedRegistration } = await import(validationUrl);
const handlerSource = (await readFile(new URL('../functions/api/registrations.js', import.meta.url), 'utf8'))
  .replace("'../../public/register/validation.js'", `'${validationUrl}'`);
const { onRequestPost } = await import(asModule(handlerSource));
const configSource = await readFile(new URL('../functions/api/turnstile-config.js', import.meta.url), 'utf8');
const { onRequestGet: getTurnstileConfig } = await import(asModule(configSource));
const statusSource = (await readFile(new URL('../functions/api/event-status.js', import.meta.url), 'utf8'))
  .replace("'../../public/register/events.js'", `'${eventsUrl}'`);
const { onRequestGet: getEventStatus } = await import(asModule(statusSource));
const env = { SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'test-secret', TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET_KEY: 'test-turnstile-secret' };

const adult = {
  fullName: 'Test Participant',
  dateOfBirth: '2000-01-01',
  gender: 'Female',
  phone: '9999999999',
  constituency: 'Panaji',
  bloodGroup: 'Unknown',
  tshirtSize: 'M',
  epic: 'TEST123'
};

function registration(overrides = {}) {
  return { category: 'Sports', event: 'marathon', eventOption: '5 KM Run', participants: [{ ...adult }], consent: true, ...overrides };
}

const teamEvents = [
  { event: 'cricket', category: 'Sports', min: 11, max: 15, gender: 'Male' },
  { event: 'football-men', category: 'Sports', min: 11, max: 16, gender: 'Male' },
  { event: 'football-women', category: 'Sports', min: 11, max: 16, gender: 'Female' },
  { event: 'volleyball', category: 'Sports', min: 6, max: 12, gender: 'Male' },
  { event: 'group-dance', category: 'Cultural', min: 6, max: 10 },
  { event: 'fugdi', category: 'Cultural', min: 10, max: 14 },
  { event: 'ghumat-aarti-men', category: 'Cultural', min: 8, max: 12, gender: 'Male' },
  { event: 'ghumat-aarti-women', category: 'Cultural', min: 8, max: 12, gender: 'Female' },
  { event: 'street-play', category: 'Cultural', min: 8, max: 15 }
];

function teamRegistration(event, count) {
  const person = { ...adult, gender: event.gender || 'Female', collegeId: 'COLLEGE1' };
  return registration({
    category: event.category,
    event: event.event,
    teamName: 'Synthetic team',
    collegeName: 'Synthetic college',
    participants: Array.from({ length: count }, (_, index) => ({ ...person, fullName: `Test participant ${index + 1}`, epic: `TEST${index + 1}` }))
  });
}

for (const event of teamEvents) {
  test(`${event.event} validates team boundaries and participant eligibility`, () => {
    const minTeam = teamRegistration(event, event.min);
    const maxTeam = teamRegistration(event, event.max);
    assert.equal(validateRegistration(minTeam, '2026-11-16'), null);
    assert.equal(validateRegistration(maxTeam, '2026-11-16'), null);
    assert.match(validateRegistration(teamRegistration(event, event.min - 1), '2026-11-16'), /participant\(s\)/);
    assert.match(validateRegistration(teamRegistration(event, event.max + 1), '2026-11-16'), /participant\(s\)/);
    assert.match(validateRegistration({ ...minTeam, teamName: ' ' }, '2026-11-16'), /team name/);

    for (const field of ['fullName', 'dateOfBirth', 'gender', 'phone', 'constituency', 'bloodGroup', 'tshirtSize']) {
      for (const index of [0, 1]) {
        const invalid = teamRegistration(event, event.min);
        invalid.participants[index][field] = '';
        assert.match(validateRegistration(invalid, '2026-11-16'), index === 0 ? /Primary participant:/ : /Participant 2:/, field);
      }
    }
    if (event.event === 'street-play') {
      assert.match(validateRegistration({ ...minTeam, collegeName: '' }, '2026-11-16'), /college name/);
      minTeam.participants[1].collegeId = '';
      assert.match(validateRegistration(minTeam, '2026-11-16'), /college ID/);
      minTeam.participants[1].collegeId = 'COLLEGE1';
    }
    for (const index of [0, 1]) {
      const boundary = teamRegistration(event, event.min);
      Object.assign(boundary.participants[index], { dateOfBirth: '2008-11-17', aadhaar: '123456789012', parentEpic: '', epic: '' });
      assert.match(validateRegistration(boundary, '2026-11-16'), /parent's EPIC/);
      boundary.participants[index].parentEpic = 'PARENT1';
      assert.equal(validateRegistration(boundary, '2026-11-16'), null);
      boundary.participants[index].dateOfBirth = '2008-11-16';
      assert.match(validateRegistration(boundary, '2026-11-16'), /enter an EPIC/);
      boundary.participants[index].epic = 'TEST1';
      assert.equal(validateRegistration(boundary, '2026-11-16'), null);
    }
    minTeam.participants[1].epic = '';
    assert.match(validateRegistration(minTeam, '2026-11-16'), /Participant 2: enter an EPIC/);
    minTeam.participants[1].epic = 'TEST2';
    minTeam.participants[1].constituency = 'Margao';
    if (event.event === 'street-play') {
      assert.equal(validateRegistration(minTeam, '2026-11-16'), null);
    } else {
      assert.match(validateRegistration(minTeam, '2026-11-16'), /same constituency/);
      minTeam.participants[1].constituency = 'Panaji';
    }
    if (event.gender) {
      minTeam.participants[1].gender = event.gender === 'Male' ? 'Female' : 'Male';
      assert.match(validateRegistration(minTeam, '2026-11-16'), /gender must match/);
      minTeam.participants[1].gender = event.gender;
    }
    Object.assign(minTeam.participants[1], { dateOfBirth: '2010-01-01', aadhaar: '123456789012', parentEpic: '' });
    assert.match(validateRegistration(minTeam, '2026-11-16'), /parent's EPIC/);
    minTeam.participants[1].parentEpic = 'PARENT1';
    assert.equal(validateRegistration(minTeam, '2026-11-16'), null);
    if (event.event !== 'street-play') {
      minTeam.participants[1].aadhaar = '';
      assert.match(validateRegistration(minTeam, '2026-11-16'), /Aadhaar/);
      minTeam.participants[1].aadhaar = '123456789012';
      minTeam.participants[1].dateOfBirth = '2011-01-01';
      assert.match(validateRegistration(minTeam, '2026-11-16'), /at least 16/);
    } else {
      minTeam.participants[1].dateOfBirth = '2011-01-01';
      assert.equal(validateRegistration(minTeam, '2026-11-16'), null);
    }
  });
}

test('the endpoint rejects incomplete teams before verification or storage', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error('Invalid teams must not reach verification or storage'); };
    for (const event of teamEvents) {
      const data = teamRegistration(event, event.min - 1);
      const request = new Request('https://example.test/api/registrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, turnstileToken: 'test-token' })
      });
      const response = await onRequestPost({ request, env });
      assert.equal(response.status, 400, event.event);
      assert.match((await response.json()).error, /participant\(s\)/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('all team events send every sanitized participant to storage after verification', async () => {
  const originalFetch = globalThis.fetch;
  const saved = [];
  try {
    globalThis.fetch = async (url, options) => {
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        return Response.json({ success: true, hostname: 'example.test', action: 'registration' });
      }
      assert.equal(url, 'https://database.example.test/rest/v1/cm_trophy_registrations');
      saved.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    };
    for (const event of teamEvents) {
      const data = teamRegistration(event, event.max);
      const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()));
      Object.assign(data.participants[1], { dateOfBirth: `${currentYear - 16}-01-01`, aadhaar: '123456789012', parentEpic: ' PARENT1 ' });
      const request = new Request('https://example.test/api/registrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, turnstileToken: 'test-token' })
      });
      const response = await onRequestPost({ request, env });
      assert.equal(response.status, 201, event.event);
      const row = saved.at(-1);
      assert.equal(row.event, event.event);
      assert.equal(row.details.participants.length, event.max);
      assert.deepEqual(row.details.participants.map((person) => person.fullName), data.participants.map((person) => person.fullName));
      assert.equal(row.details.participants[0].epic, 'TEST1');
      assert.equal(row.details.teamName, 'Synthetic team');
      if (event.event === 'street-play') {
        assert.equal(row.details.collegeName, 'Synthetic college');
        assert.ok(row.details.participants.every((person) => person.collegeId === 'COLLEGE1'));
      }
      assert.equal(row.details.participants[1].parentEpic, 'PARENT1');
      assert.equal(Object.hasOwn(row.details.participants[1], 'epic'), false);
      assert.equal(Object.hasOwn(row.details.participants[1], 'aadhaar'), event.event !== 'street-play');
      assert.equal(Object.hasOwn(row.details, 'turnstileToken'), false);
    }
    assert.equal(saved.length, teamEvents.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('validates individual selections and required participant fields', () => {
  assert.equal(validateRegistration(registration(), '2026-11-16'), null);
  assert.match(validateRegistration(registration({ eventOption: '' }), '2026-11-16'), /distance/);
  assert.match(validateRegistration(registration({ participants: [{ ...adult, gender: '' }] }), '2026-11-16'), /gender/);
  assert.match(validateRegistration(registration({ consent: false }), '2026-11-16'), /Confirm/);
  assert.match(validateRegistration(registration({ participants: [{ ...adult, dateOfBirth: '2024-02-31' }] }), '2026-11-16'), /date of birth/);
});

test('allows one or two Rangoli participants in either category without a team name', () => {
  const rangoli = registration({ category: 'Cultural', event: 'rangoli', eventOption: 'Traditional - Sanskar Bharti' });
  assert.equal(validateRegistration(rangoli, '2026-11-16'), null);
  const pair = { ...rangoli, eventOption: 'Creative (Portrait)', participants: [{ ...adult }, { ...adult, fullName: 'Second participant' }] };
  assert.equal(validateRegistration(pair, '2026-11-16'), null);
  const result = sanitizedRegistration(pair, '2026-11-16');
  assert.equal(result.data.eventOption, 'Creative (Portrait)');
  assert.equal(result.data.participants.length, 2);
  assert.equal(Object.hasOwn(result.data, 'teamName'), false);
  assert.match(validateRegistration({ ...pair, eventOption: 'Other' }, '2026-11-16'), /rangoli category/);
  assert.match(validateRegistration({ ...pair, participants: [] }, '2026-11-16'), /1–2 participant/);
  assert.match(validateRegistration({ ...pair, participants: [...pair.participants, { ...adult }] }, '2026-11-16'), /1–2 participant/);
  assert.match(validateRegistration({ ...pair, participants: [{ ...adult }, { ...adult, epic: '' }] }, '2026-11-16'), /Participant 2: enter an EPIC/);
});

test('the endpoint stores both Rangoli participants and the selected category', async (t) => {
  let saved;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return Response.json({ success: true, hostname: 'example.test', action: 'registration' });
    }
    saved = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  });
  const data = registration({
    category: 'Cultural', event: 'rangoli', eventOption: 'Creative (Portrait)',
    participants: [{ ...adult }, { ...adult, fullName: 'Second participant' }]
  });
  const request = new Request('https://example.test/api/registrations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, turnstileToken: 'test-token' })
  });
  const response = await onRequestPost({ request, env });
  assert.equal(response.status, 201);
  assert.equal(saved.details.eventOption, 'Creative (Portrait)');
  assert.equal(saved.details.participants.length, 2);
  assert.equal(saved.details.participants[1].fullName, 'Second participant');
  assert.equal(Object.hasOwn(saved.details, 'teamName'), false);
});

test('email is optional and requires the same complete format for all registrations', () => {
  for (const email of ['', 'captain@example.com']) {
    assert.equal(validateRegistration(registration({ email }), '2026-11-16'), null);
  }
  for (const email of ['captain@example', 'captain@@example.com']) {
    assert.match(validateRegistration(registration({ email }), '2026-11-16'), /valid email address.*leave it blank/);
  }
});

test('rejects null characters in saved free-text fields', () => {
  const streetEvent = teamEvents.find((event) => event.event === 'street-play');
  const cases = [
    { data: registration({ email: 'person\0@example.com' }), message: /email address/ },
    { data: registration({ participants: [{ ...adult, fullName: 'Test\0Name' }] }), message: /Primary participant:.*full name/ },
    { data: registration({ participants: [{ ...adult, epic: 'TEST\0' }] }), message: /Primary participant:.*EPIC number/ },
    { data: registration({ participants: [{ ...adult, dateOfBirth: '2010-01-01', aadhaar: '123456789012', parentEpic: 'TEST\0' }] }), message: /parent's EPIC/ },
    { data: { ...teamRegistration(streetEvent, streetEvent.min), teamName: 'Team\0' }, message: /team name/ },
    { data: { ...teamRegistration(streetEvent, streetEvent.min), collegeName: 'College\0' }, message: /college name/ },
    { data: { ...teamRegistration(streetEvent, streetEvent.min), participants: Array.from({ length: streetEvent.min }, (_, index) => ({ ...adult, collegeId: index === 1 ? 'ID\0' : 'ID' })) }, message: /Participant 2:.*college ID/ }
  ];
  for (const { data, message } of cases) {
    const error = validateRegistration(data, '2026-11-16');
    assert.match(error, /unsupported characters/);
    assert.match(error, message);
  }
  const valid = registration({ participants: [{ ...adult, fullName: 'José 😀' }] });
  assert.equal(validateRegistration(valid, '2026-11-16'), null);
});

test('endpoint rejects null characters before verification and database access', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error('Invalid registrations must not reach verification or storage'); };
    const request = new Request('https://example.test/api/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...registration({ participants: [{ ...adult, epic: 'TEST\0' }] }), turnstileToken: 'test-token' })
    });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unsupported characters.*EPIC/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforces team limits and constituency, counting the captain', () => {
  const football = registration({ category: 'Sports', event: 'football-men', teamName: 'Test team', participants: Array.from({ length: 11 }, () => ({ ...adult, gender: 'Male' })) });
  assert.equal(validateRegistration(football, '2026-11-16'), null);
  assert.match(validateRegistration({ ...football, participants: football.participants.slice(0, 10) }, '2026-11-16'), /11–16/);
  football.participants[1].gender = 'Female';
  assert.match(validateRegistration(football, '2026-11-16'), /gender must match/);
  football.participants[1].gender = 'Male';
  football.participants[1].constituency = 'Margao';
  assert.match(validateRegistration(football, '2026-11-16'), /same constituency/);
});

test('requires applicable minor and street-play IDs and removes unused fields', () => {
  const minor = { ...adult, dateOfBirth: '2010-01-01', aadhaar: '123456789012', parentEpic: 'PARENT1', epic: 'UNUSED' };
  const data = registration({ participants: [minor] });
  assert.equal(validateRegistration(data, '2026-11-16'), null);
  const clean = sanitizedRegistration(data, '2026-11-16').data.participants[0];
  assert.equal(clean.aadhaar, '123456789012');
  assert.equal(Object.hasOwn(clean, 'epic'), false);
  assert.match(validateRegistration(registration({ participants: [{ ...minor, aadhaar: '' }] }), '2026-11-16'), /Aadhaar/);
  const street = registration({ category: 'Cultural', event: 'street-play', teamName: 'Test', collegeName: 'Test College', participants: Array.from({ length: 8 }, () => ({ ...adult, collegeId: 'COLLEGE1' })) });
  assert.equal(validateRegistration(street, '2026-11-16'), null);
  assert.match(validateRegistration({ ...street, participants: street.participants.map((p) => ({ ...p, collegeId: '' })) }, '2026-11-16'), /college ID/);
  const missingEpic = { ...street, participants: street.participants.map((p, index) => index === 1 ? { ...p, epic: '' } : p) };
  assert.match(validateRegistration(missingEpic, '2026-11-16'), /Participant 2: enter an EPIC/);
  assert.equal(sanitizedRegistration(street, '2026-11-16').data.participants[0].epic, 'TEST123');
  assert.equal(sanitizedRegistration(street, '2026-11-16').data.participants[0].collegeId, 'COLLEGE1');
  const eighteen = { ...street, participants: street.participants.map((p, index) => index === 0 ? { ...p, dateOfBirth: '2008-11-16', epic: '' } : p) };
  assert.match(validateRegistration(eighteen, '2026-11-16'), /Primary participant: enter an EPIC/);
  const streetMinor = { ...street, participants: street.participants.map((p, index) => index === 1 ? { ...p, dateOfBirth: '2010-01-01', parentEpic: '' } : p) };
  assert.match(validateRegistration(streetMinor, '2026-11-16'), /Participant 2: enter a parent's EPIC/);
  streetMinor.participants[1].parentEpic = ' PARENT1 ';
  const savedMinor = sanitizedRegistration(streetMinor, '2026-11-16').data.participants[1];
  assert.equal(savedMinor.parentEpic, 'PARENT1');
  assert.equal(savedMinor.collegeId, 'COLLEGE1');
  assert.equal(Object.hasOwn(savedMinor, 'epic'), false);
  assert.equal(Object.hasOwn(savedMinor, 'aadhaar'), false);
});

test('derives badminton age category from date of birth', () => {
  const data = registration({ event: 'badminton', participants: [{ ...adult, dateOfBirth: '1990-01-01' }] });
  assert.equal(sanitizedRegistration(data, '2026-11-16').data.participants[0].ageCategory, '31–50');
});

test('endpoint fails closed when storage is unconfigured or input is invalid', async () => {
  const request = (body) => new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await onRequestPost({ request: request(registration()), env: {} })).status, 503);
  assert.equal((await onRequestPost({ request: request(registration({ consent: false })), env })).status, 400);
  const oversized = new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(100001) });
  assert.equal((await onRequestPost({ request: oversized, env })).status, 413);
});

test('exposes only the public verification key when configured', async () => {
  assert.equal(getTurnstileConfig({ env: {} }).status, 503);
  const config = getTurnstileConfig({ env });
  assert.deepEqual(await config.json(), { siteKey: 'test-site-key' });
  assert.equal(config.headers.get('Cache-Control'), 'no-store');
});

test('event status returns open or closed and fails closed on invalid or unavailable settings', async () => {
  const originalFetch = globalThis.fetch;
  const request = (event) => new Request(`https://example.test/api/event-status?event=${encodeURIComponent(event)}`);
  try {
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/rest/v1/cm_trophy_event_settings');
      assert.equal(parsed.searchParams.get('event'), 'eq.cricket');
      assert.equal(options.headers.apikey, 'test-secret');
      assert.equal(options.cache, 'no-store');
      return Response.json([{ registration_open: true }]);
    };
    const open = await getEventStatus({ request: request('cricket'), env });
    assert.deepEqual(await open.json(), { open: true });
    assert.equal(open.headers.get('Cache-Control'), 'no-store');
    globalThis.fetch = async () => Response.json([{ registration_open: false }]);
    assert.deepEqual(await (await getEventStatus({ request: request('cricket'), env })).json(), { open: false });
    assert.equal((await getEventStatus({ request: request('__proto__'), env })).status, 400);
    assert.equal((await getEventStatus({ request: request('cricket'), env: {} })).status, 503);
    for (const result of [[], [{ registration_open: 'false' }], [{ registration_open: true }, { registration_open: false }]]) {
      globalThis.fetch = async () => Response.json(result);
      assert.equal((await getEventStatus({ request: request('cricket'), env })).status, 503);
    }
    globalThis.fetch = async () => new Response(null, { status: 500 });
    assert.equal((await getEventStatus({ request: request('cricket'), env })).status, 503);
    globalThis.fetch = async () => { throw new Error('Network error'); };
    assert.equal((await getEventStatus({ request: request('cricket'), env })).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submission reports a closed event or missing setting without a registration number', async () => {
  const originalFetch = globalThis.fetch;
  const request = () => new Request('https://example.test/api/registrations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...registration(), turnstileToken: 'test-token' })
  });
  try {
    for (const [status, code, message] of [
      [409, 'PT409', /not open now/],
      [503, 'PT503', /temporarily unavailable/]
    ]) {
      globalThis.fetch = async (url) => url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
        ? Response.json({ success: true, hostname: 'example.test', action: 'registration' })
        : Response.json({ code }, { status });
      const result = await onRequestPost({ request: request(), env });
      assert.equal(result.status, status);
      const body = await result.json();
      assert.match(body.error, message);
      assert.equal(Object.hasOwn(body, 'registrationNumber'), false);
    }
    globalThis.fetch = async (url) => url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      ? Response.json({ success: true, hostname: 'example.test', action: 'registration' })
      : Response.json({ code: '23505' }, { status: 409 });
    const conflict = await onRequestPost({ request: request(), env });
    assert.equal(conflict.status, 502);
    assert.match((await conflict.json()).error, /status is unknown/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects missing, invalid and unavailable security checks without writing', async () => {
  const originalFetch = globalThis.fetch;
  const request = (token) => new Request('https://example.test/api/registrations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...registration(), turnstileToken: token })
  });
  try {
    globalThis.fetch = async () => { throw new Error('Unexpected request'); };
    assert.equal((await onRequestPost({ request: request(), env })).status, 400);
    assert.equal((await onRequestPost({ request: request('x'.repeat(2049)), env })).status, 400);
    for (const verification of [
      { success: false },
      { success: true, hostname: 'other.example.test', action: 'registration' },
      { success: true, hostname: 'example.test', action: 'other' }
    ]) {
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
        return Response.json(verification);
      };
      assert.equal((await onRequestPost({ request: request('test-token'), env })).status, 403);
    }
    globalThis.fetch = async () => new Response(null, { status: 500 });
    assert.equal((await onRequestPost({ request: request('test-token'), env })).status, 503);
    globalThis.fetch = async () => { throw new Error('Network error'); };
    assert.equal((await onRequestPost({ request: request('test-token'), env })).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('endpoint returns a number only after successful storage', async () => {
  const originalFetch = globalThis.fetch;
  const request = () => new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ ...registration(), turnstileToken: 'test-token' }) });
  try {
    globalThis.fetch = async (url, options) => {
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
        assert.deepEqual(JSON.parse(options.body), { secret: 'test-turnstile-secret', response: 'test-token', remoteip: '192.0.2.1' });
        return Response.json({ success: true, hostname: 'example.test', action: 'registration' });
      }
      assert.equal(url, 'https://database.example.test/rest/v1/cm_trophy_registrations');
      assert.equal(options.headers.apikey, 'test-secret');
      assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
      const details = JSON.parse(options.body).details;
      assert.equal(details.participants.length, 1);
      assert.equal(Object.hasOwn(details, 'turnstileToken'), false);
      return new Response(null, { status: 201 });
    };
    const success = await onRequestPost({ request: request(), env });
    assert.equal(success.status, 201);
    assert.match((await success.json()).registrationNumber, /^CM-[0-9A-F-]{36}$/);
    globalThis.fetch = async (url) => url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      ? Response.json({ success: true, hostname: 'example.test', action: 'registration' })
      : new Response(null, { status: 500 });
    const failure = await onRequestPost({ request: request(), env });
    assert.equal(failure.status, 502);
    assert.equal(Object.hasOwn(await failure.json(), 'registrationNumber'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
