import { sanitizedRegistration } from '../../public/register/validation.js';

function response(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return response(403, { error: 'Invalid request origin.' });
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'Expected a JSON request.' });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) {
    console.error('Registration storage or verification is not configured.');
    return response(503, { error: 'Registration is not available yet. Please try again later.' });
  }

  if (Number(request.headers.get('Content-Length')) > 100000) return response(413, { error: 'Registration data is too large.' });
  if (!request.body) return response(400, { error: 'Invalid registration data.' });
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100000) {
        await reader.cancel();
        return response(413, { error: 'Registration data is too large.' });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    console.error('Registration request body could not be read.');
    return response(400, { error: 'Invalid registration data.' });
  }
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return response(400, { error: 'Invalid registration data.' });
  }
  const result = sanitizedRegistration(input);
  if (result.error) return response(400, { error: result.error });

  if (typeof input.turnstileToken !== 'string' || input.turnstileToken.length === 0 || input.turnstileToken.length > 2048) {
    return response(400, { error: 'Please complete the security check.' });
  }
  let verification;
  try {
    const verificationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: input.turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined
      })
    });
    if (!verificationResponse.ok) {
      console.error(`Registration verification returned status ${verificationResponse.status}.`);
      return response(503, { error: 'The security check is temporarily unavailable. Please try again.' });
    }
    verification = await verificationResponse.json();
  } catch (error) {
    console.error('Registration verification could not be completed.');
    return response(503, { error: 'The security check is temporarily unavailable. Please try again.' });
  }
  if (verification?.success !== true || verification.hostname !== new URL(request.url).hostname || verification.action !== 'registration') {
    return response(403, { error: 'Security check failed. Please try again.' });
  }

  const number = `CM-${crypto.randomUUID().toUpperCase()}`;
  let databaseResponse;
  try {
    databaseResponse = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/cm_trophy_registrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SECRET_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ registration_number: number, category: result.data.category, event: result.data.event, details: result.data })
    });
  } catch (error) {
    console.error('Registration database request failed.');
    return response(502, { error: 'The submission status is unknown. Please contact the organisers before trying again.' });
  }
  if (!databaseResponse.ok) {
    console.error(`Registration database returned status ${databaseResponse.status}.`);
    return response(502, { error: 'The submission status is unknown. Please contact the organisers before trying again.' });
  }
  return response(201, { registrationNumber: number });
}
