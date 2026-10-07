// Everything around the scene: the sidebar's run list, the run header and sections, the task drawer,
// markdown rendering with its safety rules, and the shared text helpers.
import { getFile, readFeed } from './api.js';

export const STATE_LABEL = {
  'pending': 'pending', 'running': 'running', 'done': 'DONE', 'failed': 'FAILED', 'stopped': 'STOPPED',
  'interrupted': 'interrupted', 'no-session': 'runner has no session', 'not-started': 'not started',
  'preflight-failed': 'preflight failed', 'pausing': 'pausing', 'paused': 'PAUSED',
  'skipped': 'SKIPPED', 'finished-with-skips': 'finished with skips',
};
export const BAD = new Set(['failed', 'stopped', 'interrupted', 'no-session', 'preflight-failed']);

// Reports, briefs and session text are untrusted: raw HTML shows as text, and links or images to
// javascript:, data: or vbscript: URLs go nowhere.
const { marked } = window;
marked.use({
  renderer: { html(token) { return esc(typeof token === 'string' ? token : token.text); } },
  walkTokens(t) { if ((t.type === 'link' || t.type === 'image') && /^\s*(javascript|data|vbscript):/i.test(t.href || '')) t.href = '#'; },
});

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function md(text) { return `<div class="md">${marked.parse(text || '')}</div>`; }
export function badge(state) { return `<span class="badge s-${esc(state)}">${esc(STATE_LABEL[state] || state)}</span>`; }
// A run's badge: a queue that finished with skipped tasks says how many, never "DONE".
export function runBadge(state, skipped) {
  return state === 'finished-with-skips' ? `<span class="badge s-${esc(state)}">finished, ${esc(String(skipped || 0))} skipped</span>` : badge(state);
}
export function money(v) { return v ? `$${v.toFixed(2)}` : ''; }
export function parseLocal(stamp) { if (!stamp) return null; const [d, t] = stamp.split(' '); const [y, mo, da] = d.split('-').map(Number); const [h, mi, s] = t.split(':').map(Number); return new Date(y, mo - 1, da, h, mi, s); }
function hm(stamp) { return stamp ? stamp.slice(11, 16) : ''; }
export function dur(ms) { if (ms == null || ms < 0) return ''; const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; }
function ago(ms) { if (!ms) return ''; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; }
export function runKey(r) { return `${r.project}/${r.run}`; }

// How long a finished task took, e.g. "1h 4m"; empty while it has no end.
export function taskDuration(task) {
  const start = parseLocal(task.start), end = parseLocal(task.end);
  return start && end ? dur(end - start) : '';
}

// The facts the old page's task table showed, as a definition list: start and end, or the time so far
// while running; duration; cost; last activity while running; the stop reason; an earlier failed attempt.
// A conflict session also says which task's branch conflicted.
export function taskFacts(task) {
  const live = task.state === 'running' || task.state === 'no-session';
  const rows = [];
  if (task.conflictTask) rows.push(['Conflict merging', `task ${task.conflictTask}`]);
  const took = taskDuration(task);
  if (task.start) rows.push(['Started', hm(task.start)]);
  if (task.end) rows.push(['Ended', hm(task.end)]);
  if (took) rows.push(['Duration', took]);
  else if (task.start && task.state === 'running') rows.push(['Elapsed', dur(Date.now() - parseLocal(task.start))]);
  if (task.cost) rows.push(['Cost', money(task.cost)]);
  if (live && task.lastActivity) rows.push(['Last activity', ago(task.lastActivity)]);
  if (task.reason) rows.push(['Stop reason', task.reason]);
  const facts = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');
  return (facts ? `<dl class="task-facts">${facts}</dl>` : '') +
    (task.hasPrevious ? '<p class="note">Earlier attempt failed (previous report kept).</p>' : '') +
    (task.skipPending ? '<p class="skip-note">Marked to be skipped: the queue will pass over it.</p>' : '');
}

const rendered = new WeakMap();

// Writes `html` into `el` only when it changed, so polling never resets a selection, a scroll position or
// the focus. Returns whether it wrote.
export function setHtml(el, html) {
  if (rendered.get(el) === html) return false;
  rendered.set(el, html);
  el.innerHTML = html;
  return true;
}

