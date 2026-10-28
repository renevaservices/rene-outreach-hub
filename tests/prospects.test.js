import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { seedSampleData } from '../src/seed.js';
import { listProspects, listFilterOptions, parseListParams, ValidationError } from '../src/prospects.js';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

let db;
let server;
let base;

const params = (query = '') => parseListParams(new URLSearchParams(query));

before(async () => {
  db = openDatabase(':memory:');
  seedSampleData(db);
  server = createApp(loadConfig({}, '/nonexistent-folder'), db);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((done) => server.close(done)));

test('seeding adds 24 sample businesses once, and only once', () => {
  assert.equal(listProspects(db, params('pageSize=50')).total, 24);
  assert.equal(seedSampleData(db), 0, 'second seed should add nothing');
  assert.equal(listProspects(db, params('pageSize=50')).total, 24);
});

test('every sample record is fictional: .example addresses and fake phone numbers', () => {
  const sites = db.prepare('SELECT website FROM prospects').all();
  const contacts = db.prepare('SELECT email, phone FROM contacts').all();
  assert.equal(sites.length, 24);
  for (const { website } of sites) assert.match(website, /^https:\/\/[a-z0-9-]+\.example$/);
  for (const { email, phone } of contacts) {
    assert.match(email, /@[a-z0-9-]+\.example$/);
    assert.match(phone, /^\+27 00 000 \d{4}$/);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prospects WHERE is_sample = 0').get().n, 0);
});

test('pagination splits results and reports totals', () => {
  const first = listProspects(db, params('pageSize=10&page=1'));
  const third = listProspects(db, params('pageSize=10&page=3'));
  assert.equal(first.items.length, 10);
  assert.equal(first.totalPages, 3);
  assert.equal(third.items.length, 4);
  const ids = new Set([...first.items, ...third.items].map((i) => i.id));
  assert.equal(ids.size, 14, 'pages should not overlap');
});

test('search matches business name, contact name and industry (case-insensitive)', () => {
  assert.deepEqual(listProspects(db, params('q=bluegum')).items.map((i) => i.business_name), ['Bluegum Dental Studio']);
  assert.equal(listProspects(db, params('q=THANDI')).total, 1);
  assert.equal(listProspects(db, params('q=accounting')).total, 2);
});

test('filters narrow results and can be combined', () => {
  const gauteng = listProspects(db, params('city=Pretoria'));
  assert.ok(gauteng.total > 0);
  assert.ok(gauteng.items.every((i) => i.city === 'Pretoria'));

  const combined = listProspects(db, params('city=Pretoria&status=new'));
  assert.ok(combined.total > 0 && combined.total < gauteng.total);
  assert.ok(combined.items.every((i) => i.city === 'Pretoria' && i.status === 'new'));

  assert.equal(listProspects(db, params('status=do_not_contact')).total, 1);
  assert.equal(listProspects(db, params('industry=Health&source=Manual%20entry')).total, 2);
});

test('search and filter together', () => {
  const result = listProspects(db, params('q=pharmacy&status=contacted'));
  assert.deepEqual(result.items.map((i) => i.business_name), ['Orchard Road Pharmacy']);
  assert.equal(listProspects(db, params('q=pharmacy&status=new')).total, 0);
});

test('sorting works', () => {
  const byName = listProspects(db, params('sort=name&pageSize=50')).items.map((i) => i.business_name);
  const sorted = [...byName].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(byName, sorted);
  const newest = listProspects(db, params('sort=newest&pageSize=3')).items.map((i) => i.id);
  assert.deepEqual(newest, [24, 23, 22]);
});

test('% and _ are searched literally, not as wildcards', () => {
  assert.equal(listProspects(db, params('q=%25')).total, 0);
  assert.equal(listProspects(db, params('q=_')).total, 0);
});

test('SQL injection text is treated as plain text and the data survives', () => {
  const evil = encodeURIComponent("'; DROP TABLE prospects; --");
  assert.equal(listProspects(db, params(`q=${evil}`)).total, 0);
  assert.equal(listProspects(db, params('pageSize=50')).total, 24);
  const evilFilter = encodeURIComponent("new' OR '1'='1");
  assert.equal(listProspects(db, params(`city=${evilFilter}`)).total, 0);
});

test('bad inputs are rejected with a clear error', () => {
  for (const bad of ['status=hacked', 'sort=password', 'page=0', 'page=abc', 'pageSize=500', 'pageSize=0']) {
    assert.throws(() => params(bad), ValidationError, bad);
  }
});

test('filter options list real values from the data', () => {
  const options = listFilterOptions(db);
  assert.ok(options.cities.includes('Pretoria'));
  assert.ok(options.industries.includes('Dental'));
  assert.ok(options.sources.includes('Referral'));
  assert.equal(options.statuses.length, 6);
});

test('API: list, filter, and error responses', async () => {
  const list = await (await fetch(`${base}/api/prospects?q=bluegum`)).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].contact_name, 'Thandi Mokoena');

  const bad = await fetch(`${base}/api/prospects?status=hacked`);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /status/i);

  const filters = await (await fetch(`${base}/api/prospects/filters`)).json();
  assert.ok(filters.cities.length >= 5);
});

test('API: a database error never leaks details to the browser', async () => {
  const brokenDb = openDatabase(':memory:');
  brokenDb.exec('DROP TABLE contacts');
  const brokenServer = createApp(loadConfig({}, '/nonexistent-folder'), brokenDb);
  await new Promise((done) => brokenServer.listen(0, '127.0.0.1', done));
  try {
    const res = await fetch(`http://127.0.0.1:${brokenServer.address().port}/api/prospects`);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!/contacts|SQL|no such table/i.test(text), `leaked: ${text}`);
  } finally {
    await new Promise((done) => brokenServer.close(done));
  }
});

test('seed --reset replaces only sample rows and keeps rows you added yourself', () => {
  const own = openDatabase(':memory:');
  seedSampleData(own);
  const { lastInsertRowid } = own
    .prepare("INSERT INTO prospects (business_name, source, is_sample) VALUES ('My Real Client', 'Manual entry', 0)")
    .run();
  own.prepare("INSERT INTO contacts (prospect_id, full_name, is_primary) VALUES (?, 'Real Person', 1)").run(lastInsertRowid);

  assert.equal(seedSampleData(own, { force: true }), 24);

  const names = own.prepare('SELECT business_name FROM prospects').all().map((r) => r.business_name);
  assert.equal(names.length, 25, 'sample rows rebuilt (not doubled) and own row kept');
  assert.ok(names.includes('My Real Client'));
  assert.equal(own.prepare("SELECT COUNT(*) AS n FROM contacts WHERE full_name = 'Real Person'").get().n, 1);
  assert.equal(own.prepare('SELECT COUNT(*) AS n FROM contacts').get().n, 25, 'no orphaned or duplicate contacts');
});
