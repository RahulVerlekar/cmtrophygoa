import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/verification-analytics.js';

function request(body, options = {}) {
  return new Request('https://example.test/api/verification-analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('records failure contact and coarse browser details', async () => {
  let point;
  const env = { VERIFICATION_ANALYTICS: { writeDataPoint: (value) => { point = value; } } };
  const result = await onRequestPost({
    request: request({ outcome: 'failure', code: '300010', name: ' Example User ', phone: '9999999999' }, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12; private-device) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36' }
    }),
    env
  });
  assert.equal(result.status, 202);
  assert.deepEqual(point, {
    indexes: ['failure'],
    blobs: ['failure', '300010', 'Chrome', '110', 'Android', '12', 'Example User', '9999999999']
  });
  assert.ok(!JSON.stringify(point).includes('private-device'));
});

test('records setup failure with an optional phone and accepts older clients without contact fields', async () => {
  const points = [];
  const env = { VERIFICATION_ANALYTICS: { writeDataPoint: (value) => points.push(value) } };
  assert.equal((await onRequestPost({
    request: request({ outcome: 'setup_failure', name: 'Example', phone: '' }), env
  })).status, 202);
  assert.deepEqual(points[0].blobs.slice(6), ['Example', '']);
  assert.equal((await onRequestPost({
    request: request({ outcome: 'failure', code: 'unknown' }), env
  })).status, 202);
  assert.equal(points[1].blobs.length, 6);
});

test('records success and setup failures without an error code', async () => {
  const points = [];
  const env = { VERIFICATION_ANALYTICS: { writeDataPoint: (value) => points.push(value) } };
  for (const outcome of ['success', 'setup_failure']) {
    const result = await onRequestPost({ request: request({ outcome }), env });
    assert.equal(result.status, 202);
  }
  assert.deepEqual(points.map((point) => point.blobs.slice(0, 2)), [['success', ''], ['setup_failure', '']]);
});

test('rejects invalid events, extra fields, cross-origin and oversized bodies', async () => {
  let writes = 0;
  const env = { VERIFICATION_ANALYTICS: { writeDataPoint: () => { writes++; } } };
  for (const body of [
    { outcome: 'failure', code: '300010', name: 'Private' },
    { outcome: 'failure', code: '300010', name: 'Private', phone: '', email: 'private@example.test' },
    { outcome: 'failure', code: '300010', name: 'Private\0Name', phone: '' },
    { outcome: 'failure', code: '300010', name: 'x'.repeat(101), phone: '' },
    { outcome: 'failure', code: '300010', name: 'Private', phone: 'invalid' },
    { outcome: 'success', name: 'Private', phone: '' },
    { outcome: 'failure', code: 'not-an-error-code' },
    { outcome: 'success', code: '300010' },
    { outcome: 'other' },
    '{"outcome":'
  ]) {
    assert.equal((await onRequestPost({ request: request(body), env })).status, 400);
  }
  assert.equal((await onRequestPost({
    request: request({ outcome: 'success' }, { headers: { Origin: 'https://other.example' } }), env
  })).status, 403);
  assert.equal((await onRequestPost({ request: request('x'.repeat(1025)), env })).status, 413);
  assert.equal(writes, 0);
});

test('reports missing bindings and Analytics Engine errors', async () => {
  const originalError = console.error;
  try {
    console.error = () => {};
    assert.equal((await onRequestPost({ request: request({ outcome: 'success' }), env: {} })).status, 503);
    const env = { VERIFICATION_ANALYTICS: { writeDataPoint: () => { throw new Error('test'); } } };
    assert.equal((await onRequestPost({ request: request({ outcome: 'success' }), env })).status, 503);
  } finally {
    console.error = originalError;
  }
});