// A focused entry gets its focus back after a rewrite, so polling never disturbs a keyboard or
// screen-reader user.
export function renderRunList(el, runs, selectedKey) {
  const html = runs.map(r => {
    const key = runKey(r);
    const missing = r.missingBriefs.length
      ? ` <span aria-hidden="true" title="missing briefs: ${esc(r.missingBriefs.join(', '))}">⚠</span><span class="sr-only">, missing briefs: ${esc(r.missingBriefs.join(', '))}</span>`
      : '';
    return `<button type="button" class="run-item" data-key="${esc(key)}"${key === selectedKey ? ' aria-current="true"' : ''}>
      <span class="name">${esc(r.project)} <span class="muted">${esc(r.run)}</span>${missing}</span>
      <span class="meta">${runBadge(r.state, r.counts.skipped)}<span>${r.counts.done || 0}/${r.total} done</span><span>${money(r.cost)}</span></span>
    </button>`;
  }).join('') || '<p class="empty">No runs found.</p>';
  const focused = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  if (setHtml(el, html) && focused) [...el.querySelectorAll('[data-key]')].find(b => b.dataset.key === focused)?.focus();
}

export function onRunChosen(el, choose) {
  el.addEventListener('click', e => {
    const item = e.target.closest('[data-key]');
    if (item) choose(item.dataset.key);
  });
}

// --- The selected run's header and its collapsible sections, as the old page showed them. ---

export function renderRunHeader(el, detail, selection) {
  const s = detail.settings, r = detail.runner;
  const cost = [...detail.tasks, ...(detail.conflicts || [])].reduce((sum, t) => sum + (t.cost || 0), 0);
  const started = parseLocal(detail.startedAt);
  const end = detail.finishedAt ? parseLocal(detail.finishedAt) : new Date();
  let process = 'process check pending';
  if (r.known) process = r.alive ? `runner pid ${r.pid}${r.session ? ', session alive' : ', no session process'}` : 'no runner process';
  const missing = detail.tasks.filter(t => !t.hasBrief).map(t => t.id);
  const skipped = detail.tasks.filter(t => t.state === 'skipped').length;
  setHtml(el, `<h2 class="run-title">${esc(selection.project)} <span class="muted">${esc(selection.run)}</span> ${runBadge(detail.state, skipped)}</h2>
    <div class="run-facts">
      <span>model <b>${esc(s.model || 'default')}</b></span><span>effort <b>${esc(s.effort || 'default')}</b></span>
      <span>mode <b>${esc(s.permissionMode)}</b></span><span>workDir <b>${esc(s.workDir)}</b></span>
      ${started ? `<span>started <b>${esc(detail.startedAt)}</b></span><span>elapsed <b>${dur(end - started)}</b></span>` : ''}
      ${cost ? `<span>cost <b>${money(cost)}</b></span>` : ''}
      <span>${esc(process)} <span class="muted">(${ago(detail.livenessAt) || 'n/a'})</span></span>
    </div>
    ${detail.preflight ? `<div class="run-facts"><span>preflight: <b>${esc(detail.preflight)}</b></span></div>` : ''}
    ${missing.length ? `<div class="warning">⚠ Missing briefs: ${esc(missing.join(', '))}</div>` : ''}`);
}

// --- Queue controls: for an unfinished run whose runner supports admin actions, Stop, Pause (Cancel pause
// while pausing) and Continue, each usable when the run answer allows it. ---

export const ACTION_LABEL = { 'stop': 'Stop', 'pause': 'Pause', 'cancel-pause': 'Cancel pause', 'continue': 'Continue', 'skip': 'Skip', 'unskip': 'Un-skip' };
const FINISHED = new Set(['done', 'finished-with-skips']);

