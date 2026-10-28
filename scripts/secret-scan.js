// Looks through the files Git would upload and fails if anything looks like a
// real key, password or private key. Run it before every push: npm run scan-secrets
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PATTERNS = [
  { name: 'Anthropic API key', regex: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'OpenAI-style API key', regex: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'GitHub token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', regex: /github_pat_[A-Za-z0-9_]{30,}/ },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'Password or secret assigned a value',
    // No leading \b on purpose: it must also catch names like SMTP_PASSWORD or MY_API_KEY.
    regex: /(password|passwd|secret|api[_-]?key|token)[A-Za-z0-9_]*\s*[:=]\s*["']?[^\s"'#<>{}$]{8,}/i,
  },
];

// Files that legitimately mention these words without containing real secrets.
const IGNORE_FILES = new Set(['scripts/secret-scan.js', 'tests/secret-scan.test.js']);

export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    // A line explicitly marked as a placeholder is allowed.
    if (/example|placeholder|your[_-]?key|changeme|<[^>]+>/i.test(line)) return;
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line)) findings.push({ line: index + 1, rule: name });
    }
  });
  return findings;
}

export function listFilesGitWouldUpload(cwd) {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd, encoding: 'utf8' }
  );
  return out.split('\0').filter(Boolean);
}

export function scanRepo(cwd = process.cwd()) {
  const problems = [];
  for (const file of listFilesGitWouldUpload(cwd)) {
    if (IGNORE_FILES.has(file)) continue;
    // A real .env must never be uploaded (the example file is fine).
    if (/(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example')) {
      problems.push({ file, line: 0, rule: 'Environment file would be uploaded' });
      continue;
    }
    const full = resolve(cwd, file);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue; // file listed but deleted
    }
    if (!stat.isFile() || stat.size > 1_000_000) continue;
    const buffer = readFileSync(full);
    if (buffer.includes(0)) continue; // skip binary files
    for (const f of scanText(buffer.toString('utf8'))) {
      problems.push({ file, ...f });
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = scanRepo();
  if (problems.length > 0) {
    console.error('Possible secrets found. Do NOT push until these are removed:');
    for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.rule}`);
    process.exit(1);
  }
  console.log('Secret scan passed: nothing that looks like a key or password was found.');
}
