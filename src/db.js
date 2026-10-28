// The database: one local file (or memory for tests). All queries use "?" placeholders
// so that anything typed into a search box can never be run as SQL.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// "do_not_contact" is here on purpose: it lets us honour opt-outs later.
export const STATUSES = [
  'new',
  'contacted',
  'replied',
  'follow_up',
  'not_interested',
  'do_not_contact',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS prospects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  website       TEXT,
  industry      TEXT,
  city          TEXT,
  province      TEXT,
  source        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(', ')})),
  notes         TEXT NOT NULL DEFAULT '',
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  phone       TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospects_status   ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_industry ON prospects(industry);
CREATE INDEX IF NOT EXISTS idx_prospects_city     ON prospects(city);
CREATE INDEX IF NOT EXISTS idx_prospects_source   ON prospects(source);
CREATE INDEX IF NOT EXISTS idx_contacts_prospect  ON contacts(prospect_id);
`;

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
