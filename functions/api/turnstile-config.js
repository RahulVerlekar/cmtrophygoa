export function onRequestGet({ env }) {
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) {
    console.error('Registration verification is not configured.');
    return new Response(JSON.stringify({ error: 'Registration verification is not available yet.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
  return new Response(JSON.stringify({ siteKey: env.TURNSTILE_SITE_KEY }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
