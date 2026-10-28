// Front-end code. It runs in the browser, so it must never contain keys or passwords.
import { renderProspects } from '/views/prospects.js';

const badge = document.getElementById('mode-badge');
const main = document.getElementById('main');
const navLinks = [...document.querySelectorAll('.nav a')];

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

function comingSoon(title, stage) {
  const card = document.createElement('section');
  card.className = 'card';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = `This page is coming in ${stage}.`;
  card.append(heading, text);
  main.replaceChildren(card);
}

const routes = {
  dashboard: () => comingSoon('Dashboard', 'Stage 4'),
  prospects: () => renderProspects(main),
  drafts: () => comingSoon('Drafts', 'Stage 5 and 6'),
  followups: () => comingSoon('Follow-ups', 'Stage 7'),
};

function route() {
  const name = location.hash.replace('#', '') || 'prospects';
  const view = routes[name] ?? routes.prospects;
  for (const link of navLinks) {
    const active = link.getAttribute('href') === `#${name}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  view();
}

window.addEventListener('hashchange', route);
showSafetyMode();
route();