// Asks the user to confirm in the page's dialog: `title`, `text`, and `ok`, the confirming button's label.
// Resolves to whether they confirmed. Cancel has the focus first; Esc cancels; the focus goes back to where
// it was.
export function confirmAction({ title, text, ok }) {
  const dialog = document.getElementById('confirm');
  dialog.querySelector('#confirm-title').textContent = title;
  dialog.querySelector('#confirm-text').textContent = text;
  dialog.querySelector('#confirm-ok').textContent = ok;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

// `busy` is the action whose request is on its way. A control that cannot be used now keeps its place and
// its focus, greyed (aria-disabled), so polling never moves the keyboard focus.
export function renderRunControls(box, buttons, detail, busy) {
  const admin = detail?.admin;
  box.hidden = !admin?.supported || FINISHED.has(detail.state);
  if (box.hidden) return setHtml(buttons, '');
  const pausing = admin.actions.includes('cancel-pause') || detail.state === 'pausing';
  const slots = [['stop', 'stop'], ['pause', pausing ? 'cancel-pause' : 'pause'], ['continue', 'continue']];
  const html = slots.map(([slot, action]) => {
    const usable = admin.actions.includes(action) && !busy;
    return `<button type="button" class="btn${action === 'stop' ? ' danger' : ''}" data-slot="${slot}" data-action="${action}" aria-disabled="${!usable}">${ACTION_LABEL[action]}${busy === action ? '…' : ''}</button>`;
  }).join('');
  const focused = buttons.contains(document.activeElement) ? document.activeElement.dataset.slot : null;
  if (setHtml(buttons, html) && focused) buttons.querySelector(`[data-slot="${focused}"]`)?.focus();
}

// `act(action)` is called for a usable control.
export function onRunControl(buttons, act) {
  buttons.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (button && button.getAttribute('aria-disabled') !== 'true') act(button.dataset.action);
  });
}

// `note` is the section summary's short status.
export function renderCommits(el, note, commits) {
  if (!commits) {
    setHtml(el, '<p class="empty">The run has not started.</p>');
    note.textContent = 'not started';
  } else if (commits.error) {
    setHtml(el, `<p class="empty">git log failed: ${esc(commits.error)}</p>`);
    note.textContent = 'git log failed';
  } else {
    setHtml(el, commits.commits.map(c => `<div class="commit"><span class="hash">${esc(c.hash)}</span>
      <span class="date muted">${esc(c.date)}</span><span>${esc(c.subject)} <span class="ref">${esc(c.ref)} · ${esc(c.author)}</span></span></div>`).join('')
      || '<p class="empty">No commits in the run window.</p>');
    note.textContent = String(commits.commits.length);
  }
}

export function renderProgress(el, note, progress) {
  const text = progress.map(l => `${l.time}  ${l.message}`).join('\n') || '(empty)';
  if (el.textContent !== text) el.textContent = text;
  note.textContent = `${progress.length} lines`;
}

// --- The task drawer: the task's number, title, state and facts, then three tabs. Activity follows the
// session log as it grows, Report reloads when the report changes, Brief loads when its tab is shown.
// A conflict session opens in it like a task, without the Brief tab: it has no brief. Under the facts, the
// task's actions that the run answer allows now; `onAction(selection, task, action)` sends one and resolves
// to `{ ok, error }`, or to null when the user did not confirm it.
// `onClose(hadFocus)` is called when it closes. ---

