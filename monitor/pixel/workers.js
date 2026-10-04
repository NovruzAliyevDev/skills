// The scene model: which worker stands where, as plain data. No drawing and no DOM.
import { lookOf } from './sprites.js';

// Per task state: where its worker stands, what it does there (still frames until the scene animates
// them) and the marker over it. The runner runs one task at a time, so the desk and the alert corner
// normally hold one worker each.
const STATES = {
  'pending': { place: 'queue', anim: 'idle', marker: null },
  'running': { place: 'desk', anim: 'type', marker: null },
  'no-session': { place: 'desk', anim: 'sleep', marker: 'zz' },
  'interrupted': { place: 'desk', anim: 'sleep', marker: 'zz' },
  'done': { place: 'done', anim: 'idle', marker: 'check' },
  'failed': { place: 'alert', anim: 'alarm', marker: 'alert' },
  'stopped': { place: 'alert', anim: 'alarm', marker: 'alert' },
};
const PLACE_NAME = { desk: 'desk', done: 'done zone', alert: 'alert corner' };
// A run of more than LONG_RUN tasks keeps only its DONE_SHOWN most recently finished workers in the done
// zone; the other finished tasks fold into the "+N done" counter.
const LONG_RUN = 12;
const DONE_SHOWN = 4;

// Most recently finished first: by end time (stamps sort as text), then by task order.
const byRecency = (a, b) => (b.end || '').localeCompare(a.end || '') || b.index - a.index;

// A run snapshot from /api/run -> the run state (with the preflight message when the preflight failed),
// one worker per task drawn, in task order, and the finished tasks folded away. `slot` counts within the
// place: queue slot 0 is the next task, nearest the desk. Each worker keeps its task's snapshot for the
// facts shown about it.
export function officeOf(run) {
  const done = run.tasks.filter(t => t.state === 'done');
  const shown = new Set(run.tasks.length > LONG_RUN ? [...done].sort(byRecency).slice(0, DONE_SHOWN) : done);
  const taken = { queue: 0, desk: 0, done: 0, alert: 0 };
  const workers = [], collapsed = [];
  for (const task of run.tasks) {
    const number = String(task.index).padStart(2, '0');
    if (task.state === 'done' && !shown.has(task)) {
      collapsed.push({ id: task.id, number, title: task.title, task });
      continue;
    }
    const { place, anim, marker } = STATES[task.state] || STATES.pending;
    const slot = taken[place]++;
    const where = place === 'queue' ? `queue position ${slot + 1}` : PLACE_NAME[place];
    workers.push({
      id: task.id, number, title: task.title, state: task.state, place, slot, anim, marker, task,
      look: lookOf(task.id), label: [number, task.title, task.state, where].join(' · '),
    });
  }
  const preflightError = run.state === 'preflight-failed' ? run.preflight : null;
  return { state: run.state, preflightError, workers, collapsed };
}
