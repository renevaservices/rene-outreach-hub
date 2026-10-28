import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../scripts/secret-scan.js';

test('flags things that look like real keys', () => {
  const fakeAnthropic = 'const k = "' + 'sk-ant-' + 'a'.repeat(30) + '";';
  const fakeGithub = 'token ' + 'ghp_' + 'b'.repeat(36);
  const fakePrivate = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
  const fakePassword = 'SMTP_PASSWORD=' + 'Tr0ub4dor' + '&3xyz';
  for (const sample of [fakeAnthropic, fakeGithub, fakePrivate, fakePassword]) {
    assert.ok(scanText(sample).length > 0, `should flag: ${sample.slice(0, 20)}…`);
  }
});

test('allows placeholders and ordinary text', () => {
  assert.equal(scanText('# ANTHROPIC_API_KEY=').length, 0);
  assert.equal(scanText('ANTHROPIC_API_KEY=your_key_here').length, 0);
  assert.equal(scanText('Add your password in the .env file').length, 0);
  assert.equal(scanText('const total = items.length;').length, 0);
});
