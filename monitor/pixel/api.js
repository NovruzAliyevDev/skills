// The monitor server's API: JSON reads, the polling loops that keep the page current, the incremental
// reader of a session log, and whether the page is offline.

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

// A task's brief, report or earlier attempt's report (`kind` brief, result or previous): its text, or null
// when the server has none.
export async function getFile(selection, task, kind) {
  const response = await fetch(`/api/file?${query({ ...selection, task, kind })}`, { cache: 'no-store' });
  return response.ok ? (await response.json()).text : null;
}

// Reads a task's session log incrementally while subscribed. `listener` gets batches
// `{ items, reset, missing }`: on `reset` it drops what it has shown (the log was cut and is read again
// from its start), then it adds `items`. Returns the unsubscribe call; an answer still on its way after
// it is dropped.
export function readFeed(selection, task, listener) {
  let offset = 0, read = 0, subscribed = true;
  const poller = poll(async () => {
    const data = await getJson(`/api/feed?${query({ ...selection, task, offset })}`);
    if (!subscribed) return;
    // A log that was cut, or that vanished after it had lines, starts over.
    const reset = !!data.reset || (!!data.missing && read > 0);
    read = (reset ? 0 : read) + data.items.length;
    offset = data.offset;
    listener({ items: data.items, reset, missing: !!data.missing });
  }, FEED_EVERY_MS);
  return () => { subscribed = false; poller.stop(); };
}
