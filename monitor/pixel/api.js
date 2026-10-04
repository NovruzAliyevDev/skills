// The monitor server's API: JSON reads and the polling loops that keep the page current.

const RUNS_EVERY_MS = 4000;
const RUN_EVERY_MS = 2000;

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

// Calls `load` now, then again `ms` after each call settles, so a slow answer never overlaps the next call.
// A failed call keeps whatever the page already shows. `refresh()` calls it at once, or right after the call in flight.
function poll(load, ms) {
  let timer = 0, busy = false, again = false;
  async function tick() {
    clearTimeout(timer);
    if (busy) { again = true; return; }
    busy = true;
    try { await load(); } catch (err) { console.warn(err); }
    busy = false;
    if (again) { again = false; tick(); } else timer = setTimeout(tick, ms);
  }
  tick();
  return { refresh: tick };
}

export function watchRuns(onRuns) {
  return poll(async () => onRuns(await getJson('/api/runs')), RUNS_EVERY_MS);
}

// `selected()` returns the current selection object; an answer that arrives after it changed is dropped.
export function watchRun(selected, onRun) {
  return poll(async () => {
    const selection = selected();
    if (!selection) return;
    const detail = await getJson(`/api/run?${new URLSearchParams({ project: selection.project, run: selection.run })}`);
    if (selected() === selection) onRun(detail);
  }, RUN_EVERY_MS);
}
