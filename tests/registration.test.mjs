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

test('validates individual selections and required participant fields', () => {
  assert.equal(validateRegistration(registration(), '2026-11-16'), null);
  assert.match(validateRegistration(registration({ eventOption: '' }), '2026-11-16'), /distance/);
  assert.match(validateRegistration(registration({ participants: [{ ...adult, gender: '' }] }), '2026-11-16'), /gender/);
  assert.match(validateRegistration(registration({ consent: false }), '2026-11-16'), /Confirm/);
  assert.match(validateRegistration(registration({ participants: [{ ...adult, dateOfBirth: '2024-02-31' }] }), '2026-11-16'), /date of birth/);
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
});

test('derives badminton age category from date of birth', () => {
  const data = registration({ event: 'badminton', participants: [{ ...adult, dateOfBirth: '1990-01-01' }] });
  assert.equal(sanitizedRegistration(data, '2026-11-16').data.participants[0].ageCategory, '31–50');
});

test('endpoint fails closed when storage is unconfigured or input is invalid', async () => {
  const request = (body) => new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await onRequestPost({ request: request(registration()), env: {} })).status, 503);
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'test-secret' };
  assert.equal((await onRequestPost({ request: request(registration({ consent: false })), env })).status, 400);
  const oversized = new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(100001) });
  assert.equal((await onRequestPost({ request: oversized, env })).status, 413);
});

test('endpoint returns a number only after successful storage', async () => {
  const originalFetch = globalThis.fetch;
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'test-secret' };
  const request = () => new Request('https://example.test/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registration()) });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://example.test/rest/v1/cm_trophy_registrations');
      assert.equal(options.headers.apikey, 'test-secret');
      assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
      assert.equal(JSON.parse(options.body).details.participants.length, 1);
      return new Response(null, { status: 201 });
    };
    const success = await onRequestPost({ request: request(), env });
    assert.equal(success.status, 201);
    assert.match((await success.json()).registrationNumber, /^CM-[0-9A-F-]{36}$/);
    globalThis.fetch = async () => new Response(null, { status: 500 });
    const failure = await onRequestPost({ request: request(), env });
    assert.equal(failure.status, 502);
    assert.equal(Object.hasOwn(await failure.json(), 'registrationNumber'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
