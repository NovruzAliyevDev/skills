// Wiring: the pollers, run selection and the URL hash, the selected run's header, office, sections and
// task drawer, the running tasks' helpers, notifications and the permission button, the tab title, the
// offline marker, the theme listener and the keyboard.
import { onOffline, postAdmin, readFeed, watchRun, watchRuns } from './api.js';
import { ACTION_LABEL, BAD, STATE_LABEL, confirmAction, createDrawer, entryOf, esc, onRunChosen, onRunControl, renderCommits, renderProgress, renderRunControls, renderRunHeader, renderRunList, runKey } from './panel.js';
import { resetSprites } from './sprites.js';
import { createHelperList, createOffice, helperTasksOf } from './workers.js';
import { createScene } from './scene.js';

const layout = document.getElementById('layout');
const runList = document.getElementById('runs');
const runHead = document.getElementById('head');
const sceneHost = document.getElementById('scene');
const sceneTitle = document.getElementById('scene-title');
const commits = document.getElementById('commits');
const commitsNote = document.getElementById('commits-note');
const progress = document.getElementById('progress');
const progressNote = document.getElementById('progress-note');
const offlineMarker = document.getElementById('offline');
const notifyButton = document.getElementById('notify-btn');
const controls = document.getElementById('run-controls');
const controlButtons = document.getElementById('control-buttons');
const adminMessage = document.getElementById('admin-msg');
let busyAction = null;        // the queue control whose request is on its way
let runs = [];
let selected = null;
let detail = null;            // the selected run's last snapshot
let office = null;            // the selected run's office model, which compares its snapshots
let scene = null;
const desks = new Map();      // helper task id -> { helpers, stop }: its log, read for its helpers
let opener = null;            // what had the focus when the drawer opened; it gets the focus back on close
let previousRuns = null;      // the run list of the poll before, to notice what changed

function hashKey() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}

const drawer = createDrawer(document.getElementById('drawer'), {
  onClose(hadFocus) {
    layout.classList.remove('drawer-open');
    scene?.setOpen(null);
    if (hadFocus && opener?.isConnected) opener.focus();
    opener = null;
  },
  // Skip asks for confirmation first; Un-skip does not. The page then shows what happened from its next poll.
  async onAction(selection, task, action) {
    if (action === 'skip' && !await confirmAction({
      title: `Skip task ${String(task.index).padStart(2, '0')}?`,
      text: `"${task.title}" will not run: when the queue reaches it, it passes over it and writes a SKIPPED report. You can un-skip it until then.`,
      ok: 'Skip task',
    })) return null;
    const result = await postAdmin(selection, action, { task: task.id });
    runPoll.refresh();
    runsPoll.refresh();
    return result;
  },
});

// `tab` picks the drawer's tab; without it, an open drawer keeps its own. `id` names a task or a conflict
// session.
function openTask(id, tab) {
  const task = detail && entryOf(detail, id);
  if (!task) return;
  if (!drawer.taskId) opener = document.activeElement;
  layout.classList.add('drawer-open');
  drawer.open(selected, task, tab);
  scene.setOpen(id);
}

// Switching runs rebuilds the office and the scene, so workers of different runs never mix, and closes
// the drawer.
function select(run) {
  if (selected && runKey(selected) === runKey(run)) return;
  drawer.close();
  followDesks([]);
  selected = { project: run.project, run: run.run };
  detail = null;
  busyAction = null;
  adminMessage.textContent = '';
  renderRunControls(controls, controlButtons, null, null);
  history.replaceState(null, '', `#${encodeURIComponent(runKey(selected))}`);
  sceneTitle.innerHTML = `Office <span class="muted">${esc(run.project)} ${esc(run.run)}</span>`;
  scene?.destroy();
  office = createOffice();
  scene = createScene(sceneHost, { onOpen: openTask });
  renderRunList(runList, runs, runKey(selected));
  runPoll.refresh();
}

// Each helper task's session log is read while it runs, for the helpers around its desk (see
// helperTasksOf). When the drawer shows the same task, its Activity shares the reader.
function followDesks(taskIds) {
  for (const [id, followed] of desks) {
    if (taskIds.includes(id)) continue;
    followed.stop();
    desks.delete(id);
  }
  for (const id of taskIds) {
    if (desks.has(id)) continue;
    const followed = { helpers: null, stop: null }, subagents = createHelperList();
    desks.set(id, followed);
    followed.stop = readFeed(selected, id, batch => {
      subagents.apply(batch);
      followed.helpers = subagents.active;
      if (desks.get(id) === followed && detail) showOffice();
    });
  }
}

