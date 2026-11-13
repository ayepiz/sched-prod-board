import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const errorBox = document.querySelector('.error');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = panel.querySelector('[data-testid="panel-ack"]');

/** id -> <li>. Rows are kept, not re-rendered, so a refresh never drops a click or an acked mark. */
const rows = new Map();
const acked = new Set();
/** id -> latest incident data, for the panel. */
const incidentsById = new Map();
/** The incident the panel is open on. Bound to an id, never to a list position (product decision, step 1). */
let panelId = null;

// R5: viewer's own zone and own field order (dd/mm in EU locales), 24h clock.
const timeFmt = new Intl.DateTimeFormat(navigator.languages?.[0] ?? navigator.language, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text; // textContent: API strings are never parsed as HTML
  return node;
}

function markRowAcked(id, reply) {
  const li = rows.get(id);
  if (!li || li.querySelector('[data-testid="acked"]')) return;
  li.classList.add('is-acked');
  li.querySelector('.state').append(el('span', { 'data-testid': 'acked', class: 'acked', title: `acked ${reply.ackedAt}` }, '✓ acked'));
}

function renderPanel() {
  const i = incidentsById.get(panelId);
  if (!i) return;
  panel.dataset.id = i.id;
  panel.querySelector('.panel-id').textContent = i.id;
  panel.querySelector('.panel-sev').textContent = i.severity;
  panel.querySelector('.panel-sev').className = `panel-sev ${i.severity}`;
  panel.querySelector('.panel-service').textContent = i.service;
  panel.querySelector('.panel-region').textContent = i.region;
  const t = panel.querySelector('.panel-time');
  t.setAttribute('datetime', i.openedAt);
  t.textContent = timeFmt.format(new Date(i.openedAt));
  panel.querySelector('.panel-summary').textContent = i.summary;
  const isAcked = acked.has(i.id);
  panelAck.hidden = isAcked;
  panelAck.disabled = false;
  panelAck.textContent = `Ack ${i.id}`;
  panel.querySelector('.panel-acked').hidden = !isAcked;
}

function openPanel(id) {
  panelId = id;
  for (const [rid, li] of rows) li.classList.toggle('is-selected', rid === id);
  for (const [rid, li] of rows) li.setAttribute('aria-expanded', String(rid === id));
  renderPanel();
  panel.hidden = false;
}

function closePanel() {
  panelId = null;
  panel.hidden = true;
  for (const li of rows.values()) {
    li.classList.remove('is-selected');
    li.setAttribute('aria-expanded', 'false');
  }
}

async function onPanelAck() {
  const id = panelId; // captured now: the ack goes to the incident the panel names, whatever the list does meanwhile
  if (!id || acked.has(id)) return;
  panelAck.disabled = true;
  panelAck.textContent = `Acking ${id}…`;
  try {
    const reply = await ack(id); // R2: api.ack keeps the receipt and logs it
    acked.add(id);
    markRowAcked(id, reply);
  } catch (err) {
    console.error(err);
    showError(`Ack failed for ${id}. Try again.`);
  } finally {
    if (panelId === id) renderPanel();
  }
}

panelAck.addEventListener('click', onPanelAck);
panel.querySelector('.panel-close').addEventListener('click', closePanel);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) closePanel();
});

function buildRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt }, timeFmt.format(new Date(i.openedAt))),
  );
  li.append(el('span', { class: 'state' }));
  // The row opens its incident panel; Ack lives in the panel (product decision, step 1).
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-expanded', 'false');
  li.setAttribute('aria-label', `${i.id} ${i.severity} ${i.service} ${i.summary}. Open incident panel`);
  li.addEventListener('click', () => openPanel(i.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(i.id);
    }
  });
  return li;
}

function updateRow(li, i) {
  const time = li.querySelector('time');
  if (time.getAttribute('datetime') !== i.openedAt) {
    time.setAttribute('datetime', i.openedAt);
    time.textContent = timeFmt.format(new Date(i.openedAt));
  }
}

/** R1: newest first; new incidents go on top; existing rows stay the same DOM nodes. */
function render(incidents) {
  const seen = new Set();
  let anchor = null; // the row the next one goes after
  for (const i of incidents) {
    seen.add(i.id);
    incidentsById.set(i.id, i);
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      rows.set(i.id, li);
    } else {
      updateRow(li, i);
    }
    const want = anchor ? anchor.nextSibling : list.firstChild;
    if (li !== want) list.insertBefore(li, want);
    anchor = li;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
      incidentsById.delete(id);
      if (panelId === id) closePanel();
    }
  }
  if (panelId) renderPanel();
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

let loaded = false;
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    errorBox.hidden = true;
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents are on screen
    }
  } catch (err) {
    console.error(err);
    showError('Cannot reach the incident API. Retrying…');
  } finally {
    setTimeout(tick, REFRESH_MS); // R4: one request at a time, every 2 s
  }
}

tick();
