import { events } from '../../public/register/events.js';

function response(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  const event = new URL(request.url).searchParams.get('event');
  if (!event || !Object.hasOwn(events, event)) return response(400, { error: 'Select an event.' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error('Registration availability is not configured.');
    return response(503, { error: 'Registration availability is temporarily unavailable. Please try again.' });
  }

  let result;
  try {
    const url = new URL(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/cm_trophy_event_settings`);
    url.searchParams.set('select', 'registration_open');
    url.searchParams.set('event', `eq.${event}`);
    const databaseResponse = await fetch(url.toString(), { cache: 'no-store', headers: { apikey: env.SUPABASE_SECRET_KEY } });
    if (!databaseResponse.ok) throw new Error(`Database returned status ${databaseResponse.status}.`);
    result = await databaseResponse.json();
  } catch (error) {
    console.error('Registration availability could not be checked.');
    return response(503, { error: 'Registration availability is temporarily unavailable. Please try again.' });
  }
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.registration_open !== 'boolean') {
    console.error('Registration availability is missing or invalid.');
    return response(503, { error: 'Registration availability is temporarily unavailable. Please try again.' });
  }
  return response(200, { open: result[0].registration_open });
}