function showOffice() {
  const helpers = new Map([...desks].filter(([, d]) => d.helpers).map(([id, d]) => [id, d.helpers]));
  scene.update(office.update(detail, helpers));
}

const runPoll = watchRun(() => selected, next => {
  detail = next;
  followDesks(helperTasksOf(detail));
  renderRunHeader(runHead, detail, selected);
  renderRunControls(controls, controlButtons, detail, busyAction);
  showOffice();
  drawer.update(detail);
  renderCommits(commits, commitsNote, detail.commits);
  renderProgress(progress, progressNote, detail.progress);
  updateTitle();
});

const runsPoll = watchRuns(data => {
  document.getElementById('root').textContent = data.root;
  runs = data.runs;
  notifyChanges(runs);
  // On load the run named in the URL wins, then a running one, then the newest.
  if (!selected && runs.length) select(runs.find(r => runKey(r) === hashKey()) || runs.find(r => r.state === 'running') || runs[0]);
  renderRunList(runList, runs, selected && runKey(selected));
});

onRunChosen(runList, key => {
  const run = runs.find(r => runKey(r) === key);
  if (run) select(run);
});

// A queue control sends its action; a refusal shows its reason beside the controls. The page then shows
// what happened from its next poll, at once.
onRunControl(controlButtons, async action => {
  if (busyAction || !selected) return;
  const asked = selected;
  busyAction = action;
  adminMessage.textContent = '';
  renderRunControls(controls, controlButtons, detail, busyAction);
  const result = await postAdmin(asked, action);
  if (selected !== asked) return;
  busyAction = null;
  if (!result.ok) adminMessage.textContent = `${ACTION_LABEL[action]} refused: ${result.error}`;
  renderRunControls(controls, controlButtons, detail, busyAction);
  runPoll.refresh();
  runsPoll.refresh();
});

addEventListener('hashchange', () => {
  const run = runs.find(r => runKey(r) === hashKey());
  if (run) select(run);
});

// --- Tab title and notifications, as the old page had them. ---

function updateTitle() {
  const done = detail.tasks.filter(t => t.state === 'done').length;
  const icon = ['done', 'finished-with-skips'].includes(detail.state) ? '✓' : BAD.has(detail.state) ? '✗' : detail.state === 'paused' ? '⏸'
    : ['running', 'pausing'].includes(detail.state) ? '▶' : '·';
  const label = BAD.has(detail.state) ? ` ${STATE_LABEL[detail.state]}` : '';
  document.title = `${icon} ${done}/${detail.tasks.length}${label} · ${selected.project}`;
}

// A notification when a task finishes (one each, also when tasks of a group finish between two polls),
// when a merge conflicts (one each), when a queue finishes, and when a queue stops in a bad state.
function notifyChanges(list) {
  const now = new Map(list.map(r => [runKey(r), r]));
  if (previousRuns) {
    for (const [key, r] of now) {
      const before = previousRuns.get(key);
      if (!before) continue;
      if (r.state !== 'done') {
        for (let done = (before.counts.done || 0) + 1; done <= (r.counts.done || 0); done++) notify(`Task done (${done}/${r.total})`, key);
      }
      if ((r.conflicts || 0) > (before.conflicts || 0)) notify('Merge conflict', key);
      if (r.state !== before.state && r.state === 'done') notify(`Queue finished: all ${r.total} tasks DONE`, key);
      if (r.state !== before.state && r.state === 'finished-with-skips') notify(`Queue finished, ${r.counts.skipped || 0} skipped: ${r.counts.done || 0} of ${r.total} tasks DONE`, key);
      if (r.state !== before.state && BAD.has(r.state)) notify(`Queue ${STATE_LABEL[r.state]}`, key);
      if (r.state !== before.state && r.state === 'paused') notify('Queue paused', key);
    }
  }
  previousRuns = now;
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
}

if ('Notification' in window && Notification.permission === 'default') {
  notifyButton.hidden = false;
  notifyButton.onclick = () => Notification.requestPermission().then(() => { notifyButton.hidden = Notification.permission !== 'default'; });
}

// While the polls fail, the page keeps the last state it got and says so.
onOffline(offline => {
  offlineMarker.textContent = offline
    ? `Offline since ${new Date().toLocaleTimeString()}: no update from the monitor server. Showing the last known state.`
    : '';
});

// The scene follows the light or dark theme: its sprites are painted again in the new colours.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  resetSprites();
  scene?.redraw();
});

// Esc closes the tooltip first, then the drawer; while the confirmation dialog is open, only the dialog.
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.getElementById('confirm').open || scene?.dismiss()) return;
  drawer.close();
});
