// The scene model: which worker and helper stands where, and what changed since the snapshot before, as
// plain data. No drawing and no DOM.
import { lookOf } from './sprites.js';

// Per task state: where its worker stands, what it does there and the marker over it. Every task at a desk
// has a desk of its own: one while tasks run one at a time, one per task while a parallel group runs.
const STATES = {
  'pending': { place: 'queue', anim: 'idle', marker: null },
  'running': { place: 'desk', anim: 'type', marker: null },
  'no-session': { place: 'desk', anim: 'sleep', marker: 'zz' },
  'interrupted': { place: 'desk', anim: 'sleep', marker: 'zz' },
  'done': { place: 'done', anim: 'idle', marker: 'check' },
  'failed': { place: 'alert', anim: 'alarm', marker: 'alert' },
  'stopped': { place: 'alert', anim: 'alarm', marker: 'alert' },
};
const PLACE_NAME = { done: 'done zone', alert: 'alert corner' };
// A run of more than LONG_RUN tasks keeps only its DONE_SHOWN most recently finished workers in the done
// zone; the other finished tasks fold into the "+N done" counter.
const LONG_RUN = 12;
const DONE_SHOWN = 4;
// At most HELPERS_SHOWN helpers stand around each desk, one per helper spot of the scene; the others are
// counted in that desk's "+N" marker.
const HELPERS_SHOWN = 4;

// Most recently finished first: by end time (stamps sort as text), then by task order.
const byRecency = (a, b) => (b.end || '').localeCompare(a.end || '') || b.index - a.index;

const atDesk = task => (STATES[task.state] || STATES.pending).place === 'desk';

// The first desk is "desk", as it was while a run had only one; the others are numbered.
const deskName = desk => (desk ? `desk ${desk + 1}` : 'desk');

// A run snapshot from /api/run, and the desk of each task at a desk -> the run state (with the preflight
// message when the preflight failed), one worker per task drawn, in task order, and the finished tasks
// folded away. `slot` counts within the place: queue slot 0 is the next task, nearest the desk; at a desk
// the slot is the desk. A task of a parallel group carries its group and the group's index in the run, and
// its accessible name ends with the group. Each worker keeps its task's snapshot for the facts shown about it.
function officeOf(run, desks) {
  const done = run.tasks.filter(t => t.state === 'done');
  const shown = new Set(run.tasks.length > LONG_RUN ? [...done].sort(byRecency).slice(0, DONE_SHOWN) : done);
  const groupIndex = new Map((run.groups || []).map((g, i) => [g.id, i]));
  const taken = { queue: 0, done: 0, alert: 0 };
  const workers = [], collapsed = [];
  for (const task of run.tasks) {
    const number = String(task.index).padStart(2, '0');
    if (task.state === 'done' && !shown.has(task)) {
      collapsed.push({ id: task.id, number, title: task.title, task });
      continue;
    }
    const { place, anim, marker } = STATES[task.state] || STATES.pending;
    const slot = place === 'desk' ? desks.get(task.id) : taken[place]++;
    const where = place === 'queue' ? `queue position ${slot + 1}` : place === 'desk' ? deskName(slot) : PLACE_NAME[place];
    const group = task.group ?? null;
    const parts = [number, task.title, task.state, where];
    if (group) parts.push(`group ${group}`);
    workers.push({
      id: task.id, number, title: task.title, state: task.state, place, slot, anim, marker, task,
      group, groupIndex: group ? groupIndex.get(group) ?? 0 : null,
      look: lookOf(task.id), label: parts.join(' · '),
    });
  }
  // A lone worker in the alert corner has room for a wide name tag.
  const alerted = workers.filter(w => w.place === 'alert');
  for (const worker of alerted) worker.alone = alerted.length === 1;
  const preflightError = run.state === 'preflight-failed' ? run.preflight : null;
  return { state: run.state, preflightError, workers, collapsed };
}

// The tasks whose subagents stand around their desks as helpers: the running ones. No-session and
// interrupted mean no session works, so a task in either state has none.
export function helperTasksOf(run) {
  return run.tasks.filter(t => t.state === 'running').map(t => t.id);
}

// The subagents at work in a task's session, from its session log's feed items (see readFeed). A helper
// starts with an `agent` item and ends with its `agent-end` item. All of them end with the session's
// `result` item, and when a new session starts: a task run again appends its new session to the same log.
export function createHelperList() {
  let working = new Map();                      // tool-use id -> { id, type, description }, in start order
  let session = null;
  return {
    // A batch `{ items, reset }` from readFeed.
    apply({ items, reset }) {
      if (reset) { working = new Map(); session = null; }
      for (const item of items) {
        if (item.k === 'agent') working.set(item.id, { id: item.id, type: item.type || 'agent', description: item.t || '' });
        else if (item.k === 'agent-end') working.delete(item.id);
        else if (item.k === 'result') working.clear();
        else if (item.k === 'init') {
          if (item.sid !== session) working.clear();
          session = item.sid;
        }
      }
    },
    // The helpers at work now, in start order.
    get active() { return [...working.values()]; },
  };
}

