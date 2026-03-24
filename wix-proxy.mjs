// Tiny proxy: receives Wix Automation POST, adds x-tenant-id header, forwards to API
import http from 'http';

const API_PORT = 3000;
const PROXY_PORT = 3001;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PROXY_PORT}`);
  const tenantId = url.searchParams.get('tenantId') ?? '';

  // Health check / URL validation (GET)
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'kassomat-wix-proxy' }));
    return;
  }

  if (!tenantId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing tenantId query param' }));
    return;
  }

  // Collect body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Forward to real API with tenant header
  const options = {
    hostname: 'localhost',
    port: API_PORT,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
      'x-tenant-id': tenantId,
    },
  };

  const proxy = http.request(options, (apiRes) => {
    res.writeHead(apiRes.statusCode, apiRes.headers);
    apiRes.pipe(res);
  });

  proxy.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API unreachable', detail: err.message }));
  });

  proxy.write(body);
  proxy.end();
});

server.listen(PROXY_PORT, () => {
  console.log(`Wix proxy running on port ${PROXY_PORT}`);
});
