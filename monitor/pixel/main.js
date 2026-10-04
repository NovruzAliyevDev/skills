// Wiring: the pollers, run selection and the URL hash, and the scene of the selected run.
import { watchRun, watchRuns } from './api.js';
import { esc, onRunChosen, renderRunList, runKey } from './panel.js';
import { officeOf } from './workers.js';
import { createScene } from './scene.js';

const runList = document.getElementById('runs');
const sceneHost = document.getElementById('scene');
const sceneTitle = document.getElementById('scene-title');
let runs = [];
let selected = null;
let scene = null;

function hashKey() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}

// Switching runs rebuilds the scene, so workers of different runs never mix.
function select(run) {
  if (selected && runKey(selected) === runKey(run)) return;
  selected = { project: run.project, run: run.run };
  history.replaceState(null, '', `#${encodeURIComponent(runKey(selected))}`);
  sceneTitle.innerHTML = `Office <span class="muted">${esc(run.project)} ${esc(run.run)}</span>`;
  scene?.destroy();
  scene = createScene(sceneHost);
  renderRunList(runList, runs, runKey(selected));
  runPoll.refresh();
}

const runPoll = watchRun(() => selected, detail => scene.update(officeOf(detail)));

watchRuns(data => {
  document.getElementById('root').textContent = data.root;
  runs = data.runs;
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
