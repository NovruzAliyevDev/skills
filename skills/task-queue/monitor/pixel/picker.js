// The ticket picker: a registered repository's .scratch tickets, picked and started as a queue. It opens on
// the `#new:<Project>` hash; main.js owns the hash and calls show() and hide().
import { postAdmin, watchPicker } from './api.js';
import { badge, confirmAction, esc, setHtml } from './panel.js';

const NAME_RE = /^[A-Za-z0-9._-]+$/;
const LAST_REPO = 'task-queue-picker-repo';
// A status line that is neither of these is shown as a warning; the ticket can still be picked.
const KNOWN_STATUS = new Set(['ready-for-agent', 'done']);
const two = n => String(n).padStart(2, '0');
// The task's title as the server makes it: `<feature> <NN> <title>`, without double quotes, at most 60 characters.
const taskTitle = t => `${t.feature} ${two(t.number)} ${t.title}`.replace(/"/g, '').replace(/\s+/g, ' ').slice(0, 60).trim();

// The repository last picked, kept per browser for the New queue button.
export function lastRepo() {
  try { return localStorage.getItem(LAST_REPO) || ''; } catch { return ''; }
}

// `onProject(project)` asks main.js to show the picker for another repository (it sets the hash);
// `onStarted({ project, run })` hands over the new run.
export function createPicker(root, { onProject, onStarted }) {
  const $ = id => root.querySelector(`#${id}`);
  const empty = $('picker-empty'), body = $('picker-body');
  const repoSelect = $('picker-repo'), path = $('picker-path'), forget = $('picker-forget'), projectName = $('picker-project');
  const warnings = $('picker-warnings'), features = $('picker-features'), order = $('picker-order');
  const mode = $('picker-mode'), model = $('picker-model'), effort = $('picker-effort');
  const start = $('picker-start'), why = $('picker-start-why'), message = $('picker-msg');

  let project = null;           // the project named by the hash; '' asks for the last or first repository
  let repos = null, tickets = null;
  let picked = new Set();       // ticket keys
  let busy = false;
  let poller = null;

  const repo = () => repos?.find(r => r.project === project) || null;
  const allTickets = () => (tickets?.features || []).flatMap(f => f.tickets.map(t => ({ ...t, feature: f.name })));

  function render() {
    if (!repos) return;
    empty.hidden = repos.length > 0;
    body.hidden = repos.length === 0;
    if (!repos.length) return;
    // The hash names no registered repository: the last one picked, or the first.
    if (!repo()) return onProject((repos.find(r => r.project === lastRepo()) || repos[0]).project);
    try { localStorage.setItem(LAST_REPO, project); } catch { /* not kept */ }
    setHtml(repoSelect, repos.map(r => `<option value="${esc(r.project)}"${r.project === project ? ' selected' : ''}>${esc(r.project)}</option>`).join(''));
    repoSelect.value = project;
    path.textContent = repo().path;
    renderWarnings();
    renderFeatures();
    renderOrder();
  }

  // What keeps the repository from a queue; ticket 04 adds the runner guards here.
  function renderWarnings() {
    const list = [];
    if (!repo().exists) list.push('The repository folder is gone. Forget it, or run the ticket-queue skill again where it now is.');
    const stateFile = tickets?.stateFile;
    if (stateFile?.status === 'unreadable') {
      list.push(`The ticket state file .scratch/queue-state.json is unreadable: ${stateFile.reason}. The tickets follow their Status lines, and nothing writes the file until it is fixed by hand.`);
    }
    if (stateFile?.problem) list.push(`${stateFile.problem}.`);
    setHtml(warnings, list.map(w => `<p class="warning">${esc(w)}</p>`).join(''));
  }

  // A rewrite gives the focused checkbox its focus back, found by its ticket's key.
  function renderFeatures() {
    if (!tickets) return setHtml(features, '<p class="empty">Reading the tickets…</p>');
    const html = tickets.features.length ? tickets.features.map((f, fi) => {
      const rows = f.tickets.map((t, ti) => {
        const id = `pick-${fi}-${ti}`, selectable = t.actions.includes('select');
        const warn = t.status && !KNOWN_STATUS.has(t.status)
          ? ` <span class="badge s-warn" title="Its Status line says ${esc(t.status)}, not ready-for-agent">status: ${esc(t.status)}</span>`
          : !t.status ? ' <span class="badge s-warn" title="It has no Status line">no status</span>' : '';
        // A ticket tied to a run links to it.
        const held = t.run
          ? ` <a class="ticket-run" href="#${esc(encodeURIComponent(t.run))}" aria-label="${esc(`${f.name} ${two(t.number)}: ${t.state} in run ${t.run}, task ${t.task}`)}">${esc(t.run.split('/')[1])}</a>`
          : '';
        return `<li class="ticket-row${selectable ? '' : ' unselectable'}">
          <input type="checkbox" id="${id}" data-key="${esc(t.key)}"${picked.has(t.key) ? ' checked' : ''}${selectable ? '' : ' disabled'}>
          <label for="${id}"><span class="sr-only">${esc(f.name)} </span><b class="num">${two(t.number)}</b> <span class="ticket-title">${esc(t.title)}</span></label>
          <span class="ticket-badges">${badge(t.state)}${warn}${held}</span></li>`;
      }).join('');
      return `<section class="feature" aria-labelledby="feature-${fi}"><h3 id="feature-${fi}">${esc(f.name)}</h3>${
        f.tickets.length ? `<ul class="tickets">${rows}</ul>` : '<p class="no-tickets">no tickets</p>'}</section>`;
    }).join('') : '<p class="empty">No features under .scratch in this repository.</p>';
    const focused = features.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    if (setHtml(features, html) && focused) [...features.querySelectorAll('input[data-key]')].find(i => i.dataset.key === focused)?.focus();
  }

  // The picked tickets in queue order: features alphabetically, then by number, as the server orders them.
  function queueOrder() {
    return allTickets().filter(t => picked.has(t.key));
  }

  function renderOrder() {
    const list = queueOrder();
    setHtml(order, list.length
      ? list.map((t, i) => `<li><b class="num">${two(i + 1)}</b> ${esc(taskTitle(t))}</li>`).join('')
      : '<li class="empty">No ticket picked yet.</li>');
    const reason = busy ? 'starting…'
      : !repo()?.exists ? 'the repository folder is gone'
      : !list.length ? 'pick at least one ticket'
      : !NAME_RE.test(projectName.value) ? 'the project name may hold only letters, digits, dots, dashes and underscores'
      : '';
    start.setAttribute('aria-disabled', String(!!reason));
    start.textContent = busy ? 'Starting…' : 'Start';
    why.textContent = reason ? `Start is not possible: ${reason}.` : '';
  }

  // Each poll's answer: the selection keeps only tickets that can still be picked.
  function onData(data) {
    repos = data.repos;
    tickets = data.tickets;
    const selectable = new Set(allTickets().filter(t => t.actions.includes('select')).map(t => t.key));
    picked = new Set([...picked].filter(k => selectable.has(k)));
    render();
  }

  features.addEventListener('change', e => {
    const key = e.target.dataset?.key;
    if (!key) return;
    if (e.target.checked) picked.add(key); else picked.delete(key);
    message.textContent = '';
    renderFeatures();
    renderOrder();
  });
  repoSelect.addEventListener('change', () => onProject(repoSelect.value));
  projectName.addEventListener('input', renderOrder);

  // One Forget at a time; its dialog says what stays.
  let forgetting = false;
  forget.addEventListener('click', async () => {
    if (forgetting) return;
    const asked = project;
    forgetting = true;
    try { await forgetRepo(asked); } finally { forgetting = false; }
  });

  async function forgetRepo(asked) {
    if (!await confirmAction({
      title: `Forget ${asked}?`,
      text: 'It leaves the list of repositories here. Its run folders and its tickets stay; run the ticket-queue skill in it to add it again.',
      ok: 'Forget',
    })) return;
    const result = await postAdmin({ project: asked }, 'forget-repo');
    if (!result.ok) { message.textContent = `Forget refused: ${result.error}`; return; }
    if (project === asked) onProject('');
  }

  start.addEventListener('click', async () => {
    if (start.getAttribute('aria-disabled') === 'true') return;
    const asked = project;
    busy = true;
    message.textContent = '';
    renderOrder();
    const result = await postAdmin({ project: asked }, 'new-queue', {
      tickets: queueOrder().map(t => t.key),
      settings: { permissionMode: mode.value, model: model.value.trim() || null, effort: effort.value.trim() || null, projectName: projectName.value },
    });
    busy = false;
    if (project !== asked) return;
    if (!result.ok) { message.textContent = `Start refused: ${result.error}`; renderOrder(); return; }
    picked = new Set();
    onStarted({ project: result.project, run: result.run, warning: result.warning });
  });

  return {
    get open() { return !root.hidden; },
    // Opens the picker for `next` ('' for the last or first repository); a new repository starts with
    // nothing picked and its own project name.
    show(next) {
      root.hidden = false;
      if (next !== project) {
        project = next;
        picked = new Set();
        tickets = null;
        message.textContent = '';
        if (next) projectName.value = next;
      }
      poller?.stop();
      poller = watchPicker(() => project, onData);
    },
    hide() {
      root.hidden = true;
      poller?.stop();
      poller = null;
    },
  };
}