// The first free number from 0 among `taken`.
function firstFree(taken) {
  const used = new Set(taken);
  let n = 0;
  while (used.has(n)) n++;
  return n;
}

// One run's office across its snapshots. `update(run, helpers)` takes a snapshot from /api/run and the
// helpers of the helper tasks (see helperTasksOf) as a Map from task id to its list, holding only the tasks
// whose log has been read. It returns the office to draw: the run state, the workers and the folded tasks,
// how many desks stand in the office, the helpers drawn around the desks and, per desk, the others waiting
// in its "+N" count (`otherHelpers`: `{ task, desk, list }`), and what changed since the call before:
// - `first`: the run's first snapshot; everyone is placed directly, with no walks and no celebrations.
// - a worker's `moved`: it changed place or slot, so it walks to its new spot.
// - a worker's `celebrate`: it has just finished, so it celebrates when it reaches the done zone.
// - a helper's `arrive`, on the call where it is first drawn: 'walk' in from the door, or 'place' it
//   directly when it was already at work as the page first read the log of a task at a desk then.
// A task keeps its desk while it stays at one, so the tasks of a group never change desks as the others
// leave; a task that comes to a desk takes the first free one.
export function createOffice() {
  let before = null;                            // task id -> { place, slot, state } as last drawn
  let firstHelperTasks = null;                  // the helper tasks of the run's first snapshot
  const read = new Set();                       // the tasks whose helpers have been seen
  const desks = new Map();                      // task id -> its desk, kept while it is at one
  const spots = new Map();                      // task id -> (helper id -> its spot, kept while it works)
  return {
    update(run, helpers) {
      const first = !before;
      const seated = run.tasks.filter(atDesk);
      const seatedIds = new Set(seated.map(t => t.id));
      for (const id of [...desks.keys()]) if (!seatedIds.has(id)) desks.delete(id);
      for (const task of seated) if (!desks.has(task.id)) desks.set(task.id, firstFree(desks.values()));
      const office = officeOf(run, desks);
      office.desks = Math.max(1, ...[...desks.values()].map(d => d + 1));

      const helperTasks = helperTasksOf(run);
      if (first) firstHelperTasks = new Set(helperTasks);
      for (const id of [...spots.keys()]) if (!helperTasks.includes(id)) spots.delete(id);
      office.helpers = [];
      office.otherHelpers = [];
      const counts = new Map();
      for (const task of helperTasks) {
        const current = !!helpers?.has(task);
        const active = current ? helpers.get(task) : [];
        counts.set(task, active.length);
        let arrive = 'walk';
        if (current && !read.has(task)) {
          read.add(task);
          if (firstHelperTasks.has(task)) arrive = 'place';
        }
        // A helper keeps its spot while it works; a new one takes a free spot, or waits in the "+N" count.
        if (!spots.has(task)) spots.set(task, new Map());
        const own = spots.get(task);
        const working = new Set(active.map(h => h.id));
        const drawnBefore = new Set(own.keys());
        for (const id of drawnBefore) if (!working.has(id)) own.delete(id);
        for (const helper of active) {
          if (!own.has(helper.id) && own.size < HELPERS_SHOWN) own.set(helper.id, firstFree(own.values()));
        }
        const desk = desks.get(task);
        for (const h of active) {
          if (!own.has(h.id)) continue;
          office.helpers.push({ ...h, task, desk, spot: own.get(h.id), look: lookOf(h.id), arrive: drawnBefore.has(h.id) ? null : arrive });
        }
        const others = active.filter(h => !own.has(h.id));
        if (others.length) office.otherHelpers.push({ task, desk, list: others });
      }
      // Every worker at a desk says how many helpers it has.
      for (const worker of office.workers) {
        if (worker.place !== 'desk') continue;
        const n = counts.get(worker.id) || 0;
        worker.label += ` · ${n} ${n === 1 ? 'helper' : 'helpers'}`;
      }

      for (const worker of office.workers) {
        const was = before?.get(worker.id);
        worker.moved = !!was && (was.place !== worker.place || was.slot !== worker.slot);
        worker.celebrate = !!was && was.state !== 'done' && worker.state === 'done';
      }
      before = new Map([
        ...office.workers.map(w => [w.id, { place: w.place, slot: w.slot, state: w.state }]),
        ...office.collapsed.map((c, slot) => [c.id, { place: 'collapsed', slot, state: 'done' }]),
      ]);
      office.first = first;
      return office;
    },
  };
}
