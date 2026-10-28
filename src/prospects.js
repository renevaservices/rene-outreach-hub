import { STATUSES } from './db.js';

const SORTS = {
  name: 'p.business_name COLLATE NOCASE ASC',
  city: 'p.city COLLATE NOCASE ASC, p.business_name COLLATE NOCASE ASC',
  status: 'p.status ASC, p.business_name COLLATE NOCASE ASC',
  newest: 'p.id DESC',
};

export class ValidationError extends Error {}

const MAX_TEXT = 100;

function cleanText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

// Makes "%" and "_" mean themselves in a LIKE search instead of acting as wildcards.
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function parseListParams(searchParams) {
  const q = cleanText(searchParams.get('q'));
  const status = cleanText(searchParams.get('status'));
  const industry = cleanText(searchParams.get('industry'));
  const city = cleanText(searchParams.get('city'));
  const source = cleanText(searchParams.get('source'));
  const sort = cleanText(searchParams.get('sort')) || 'name';

  if (status && !STATUSES.includes(status)) throw new ValidationError('Unknown status.');
  if (!(sort in SORTS)) throw new ValidationError('Unknown sort option.');

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');
  if (!Number.isInteger(page) || page < 1) throw new ValidationError('Page must be 1 or more.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ValidationError('Page size must be between 1 and 50.');
  }
  return { q, status, industry, city, source, sort, page, pageSize };
}

export function listProspects(db, params) {
  const where = [];
  const values = [];

  if (params.q) {
    const pattern = likePattern(params.q);
    where.push(`(
      p.business_name LIKE ? ESCAPE '\\' OR p.website LIKE ? ESCAPE '\\' OR
      p.industry LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\' OR p.notes LIKE ? ESCAPE '\\' OR
      c.full_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\'
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  for (const column of ['status', 'industry', 'city', 'source']) {
    if (params[column]) {
      where.push(`p.${column} = ?`);
      values.push(params[column]);
    }
  }

  const from = `FROM prospects p
    LEFT JOIN contacts c ON c.prospect_id = p.id AND c.is_primary = 1
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;

  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...values);
  const items = db
    .prepare(
      `SELECT p.id, p.business_name, p.website, p.industry, p.city, p.province, p.source, p.status,
              c.full_name AS contact_name, c.email AS contact_email
       ${from}
       ORDER BY ${SORTS[params.sort]}
       LIMIT ? OFFSET ?`
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  return {
    items: items.map((row) => ({ ...row })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export function listFilterOptions(db) {
  const distinct = (column) =>
    db
      .prepare(`SELECT DISTINCT ${column} AS value FROM prospects WHERE ${column} IS NOT NULL AND ${column} <> '' ORDER BY ${column} COLLATE NOCASE`)
      .all()
      .map((row) => row.value);
  return {
    statuses: STATUSES,
    industries: distinct('industry'),
    cities: distinct('city'),
    sources: distinct('source'),
  };
}
