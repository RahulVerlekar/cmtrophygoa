function response(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function browserDetails(userAgent) {
  const browserPatterns = [
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Edge', /(?:EdgA|EdgiOS|Edg)\/(\d+)/],
    ['Opera', /(?:OPR|OPT)\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/]
  ];
  const osPatterns = [
    ['Android', /Android (\d+)/],
    ['iOS', /(?:iPhone|iPad|iPod).*OS (\d+)[_.]/],
    ['Windows', /Windows NT (\d+)/],
    ['macOS', /Mac OS X (\d+)[_.]/],
    ['Linux', /Linux/]
  ];
  const match = (patterns) => {
    for (const [name, pattern] of patterns) {
      const result = userAgent.match(pattern);
      if (result) return [name, result[1] || 'unknown'];
    }
    return ['unknown', 'unknown'];
  };
  return [...match(browserPatterns), ...match(osPatterns)];
}

async function readEvent(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return response(403, { error: 'Invalid request origin.' });
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'Expected a JSON request.' });
  }
  if (!request.body) return response(400, { error: 'Invalid analytics event.' });
  if (Number(request.headers.get('Content-Length')) > 2048) return response(413, { error: 'Analytics event is too large.' });

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        return response(413, { error: 'Analytics event is too large.' });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    console.error('Verification analytics request body could not be read.');
    return response(400, { error: 'Invalid analytics event.' });
  }

  try {
    return { data: JSON.parse(text) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return response(400, { error: 'Invalid analytics event.' });
  }
}

export async function onRequestPost({ request, env }) {
  const parsed = await readEvent(request);
  if (parsed instanceof Response) return parsed;
  const { data } = parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some((key) => !['outcome', 'code', 'name', 'phone', 'device'].includes(key)) ||
      !['success', 'failure', 'setup_failure'].includes(data.outcome) ||
      (data.outcome === 'failure'
        ? typeof data.code !== 'string' || !/^(?:\d{6}|unknown)$/.test(data.code)
        : Object.hasOwn(data, 'code')) ||
      ((Object.hasOwn(data, 'name') || Object.hasOwn(data, 'phone')) &&
        (data.outcome === 'success' ||
          typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100 ||
          data.name.includes('\0') ||
          typeof data.phone !== 'string' ||
          (data.phone !== '' && (!/^\+?[0-9 ()-]{7,20}$/.test(data.phone) ||
            data.phone.replace(/\D/g, '').length < 7 || data.phone.replace(/\D/g, '').length > 15)))) ||
      (Object.hasOwn(data, 'device') &&
        (data.outcome === 'success' || !data.device || typeof data.device !== 'object' ||
          Array.isArray(data.device) ||
          Object.keys(data.device).some((key) => !['screen', 'language', 'timezone', 'connection'].includes(key)) ||
          typeof data.device.screen !== 'string' || !/^(?:\d{1,5}x\d{1,5})?$/.test(data.device.screen) ||
          typeof data.device.language !== 'string' || !/^[A-Za-z0-9-]{0,64}$/.test(data.device.language) ||
          typeof data.device.timezone !== 'string' || !/^[A-Za-z0-9_+/-]{0,64}$/.test(data.device.timezone) ||
          !['', 'slow-2g', '2g', '3g', '4g'].includes(data.device.connection)))) {
    return response(400, { error: 'Invalid analytics event.' });
  }
  if (!env.VERIFICATION_ANALYTICS) {
    console.error('Verification analytics is not configured.');
    return response(503, { error: 'Verification analytics is unavailable.' });
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const details = browserDetails(userAgent);
  try {
    const blobs = [data.outcome, data.outcome === 'failure' ? data.code : '', ...details];
    if (data.outcome !== 'success') {
      const device = data.device;
      blobs.push(data.name?.trim() || '', data.phone || '', userAgent.slice(0, 1024),
        device?.screen || '', device?.language || '', device?.timezone || '', device?.connection || '');
    }
    env.VERIFICATION_ANALYTICS.writeDataPoint({
      indexes: [data.outcome],
      blobs
    });
  } catch (error) {
    console.error('Verification analytics could not be recorded.');
    return response(503, { error: 'Verification analytics is unavailable.' });
  }
  return response(202, { accepted: true });
}
