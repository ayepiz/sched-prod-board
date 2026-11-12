import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const errorBox = document.querySelector('.error');

/** id -> <li>. Rows are kept, not re-rendered, so a refresh never drops a click or an acked mark. */
const rows = new Map();
const acked = new Set();

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

function markAcked(li, reply) {
  li.classList.add('is-acked');
  const btn = li.querySelector('[data-testid="ack"]');
  const mark = el('span', { 'data-testid': 'acked', class: 'acked', title: `acked ${reply.ackedAt}` }, '✓ acked');
  btn.replaceWith(mark);
}

async function onAck(id, li, btn) {
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id); // R2: api.ack keeps the receipt and logs it
    acked.add(id);
    markAcked(li, reply);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Ack';
    showError(`Ack failed for ${id}. Try again.`);
  }
}

function buildRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt }, timeFmt.format(new Date(i.openedAt))),
  );
  const btn = el('button', { type: 'button', 'data-testid': 'ack', class: 'ack' }, 'Ack');
  btn.addEventListener('click', () => onAck(i.id, li, btn));
  li.append(btn);
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
    }
  }
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
