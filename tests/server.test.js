import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

let server;
let base;

before(async () => {
  server = createApp(loadConfig({}, '/nonexistent-folder'));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((done) => server.close(done)));

test('health endpoint reports dry-run and exposes no secrets', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.dryRun, true);
  assert.deepEqual(Object.keys(body).sort(), ['app', 'dataMode', 'dryRun', 'status']);
});

test('home page is served with security headers', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await res.text(), /Rene Outreach Hub/);
});

test('blocks attempts to read files outside the public folder', async () => {
  for (const path of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/.env', '/../src/config.js']) {
    const res = await fetch(`${base}${path}`);
    assert.ok([403, 404].includes(res.status), `${path} returned ${res.status}`);
    const text = await res.text();
    assert.ok(!text.includes('rene-outreach-hub'), `${path} leaked file contents`);
  }
});

test('rejects anything other than GET and HEAD', async () => {
  const res = await fetch(`${base}/api/health`, { method: 'POST' });
  assert.equal(res.status, 405);
});

test('unknown api routes return 404 json', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
});
