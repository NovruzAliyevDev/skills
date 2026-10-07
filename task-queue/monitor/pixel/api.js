// The monitor server's API: JSON reads, the polling loops that keep the page current, the shared
// incremental readers of session logs, and whether the page is offline.

const RUNS_EVERY_MS = 4000;
const RUN_EVERY_MS = 2000;
const FEED_EVERY_MS = 2000;

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

// A selection is { project, run }: the query string of a run, or of one of its tasks.
const query = params => new URLSearchParams(params).toString();

// Calls `load` now, then again `ms` after each call settles, so a slow answer never overlaps the next call.
// A failed call keeps whatever the page already shows; `onResult(ok)` hears how each call went.
// `refresh()` calls it at once, or right after the call in flight; `stop()` ends the loop.
function poll(load, ms, onResult = () => {}) {
  let timer = 0, busy = false, again = false, stopped = false;
  async function tick() {
    clearTimeout(timer);
    if (stopped) return;
    if (busy) { again = true; return; }
    busy = true;
    try { await load(); onResult(true); } catch (err) { console.warn(err); onResult(false); }
    busy = false;
    if (stopped) return;
    if (again) { again = false; tick(); } else timer = setTimeout(tick, ms);
  }
  tick();
  return { refresh: tick, stop() { stopped = true; clearTimeout(timer); } };
}

// The page is offline while the last call of the run list's or the selected run's poll failed.
const failing = new Set();
const offlineListeners = new Set();

// `listener(offline)` is called each time the page goes offline or back online.
export function onOffline(listener) {
  offlineListeners.add(listener);
}

function track(name) {
  return ok => {
    const was = failing.size > 0;
    if (ok) failing.delete(name); else failing.add(name);
    if (was !== failing.size > 0) for (const listener of offlineListeners) listener(failing.size > 0);
  };
}

export function watchRuns(onRuns) {
  return poll(async () => onRuns(await getJson('/api/runs')), RUNS_EVERY_MS, track('runs'));
}

// `selected()` returns the current selection; an answer that arrives after it changed is dropped.
export function watchRun(selected, onRun) {
  return poll(async () => {
    const selection = selected();
    if (!selection) return;
    const detail = await getJson(`/api/run?${query(selection)}`);
    if (selected() === selection) onRun(detail);
  }, RUN_EVERY_MS, track('run'));
}

// The admin token this server start handed out with the page.
const adminToken = document.querySelector('meta[name="admin-token"]')?.content || '';

// Asks the server for an admin action on a run. Answers `{ ok: true }`, or `{ ok: false, error }` with the
// reason the action was refused or failed. The page learns the result from its next poll, not from this.
export async function postAdmin(selection, action, extra = {}) {
  let response;
  try {
    response = await fetch('/api/admin', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
      body: JSON.stringify({ ...selection, action, ...extra }),
    });
  } catch {
    return { ok: false, error: 'the monitor server did not answer' };
  }
  if (response.ok) return { ok: true };
  if (response.status === 403) return { ok: false, error: 'the monitor server was restarted; reload the page' };
  const data = await response.json().catch(() => ({}));
  return { ok: false, error: data.error || `the server answered ${response.status}` };
}

// A task's brief, report or earlier attempt's report (`kind` brief, result or previous): its text, or null
// when the server has none.
export async function getFile(selection, task, kind) {
  const response = await fetch(`/api/file?${query({ ...selection, task, kind })}`, { cache: 'no-store' });
  return response.ok ? (await response.json()).text : null;
}

// One incremental reader per task log in use, shared by everyone who reads that log: when the drawer
// shows the desk task, its Activity and the desk's helpers read the log through one poll.
const readers = new Map();

// Reads a task's session log incrementally while subscribed. `listener` gets batches
// `{ items, reset, missing }`: on `reset` it drops what it has so far (the log was cut and is read again
// from its start), then it adds `items`. A listener that joins a reader already under way first gets
// everything read so far, as a reset. Returns the unsubscribe call; the reader stops with its last
// listener, and an answer still on its way then is dropped.
export function readFeed(selection, task, listener) {
  const key = JSON.stringify([selection.project, selection.run, task]);
  let reader = readers.get(key);
  if (!reader) {
    reader = openReader(selection, task);
    readers.set(key, reader);
  }
  reader.listeners.add(listener);
  if (reader.answered) {
    queueMicrotask(() => {
      if (reader.listeners.has(listener)) listener({ items: reader.items.slice(), reset: true, missing: reader.missing });
    });
  }
  return () => {
    if (!reader.listeners.delete(listener) || reader.listeners.size) return;
    reader.poller.stop();
    readers.delete(key);
  };
}

function openReader(selection, task) {
  const reader = { listeners: new Set(), items: [], missing: false, answered: false, poller: null };
  let offset = 0;
  reader.poller = poll(async () => {
    const data = await getJson(`/api/feed?${query({ ...selection, task, offset })}`);
    if (!reader.listeners.size) return;
    // A log that was cut, or that vanished after it had lines, starts over.
    const reset = !!data.reset || (!!data.missing && reader.items.length > 0);
    if (reset) reader.items = [];
    for (const item of data.items) reader.items.push(item);
    offset = data.offset;
    reader.missing = !!data.missing;
    reader.answered = true;
    for (const listener of reader.listeners) listener({ items: data.items, reset, missing: reader.missing });
  }, FEED_EVERY_MS);
  return reader;
}
