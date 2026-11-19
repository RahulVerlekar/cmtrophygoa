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

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return response(403, { error: 'Invalid request origin.' });
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'Expected a JSON request.' });
  }
  if (!request.body) return response(400, { error: 'Invalid analytics event.' });
  if (Number(request.headers.get('Content-Length')) > 1024) return response(413, { error: 'Analytics event is too large.' });

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
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

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return response(400, { error: 'Invalid analytics event.' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some((key) => key !== 'outcome' && key !== 'code') ||
      !['success', 'failure', 'setup_failure'].includes(data.outcome) ||
      (data.outcome === 'failure'
        ? typeof data.code !== 'string' || !/^(?:\d{6}|unknown)$/.test(data.code)
        : Object.hasOwn(data, 'code'))) {
    return response(400, { error: 'Invalid analytics event.' });
  }
  if (!env.VERIFICATION_ANALYTICS) {
    console.error('Verification analytics is not configured.');
    return response(503, { error: 'Verification analytics is unavailable.' });
  }

  const details = browserDetails(request.headers.get('User-Agent') || '');
  try {
    env.VERIFICATION_ANALYTICS.writeDataPoint({
      indexes: [data.outcome],
      blobs: [data.outcome, data.outcome === 'failure' ? data.code : '', ...details]
    });
  } catch (error) {
    console.error('Verification analytics could not be recorded.');
    return response(503, { error: 'Verification analytics is unavailable.' });
  }
  return response(202, { accepted: true });
}