export function createDrawer(root, { onClose, onAction }) {
  const title = root.querySelector('.drawer-title');
  const facts = root.querySelector('.drawer-facts');
  const actionBox = root.querySelector('.task-actions');
  const actionButtons = actionBox.querySelector('.control-buttons');
  const actionMessage = actionBox.querySelector('.admin-msg');
  let busy = null;                              // the task action whose request is on its way
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = Object.fromEntries(tabs.map(t => [t.dataset.tab, document.getElementById(t.getAttribute('aria-controls'))]));
  const feed = panels.activity;
  let selection = null, task = null, tab = 'activity';
  let stopFeed = null, groups = new Map(), following = true;
  let reportKey = null, generation = 0;         // changes whenever the drawer's task does, so late answers are dropped

  root.querySelector('.drawer-close').addEventListener('click', close);
  for (const t of tabs) t.addEventListener('click', () => show(t.dataset.tab));
  const briefTab = tabs.find(t => t.dataset.tab === 'brief');
  // Arrow keys, Home and End move between the tabs shown, as in any tab list.
  root.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    const shown = tabs.filter(t => !t.hidden);
    const i = shown.indexOf(e.target);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: shown.length - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    const t = shown[(next + shown.length) % shown.length];
    t.focus();
    show(t.dataset.tab);
  });
  // The feed follows new items only while it is scrolled to the bottom.
  feed.addEventListener('scroll', () => { following = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40; });

  function show(name) {
    tab = name;
    for (const t of tabs) {
      const selected = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      panels[t.dataset.tab].hidden = !selected;
    }
    if (name === 'activity' && following) feed.scrollTop = feed.scrollHeight;
    if (name === 'report') loadReport();
    if (name === 'brief') loadBrief();
  }

  function renderHead() {
    const head = task.kind === 'conflict'
      ? `<b>M</b> ${esc(task.title)} <span class="muted">conflict session</span>`
      : `<b>${esc(String(task.index).padStart(2, '0'))}</b> ${esc(task.title)}`;
    setHtml(title, `${head} ${badge(task.state)}`);
    setHtml(facts, taskFacts(task));
    renderActions();
  }

  // Skip and Un-skip share a slot, so the focus stays on the button as one turns into the other. A button
  // whose request is on its way stays focusable, greyed.
  function renderActions() {
    const actions = task.actions || [];
    actionBox.hidden = !actions.length && !actionMessage.textContent;
    const html = actions.map(action => `<button type="button" class="btn" data-slot="${action === 'unskip' ? 'skip' : action}" data-action="${action}"` +
      ` aria-disabled="${!!busy}">${ACTION_LABEL[action] || action}${busy === action ? '…' : ''}</button>`).join('');
    const focused = actionButtons.contains(document.activeElement) ? document.activeElement.dataset.slot : null;
    if (setHtml(actionButtons, html) && focused) (actionButtons.querySelector(`[data-slot="${focused}"]`) || root).focus();
  }

  actionButtons.addEventListener('click', async e => {
    const button = e.target.closest('[data-action]');
    if (!button || button.getAttribute('aria-disabled') === 'true' || busy) return;
    const action = button.dataset.action, asked = generation;
    busy = action;
    actionMessage.textContent = '';
    renderActions();
    const result = await onAction(selection, task, action);
    if (asked !== generation) return;
    busy = null;
    if (result && !result.ok) actionMessage.textContent = `${ACTION_LABEL[action] || action} refused: ${result.error}`;
    renderActions();
  });

  function onFeed({ items, reset, missing }) {
    if (reset) { feed.replaceChildren(); groups = new Map(); }
    for (const item of items) appendItem(feed, groups, item);
    if (!feed.childElementCount) feed.innerHTML = `<p class="empty">${missing ? 'No session log yet.' : 'Nothing to show yet.'}</p>`;
    else if (items.length && following) feed.scrollTop = feed.scrollHeight;
  }

  async function loadReport() {
    const t = task, asked = generation, key = `${t.id}|${t.resultMtime}|${t.hasPrevious}`;
    if (reportKey === key) return;
    reportKey = key;
    let html = '<p class="empty">No report yet.</p>';
    if (t.resultMtime) {
      let text;
      try { text = await getFile(selection, t.id, 'result'); }
      catch { if (asked === generation && reportKey === key) reportKey = null; return; }   // not answered: the next poll retries
      html = text === null ? '<p class="empty">The report could not be read.</p>' : md(text);
    }
    if (asked !== generation || reportKey !== key) return;
    if (t.hasPrevious) html += `<details class="previous"><summary>Earlier attempt's report</summary><div class="previous-body"></div></details>`;
    const wasOpen = panels.report.querySelector('.previous')?.open;
    panels.report.innerHTML = html;
    const previous = panels.report.querySelector('.previous');
    previous?.addEventListener('toggle', loadPrevious);
    if (previous && wasOpen) previous.open = true;    // a reload keeps it open, and loads it again
  }

  async function loadPrevious(e) {
    const details = e.currentTarget, body = details.querySelector('.previous-body'), asked = generation;
    if (!details.open || body.childElementCount) return;
    const text = await getFile(selection, task.id, 'previous').catch(() => undefined);
    if (text === undefined || asked !== generation) return;
    body.innerHTML = text === null ? '<p class="empty">Missing.</p>' : md(text);
  }

  async function loadBrief() {
    const asked = generation;
    const text = await getFile(selection, task.id, 'brief').catch(() => undefined);
    if (text === undefined || asked !== generation) return;
    setHtml(panels.brief, text === null ? '<p class="empty">No brief file for this task.</p>' : md(text));
  }

  // Opens the drawer on `next`, a task of the run `sel`, on `nextTab`; without one, a drawer already open
  // keeps its tab.
  function open(sel, next, nextTab) {
    const wasOpen = !!task;
    if (!wasOpen || selection !== sel || task.id !== next.id) {
      stopFeed?.();
      generation++;
      selection = sel;
      busy = null;
      actionMessage.textContent = '';
      reportKey = null;
      groups = new Map();
      following = true;
      feed.replaceChildren();
      panels.report.replaceChildren();
      setHtml(panels.brief, '');
      stopFeed = readFeed(selection, next.id, onFeed);
    }
    task = next;
    renderHead();
    root.hidden = false;
    briefTab.hidden = task.kind === 'conflict';
    const wanted = nextTab || (wasOpen ? tab : 'activity');
    show(wanted === 'brief' && briefTab.hidden ? 'activity' : wanted);
    root.focus();
  }

  // A new snapshot of the run: new facts, and a new report if it changed. A task that left the run closes it.
  function update(detail) {
    if (!task) return;
    const next = entryOf(detail, task.id);
    if (!next) return close();
    task = next;
    renderHead();
    if (tab === 'report') loadReport();
  }

  function close() {
    if (!task) return;
    const hadFocus = root.contains(document.activeElement);
    stopFeed?.();
    stopFeed = null;
    generation++;
    task = null;
    selection = null;
    root.hidden = true;
    onClose(hadFocus);
  }

  return { open, update, close, get taskId() { return task ? task.id : null; } };
}

