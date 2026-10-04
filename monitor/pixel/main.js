// Wiring: the pollers, run selection and the URL hash, the selected run's header, scene, sections and
// task drawer, notifications and the permission button, the tab title, the offline marker, the theme
// listener and the keyboard.
import { onOffline, watchRun, watchRuns } from './api.js';
import { BAD, STATE_LABEL, createDrawer, esc, onRunChosen, renderCommits, renderProgress, renderRunHeader, renderRunList, runKey } from './panel.js';
import { resetSprites } from './sprites.js';
import { officeOf } from './workers.js';
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
let runs = [];
let selected = null;
let detail = null;            // the selected run's last snapshot
let scene = null;
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
});

function openTask(id) {
  const task = detail?.tasks.find(t => t.id === id);
  if (!task) return;
  if (!drawer.taskId) opener = document.activeElement;
  layout.classList.add('drawer-open');
  drawer.open(selected, task);
  scene.setOpen(id);
}

// Switching runs rebuilds the scene, so workers of different runs never mix, and closes the drawer.
function select(run) {
  if (selected && runKey(selected) === runKey(run)) return;
  drawer.close();
  selected = { project: run.project, run: run.run };
  detail = null;
  history.replaceState(null, '', `#${encodeURIComponent(runKey(selected))}`);
  sceneTitle.innerHTML = `Office <span class="muted">${esc(run.project)} ${esc(run.run)}</span>`;
  scene?.destroy();
  scene = createScene(sceneHost, { onOpen: openTask });
  renderRunList(runList, runs, runKey(selected));
  runPoll.refresh();
}

const runPoll = watchRun(() => selected, next => {
  detail = next;
  renderRunHeader(runHead, detail, selected);
  scene.update(officeOf(detail));
  drawer.update(detail);
  renderCommits(commits, commitsNote, detail.commits);
  renderProgress(progress, progressNote, detail.progress);
  updateTitle();
});

watchRuns(data => {
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

addEventListener('hashchange', () => {
  const run = runs.find(r => runKey(r) === hashKey());
  if (run) select(run);
});

// --- Tab title and notifications, as the old page had them. ---

function updateTitle() {
  const done = detail.tasks.filter(t => t.state === 'done').length;
  const icon = detail.state === 'done' ? '✓' : BAD.has(detail.state) ? '✗' : detail.state === 'running' ? '▶' : '·';
  const label = BAD.has(detail.state) ? ` ${STATE_LABEL[detail.state]}` : '';
  document.title = `${icon} ${done}/${detail.tasks.length}${label} · ${selected.project}`;
}

// A notification when a task finishes, when a queue finishes, and when a queue stops in a bad state.
function notifyChanges(list) {
  const now = new Map(list.map(r => [runKey(r), r]));
  if (previousRuns) {
    for (const [key, r] of now) {
      const before = previousRuns.get(key);
      if (!before) continue;
      if ((r.counts.done || 0) > (before.counts.done || 0) && r.state !== 'done') notify(`Task done (${r.counts.done}/${r.total})`, key);
      if (r.state !== before.state && r.state === 'done') notify(`Queue finished: all ${r.total} tasks DONE`, key);
      if (r.state !== before.state && BAD.has(r.state)) notify(`Queue ${STATE_LABEL[r.state]}`, key);
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

// Esc closes the tooltip first, then the drawer.
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || scene?.dismiss()) return;
  drawer.close();
});
