// Prospect directory page. Data is added with textContent only (never innerHTML),
// so text from the database can never run as code in the browser.

const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  follow_up: 'Follow-up due',
  not_interested: 'Not interested',
  do_not_contact: 'Do not contact',
};

const SORT_LABELS = { name: 'Name (A–Z)', city: 'City', status: 'Status', newest: 'Newest first' };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function selectField(id, label, options, labelFor = (v) => v) {
  const select = el('select', { id, name: id });
  select.append(el('option', { value: '', text: `All` }));
  for (const value of options) select.append(el('option', { value, text: labelFor(value) }));
  return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
}

function safeLink(url) {
  // Only show a link for plain http(s) addresses.
  return /^https?:\/\//i.test(url) ? url : null;
}

export async function renderProspects(container) {
  container.replaceChildren(el('p', { class: 'note', text: 'Loading prospects…', role: 'status' }));

  let options;
  try {
    options = await (await fetch('/api/prospects/filters')).json();
  } catch {
    container.replaceChildren(el('div', { class: 'card error', role: 'alert', text: 'Could not load the prospect list. Is the server running?' }));
    return;
  }

  const state = { q: '', status: '', industry: '', city: '', source: '', sort: 'name', page: 1 };

  const search = el('input', { id: 'q', name: 'q', type: 'search', placeholder: 'Business, contact, industry or city', autocomplete: 'off', maxlength: '100' });
  const sort = selectField('sort', 'Sort by', Object.keys(SORT_LABELS), (v) => SORT_LABELS[v]);
  sort.querySelector('option[value=""]').remove();
  const filters = {
    status: selectField('status', 'Status', options.statuses, (v) => STATUS_LABELS[v] ?? v),
    industry: selectField('industry', 'Industry', options.industries),
    city: selectField('city', 'City', options.cities),
    source: selectField('source', 'Source', options.sources),
  };
  const clear = el('button', { type: 'button', class: 'button secondary', text: 'Clear filters' });

  // On phones the filters sit in a collapsible panel so results are visible without scrolling.
  const panelSummary = el('summary', { text: 'Filters & sort' });
  const panel = el(
    'details',
    { class: 'filter-panel' },
    panelSummary,
    el('div', { class: 'filter-grid' }, filters.status, filters.industry, filters.city, filters.source, sort, clear)
  );
  panel.open = window.matchMedia('(min-width: 720px)').matches;

  const form = el(
    'form',
    { class: 'card filters', role: 'search', 'aria-label': 'Search and filter prospects' },
    el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
    panel
  );
  form.addEventListener('submit', (event) => event.preventDefault());

  const summary = el('p', { class: 'summary', role: 'status', 'aria-live': 'polite' });
  const results = el('div', { class: 'results' });
  const pager = el('nav', { class: 'pager', 'aria-label': 'Pagination' });

  container.replaceChildren(el('h1', { text: 'Prospects' }), form, summary, results, pager);

  let requestId = 0;
  async function load() {
    const thisRequest = ++requestId;
    const query = new URLSearchParams({ sort: state.sort, page: String(state.page), pageSize: '10' });
    for (const key of ['q', 'status', 'industry', 'city', 'source']) if (state[key]) query.set(key, state[key]);
    try {
      const response = await fetch(`/api/prospects?${query}`);
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      if (thisRequest !== requestId) return; // a newer search has replaced this one
      draw(data);
    } catch {
      if (thisRequest !== requestId) return;
      summary.textContent = '';
      results.replaceChildren(el('div', { class: 'card error', role: 'alert', text: 'Something went wrong loading prospects. Please try again.' }));
      pager.replaceChildren();
    }
  }

  function statusBadge(status) {
    return el('span', { class: `status status-${status}`, text: STATUS_LABELS[status] ?? status });
  }

  function cell(label, content) {
    const td = el('td', { 'data-label': label });
    td.append(content ?? '—');
    return td;
  }

  function draw(data) {
    const filtered = state.q || state.status || state.industry || state.city || state.source;
    const active = ['status', 'industry', 'city', 'source'].filter((key) => state[key]).length;
    panelSummary.textContent = active ? `Filters & sort (${active} active)` : 'Filters & sort';
    summary.textContent = data.total === 0
      ? 'No prospects found.'
      : `Showing ${data.items.length} of ${data.total} prospect${data.total === 1 ? '' : 's'}${filtered ? ' (filtered)' : ''}.`;

    if (data.total === 0) {
      results.replaceChildren(
        el('div', { class: 'card empty' },
          el('p', { text: filtered ? 'Nothing matches your search or filters.' : 'No prospects yet.' }),
          filtered ? clearButton() : null)
      );
      pager.replaceChildren();
      return;
    }

    const table = el('table', { class: 'prospects-table' });
    table.append(el('caption', { class: 'visually-hidden', text: 'Prospects' }));
    table.append(
      el('thead', {}, el('tr', {}, ...['Business', 'Contact', 'Industry', 'City', 'Source', 'Status'].map((h) => el('th', { scope: 'col', text: h }))))
    );
    const body = el('tbody');
    for (const row of data.items) {
      const name = el('td', { 'data-label': 'Business', class: 'cell-name' });
      name.append(el('strong', { text: row.business_name }));
      const href = row.website && safeLink(row.website);
      if (href) name.append(el('br'), el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'site', text: row.website.replace(/^https?:\/\//, '') }));
      const contact = row.contact_name
        ? el('span', {}, row.contact_name, el('br'), el('span', { class: 'muted', text: row.contact_email ?? '' }))
        : null;
      body.append(
        el('tr', {}, name, cell('Contact', contact), cell('Industry', row.industry),
          cell('City', row.city), cell('Source', row.source), cell('Status', statusBadge(row.status)))
      );
    }
    table.append(body);
    results.replaceChildren(table);

    const prev = el('button', { type: 'button', class: 'button secondary', text: 'Previous' });
    const next = el('button', { type: 'button', class: 'button secondary', text: 'Next' });
    if (data.page <= 1) prev.disabled = true;
    if (data.page >= data.totalPages) next.disabled = true;
    prev.addEventListener('click', () => { state.page -= 1; load(); });
    next.addEventListener('click', () => { state.page += 1; load(); });
    pager.replaceChildren(prev, el('span', { text: `Page ${data.page} of ${data.totalPages}` }), next);
  }

  function resetFilters() {
    Object.assign(state, { q: '', status: '', industry: '', city: '', source: '', page: 1 });
    search.value = '';
    for (const key of Object.keys(filters)) filters[key].querySelector('select').value = '';
    load();
  }
  function clearButton() {
    const button = el('button', { type: 'button', class: 'button', text: 'Clear search and filters' });
    button.addEventListener('click', resetFilters);
    return button;
  }
  clear.addEventListener('click', resetFilters);

  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = search.value.trim(); state.page = 1; load(); }, 250);
  });
  for (const key of Object.keys(filters)) {
    filters[key].querySelector('select').addEventListener('change', (event) => {
      state[key] = event.target.value; state.page = 1; load();
    });
  }
  sort.querySelector('select').addEventListener('change', (event) => {
    state.sort = event.target.value; state.page = 1; load();
  });

  load();
}