// A task of the run snapshot, or one of its conflict sessions, by id.
export function entryOf(detail, id) {
  return detail.tasks.find(t => t.id === id) || (detail.conflicts || []).find(c => c.id === id) || null;
}

// One feed item, as the old page showed it. A subagent's items go into a collapsible group of their own.
function appendItem(el, groups, item) {
  el.querySelector(':scope > .empty')?.remove();
  const time = item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  const ts = time ? `<span class="ts">${time}</span>` : '';
  let html = '';
  switch (item.k) {
    case 'session': html = `<div class="session-sep">Session · ${esc(item.t)}</div>`; break;
    case 'init': html = `<div class="session-sep">${esc(item.t)}</div>`; break;
    case 'text': html = `<div class="item">${ts}${md(item.t)}</div>`; break;
    case 'tool': html = `<div class="item tool">${ts}<span class="name">${esc(item.name)}</span> ${esc(item.t)}</div>`; break;
    case 'result': html = `<div class="result-item${item.error ? ' error' : ''}"><b>${item.error ? 'Session ended with an error' : 'Session finished'}</b>
      <span class="muted">· ${item.turns ?? '?'} turns · ${dur(item.ms)} · ${money(item.cost)}</span>${md(item.t)}</div>`; break;
    case 'agent': {
      const g = groups.get(item.id);
      if (g) g.querySelector('summary').textContent = `Subagent (${item.type || 'agent'}): ${item.t}`;
      return;
    }
    case 'agent-end': {
      const g = groups.get(item.id);
      if (g) g.querySelector('summary').textContent += ` · ${item.status}`;
      return;
    }
    case 'raw': html = `<div class="item tool">${esc(item.t)}</div>`; break;
    default: return;
  }
  let target = el;
  if (item.sub) target = (groups.get(item.sub) || makeGroup(el, groups, item.sub, 'Subagent')).querySelector('.body');
  target.insertAdjacentHTML('beforeend', html);
  if (item.k === 'tool' && (item.name === 'Agent' || item.name === 'Task') && !item.sub) makeGroup(el, groups, item.id, `Subagent: ${item.t}`);
}

function makeGroup(el, groups, id, label) {
  const g = document.createElement('details');
  g.className = 'agent';
  g.innerHTML = `<summary>${esc(label)}</summary><div class="body"></div>`;
  el.appendChild(g);
  groups.set(id, g);
  return g;
}
