import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../public', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad request' });
  }
  if (relative === '/') relative = '/index.html';
  if (relative.includes('\0')) return sendJson(res, 400, { error: 'Bad request' });

  // Block "../" tricks: the final path must stay inside the public folder.
  const filePath = resolve(PUBLIC_DIR, '.' + relative);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }
  const type = MIME_TYPES[extname(filePath).toLowerCase()];
  if (!type) return sendJson(res, 404, { error: 'Not found' });

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

export function createApp(config) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    if (pathname === '/api/health') {
      // Reports only safe facts. Never include keys, paths or credentials here.
      return sendJson(res, 200, {
        status: 'ok',
        app: 'Rene Outreach Hub',
        dryRun: config.dryRun,
        dataMode: 'sample-data-only',
      });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    return serveStatic(req, res, pathname);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const server = createApp(config);
  server.listen(config.port, config.host, () => {
    console.log(`Rene Outreach Hub running at http://${config.host}:${config.port}`);
    console.log('Dry-run mode is ON: no real emails can be sent.');
  });
}
