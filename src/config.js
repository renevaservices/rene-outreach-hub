// Reads settings from the environment and an optional local ".env" file.
// Secrets only ever live on the server. Nothing here is sent to the browser.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadConfig(env = process.env, root = process.cwd()) {
  let fileValues = {};
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) {
    fileValues = parseEnvFile(readFileSync(envPath, 'utf8'));
  }
  const get = (key, fallback) => env[key] ?? fileValues[key] ?? fallback;

  // Safety: anything other than the exact word "dry-run" is rejected, so a typo
  // can never accidentally switch on real sending. Real sending is not built yet.
  const sendMode = get('SEND_MODE', 'dry-run');
  if (sendMode !== 'dry-run') {
    throw new Error(
      'SEND_MODE must be "dry-run". Real email sending is not available until it is built and you approve it.'
    );
  }

  const port = Number(get('PORT', '3000'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a whole number between 1 and 65535.');
  }

  return {
    host: get('HOST', '127.0.0.1'),
    port,
    sendMode,
    dryRun: true,
    databasePath: resolve(root, get('DATABASE_PATH', 'data/outreach.db')),
  };
}
