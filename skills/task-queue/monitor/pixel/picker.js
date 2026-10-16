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
  const warnings = $('picker-warnings'), features = $('picker-features'), order = $('picker-order'), problemList = $('picker-problems');
  const mode = $('picker-mode'), model = $('picker-model'), effort = $('picker-effort');
  const start = $('picker-start'), why = $('picker-start-why'), message = $('picker-msg');

  let project = null;           // the project named by the hash; '' asks for the last or first repository
  let repos = null, tickets = null;
  let picked = new Set();       // ticket keys
  let openMenu = null;          // the key of the ticket whose Mark menu is open
  let marking = false;
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

  // A run of this repository as a link to its view.
  const runLink = r => `<a href="#${esc(encodeURIComponent(r.run))}">${esc(r.run)}</a> (${esc(r.state)})`;
  const runLinks = list => list.map(runLink).join(', ');

  // What keeps the repository from a queue, as HTML: a live runner blocks Start; an unfinished run with no
  // runner only warns, since its tickets may still be continued there.
  function renderWarnings() {
    const list = [];
    if (!repo().exists) list.push(esc('The repository folder is gone. Forget it, or run the ticket-queue skill again where it now is.'));
    const runs = tickets?.runs;
    if (runs?.live.length) {
      list.push(`A runner of this repository is alive or starting: ${runLinks(runs.live)}. Start waits until it ends, so that two queues never work in the same working tree.`);
    }
    if (runs?.unfinished.length) {
      list.push(`${runs.unfinished.length === 1 ? 'A queue' : `${runs.unfinished.length} queues`} of this repository ${runs.unfinished.length === 1 ? 'is' : 'are'} unfinished, with no runner: ${runLinks(runs.unfinished)}. ` +
        'A ticket picked here that such a queue still holds would run twice if that queue were continued.');
    }
    const stateFile = tickets?.stateFile;
    if (stateFile?.status === 'unreadable') {
      list.push(esc(`The ticket state file .scratch/queue-state.json is unreadable: ${stateFile.reason}. The tickets follow their Status lines, and nothing writes the file until it is fixed by hand.`));
    }
    if (stateFile?.problem) list.push(esc(`${stateFile.problem}.`));
    setHtml(warnings, list.map(w => `<p class="warning">${w}</p>`).join(''));
  }

  // A ticket's Mark menu: the marks its state allows, none while a live runner holds it.
  function markMenu(f, t) {
    const marks = t.actions.filter(a => a.startsWith('mark-')).map(a => a.replace(/^mark-/, ''));
    if (!marks.length) return '';
    const name = `${f.name} ${two(t.number)}`;
    return `<details class="ticket-menu"${openMenu === t.key ? ' open' : ''}>
      <summary class="btn" data-key="${esc(t.key)}" data-focus="menu:${esc(t.key)}" aria-label="${esc(`Mark ${name}`)}">…</summary>
      <div class="ticket-menu-items">${marks.map(m => `<button type="button" class="btn" data-mark="${esc(m)}" data-key="${esc(t.key)}" data-focus="mark-${esc(m)}:${esc(t.key)}"
        aria-label="${esc(`Mark ${name} ${m}`)}">Mark ${m}</button>`).join('')}</div></details>`;
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
        const unread = t.unread
          ? ' <span class="badge s-warn" title="Its Blocked by line names no ticket of this feature, so it blocks nothing">blocked by: unread</span>'
          : '';
        // A ticket tied to a run links to it.
        const held = t.run
          ? ` <a class="ticket-run" href="#${esc(encodeURIComponent(t.run))}" aria-label="${esc(`${f.name} ${two(t.number)}: ${t.state} in run ${t.run}, task ${t.task}`)}">${esc(t.run.split('/')[1])}</a>`
          : '';
        return `<li class="ticket-row${selectable ? '' : ' unselectable'}">
          <input type="checkbox" id="${id}" data-key="${esc(t.key)}" data-focus="pick:${esc(t.key)}"${picked.has(t.key) ? ' checked' : ''}${selectable ? '' : ' disabled'}>
          <label for="${id}"><span class="sr-only">${esc(f.name)} </span><b class="num">${two(t.number)}</b> <span class="ticket-title">${esc(t.title)}</span></label>
          <span class="ticket-badges">${badge(t.state)}${warn}${unread}${held}${markMenu(f, t)}</span></li>`;
      }).join('');
      return `<section class="feature" aria-labelledby="feature-${fi}"><h3 id="feature-${fi}">${esc(f.name)}</h3>${
        f.tickets.length ? `<ul class="tickets">${rows}</ul>` : '<p class="no-tickets">no tickets</p>'}</section>`;
    }).join('') : '<p class="empty">No features under .scratch in this repository.</p>';
    const focused = features.contains(document.activeElement) ? document.activeElement : null;
    if (setHtml(features, html) && focused) focusTicket(focused.dataset.key, focused.dataset.focus);
  }

  // Focuses the control `preferred` (a `data-focus` value) of the ticket `key`; when it is gone (a mark
  // taken), its menu, then its checkbox.
  function focusTicket(key, preferred) {
    const all = [...features.querySelectorAll('[data-focus]')];
    const find = id => all.find(e => e.dataset.focus === id);
    (find(preferred) || find(`menu:${key}`) || find(`pick:${key}`))?.focus();
  }

  // The picked tickets in queue order, as the server orders them: features alphabetically, then each feature's
  // picked tickets with every blocker first, ties broken by number. `problems` are what the server would refuse:
  // a blocker neither picked nor done, and picked tickets that wait on each other.
  function queueOrder() {
    const list = [], problems = [];
    const label = t => `${t.feature} ${two(t.number)}`;
    for (const f of tickets?.features || []) {
      const all = f.tickets.map(t => ({ ...t, feature: f.name }));
      const pickedHere = all.filter(t => picked.has(t.key));
      const waitsOn = new Map(pickedHere.map(t => [t.key, []]));
      for (const t of pickedHere) {
        for (const b of all.filter(x => t.blockers.includes(x.number))) {
          if (picked.has(b.key)) waitsOn.get(t.key).push(b.key);
          else if (b.state !== 'done') problems.push(`${label(t)} is blocked by ${label(b)} ${b.title}, which is neither picked nor done.`);
        }
      }
      const placed = new Set();
      for (let left = pickedHere; left.length;) {
        // Tickets come by number, so the first one ready breaks the tie.
        const next = left.find(t => waitsOn.get(t.key).every(k => placed.has(k)));
        if (!next) { problems.push(`${left.map(label).join(', ')} wait on each other.`); break; }
        placed.add(next.key);
        list.push(next);
        left = left.filter(t => t !== next);
      }
    }
    return { list, problems };
  }

  function renderOrder() {
    const { list, problems } = queueOrder();
    setHtml(order, list.length
      ? list.map((t, i) => `<li><b class="num">${two(i + 1)}</b> ${esc(taskTitle(t))}</li>`).join('')
      : '<li class="empty">No ticket picked yet.</li>');
    setHtml(problemList, problems.map(p => `<li>${esc(p)}</li>`).join(''));
    problemList.hidden = !problems.length;
    const reason = busy ? 'starting…'
      : !repo()?.exists ? 'the repository folder is gone'
      : tickets?.runs?.live.length ? 'a runner of this repository is alive or starting, as said above'
      : !list.length && !problems.length ? 'pick at least one ticket'
      : problems.length === 1 ? 'a picked ticket is blocked, as said under the order'
      : problems.length ? `${problems.length} blocking problems, listed under the order`
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
  // One menu open at a time; Escape closes it and gives the focus back to its button.
  features.addEventListener('toggle', e => {
    const menu = e.target;
    if (!menu.classList?.contains('ticket-menu')) return;
    const key = menu.querySelector('summary').dataset.key;
    if (menu.open) {
      openMenu = key;
      for (const other of features.querySelectorAll('.ticket-menu[open]')) if (other !== menu) other.open = false;
    } else if (openMenu === key) openMenu = null;
  }, true);
  features.addEventListener('keydown', e => {
    const menu = e.target.closest?.('.ticket-menu[open]');
    if (e.key !== 'Escape' || !menu) return;
    // The page's own Escape (closing the drawer) waits for the next press.
    e.stopPropagation();
    menu.open = false;
    menu.querySelector('summary').focus();
  });
  features.addEventListener('click', async e => {
    const button = e.target.closest?.('button[data-mark]');
    if (!button || marking) return;
    const asked = project, key = button.dataset.key, state = button.dataset.mark;
    const t = allTickets().find(x => x.key === key);
    if (!t) return;
    const name = `${t.feature} ${two(t.number)}`;
    // A ticket tied to a run leaves it: say so before, and what Continue of that queue would still do.
    const continued = ['queued', 'running'].includes(t.state) ? 'If that queue is continued, it still runs this ticket.'
      : t.state === 'failed' ? 'If that queue is continued or this task retried, it runs this ticket again.'
      : 'That queue does not run it again.';
    if (t.run && !await confirmAction({
      title: `Mark ${name} ${state}?`,
      text: `It leaves run ${t.run}, where it is ${t.state}. ${continued}`,
      ok: `Mark ${state}`,
    })) return;
    marking = true;
    let result;
    try { result = await postAdmin({ project: asked }, 'mark', { ticket: key, state }); } finally { marking = false; }
    if (project !== asked) return;
    message.textContent = result.ok ? `Marked ${name} ${state}.` : `Mark refused: ${result.error}`;
    if (result.ok) openMenu = null;
    // A poll during the dialog may have replaced the button the dialog gives the focus back to: the focus goes
    // to the ticket's menu, or its checkbox, so the next rewrite keeps it on this ticket.
    if (document.activeElement === document.body || features.contains(document.activeElement)) focusTicket(key, `menu:${key}`);
    poller?.refresh();
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
      tickets: queueOrder().list.map(t => t.key),
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
        openMenu = null;
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
