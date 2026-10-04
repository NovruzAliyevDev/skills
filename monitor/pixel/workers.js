// The scene model: which worker stands where, as plain data. No drawing and no DOM.

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

// A run snapshot from /api/run -> the run state and one worker per task, in task order.
// `slot` counts within the place: queue slot 0 is the next task, nearest the desk.
export function officeOf(run) {
  const taken = { queue: 0, desk: 0, done: 0, alert: 0 };
  const workers = run.tasks.map(task => {
    const { place, anim, marker } = STATES[task.state] || STATES.pending;
    const slot = taken[place]++;
    const number = String(task.index).padStart(2, '0');
    const where = place === 'queue' ? `queue position ${slot + 1}` : PLACE_NAME[place];
    return {
      id: task.id, number, title: task.title, state: task.state, place, slot, anim, marker,
      label: [number, task.title, task.state, where].join(' · '),
    };
  });
  return { state: run.state, workers };
}
