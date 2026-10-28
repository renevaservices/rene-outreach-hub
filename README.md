# Rene Outreach Hub

A small web app for Rene VA Services to manage business outreach: a prospect
directory, contact records, AI-assisted message drafts, an approve-before-send
step and a follow-up tracker.

**Current status: Stage 1 (project skeleton).** It uses sample data only.
It cannot send emails and it holds no real prospect data.

## Safety rules built in

- **Dry-run mode is always on.** The app refuses to start with any other
  `SEND_MODE`. Real sending does not exist yet and needs your explicit approval.
- **Secrets stay on the server.** API keys and email passwords go in a `.env`
  file that is blocked from GitHub by `.gitignore`. The browser code never sees them.
- **Secret scan.** `npm run scan-secrets` checks every file Git would upload and
  fails if something looks like a key or password. Run it before every push.
- **Keep this repository private.** Real prospect data must never be committed.

## What you need

- [Node.js](https://nodejs.org) version 22.13 or newer (check with `node --version`).
- No other downloads. This version uses only what comes with Node, so
  there is no `npm install` step.

Node labels its built-in database "experimental". It works, but this is one
reason we may move to a hosted database (Supabase) later.

## Run it on your computer

1. Download or clone this repository and open a terminal in its folder.
2. Copy the settings template: `cp .env.example .env` (Windows: `copy .env.example .env`).
3. Start the app: `npm start`
4. Open <http://127.0.0.1:3000> in your browser.
   You should see a green "Dry-run: no emails sent" badge.

Stop it with `Ctrl + C`.

## Check that it works

```
npm test              # runs the automated tests
npm run scan-secrets  # checks nothing secret is about to be uploaded
```

## Project map

| Folder / file | What it is |
|---|---|
| `src/server.js` | The backend web server |
| `src/config.js` | Reads settings and enforces dry-run mode |
| `public/` | The pages you see in the browser (HTML, CSS, JS) |
| `scripts/secret-scan.js` | The secret scanner |
| `tests/` | Automated tests |
| `.env.example` | Template for your private settings |

## Build plan

1. Skeleton, safety switch, secret scan (this stage)
2. Sample database and prospect directory with search and filters
3. Contact records
4. Dashboard
5. AI drafting (mock first, real AI only after approval)
6. Review-and-approve step (still dry-run)
7. Follow-up tracker and reminders
8. Mobile polish, full testing, deployment guide
