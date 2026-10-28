// Front-end code. It runs in the browser, so it must never contain keys or passwords.
const badge = document.getElementById('mode-badge');

async function showSafetyMode() {
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    if (health.dryRun) {
      badge.textContent = 'Dry-run: no emails sent';
      badge.className = 'badge badge-safe';
    } else {
      badge.textContent = 'LIVE SENDING ON';
      badge.className = 'badge badge-warn';
    }
  } catch {
    badge.textContent = 'Server not reachable';
    badge.className = 'badge badge-warn';
  }
}

showSafetyMode();
