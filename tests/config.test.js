import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseEnvFile } from '../src/config.js';

test('defaults to dry-run mode on a safe local address', () => {
  const config = loadConfig({}, '/nonexistent-folder');
  assert.equal(config.dryRun, true);
  assert.equal(config.sendMode, 'dry-run');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
});

test('refuses any SEND_MODE other than dry-run', () => {
  assert.throws(() => loadConfig({ SEND_MODE: 'live' }, '/nonexistent-folder'), /dry-run/);
  assert.throws(() => loadConfig({ SEND_MODE: 'DRY-RUN ' }, '/nonexistent-folder'), /dry-run/);
  assert.throws(() => loadConfig({ SEND_MODE: '' }, '/nonexistent-folder'), /dry-run/);
});

test('rejects an invalid port', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }, '/nonexistent-folder'), /PORT/);
  assert.throws(() => loadConfig({ PORT: '70000' }, '/nonexistent-folder'), /PORT/);
});

test('parses .env text, ignoring comments and blank lines', () => {
  const parsed = parseEnvFile('# comment\n\nPORT=4000\nNAME="quoted value"\n');
  assert.deepEqual(parsed, { PORT: '4000', NAME: 'quoted value' });
});
