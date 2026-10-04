// Everything around the scene: the sidebar's run list and the shared text helpers.

export const STATE_LABEL = {
  'pending': 'pending', 'running': 'running', 'done': 'DONE', 'failed': 'FAILED', 'stopped': 'STOPPED',
  'interrupted': 'interrupted', 'no-session': 'runner has no session', 'not-started': 'not started',
  'preflight-failed': 'preflight failed',
};

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function badge(state) { return `<span class="badge s-${esc(state)}">${esc(STATE_LABEL[state] || state)}</span>`; }
function money(v) { return v ? `$${v.toFixed(2)}` : ''; }
export function runKey(r) { return `${r.project}/${r.run}`; }

const rendered = new WeakMap();

// Rewritten only when something shown changed, and a focused entry gets its focus back,
// so polling never disturbs a keyboard or screen-reader user.
export function renderRunList(el, runs, selectedKey) {
  const html = runs.map(r => {
    const key = runKey(r);
    const missing = r.missingBriefs.length
      ? ` <span aria-hidden="true" title="missing briefs: ${esc(r.missingBriefs.join(', '))}">⚠</span><span class="sr-only">, missing briefs: ${esc(r.missingBriefs.join(', '))}</span>`
      : '';
    return `<button type="button" class="run-item" data-key="${esc(key)}"${key === selectedKey ? ' aria-current="true"' : ''}>
      <span class="name">${esc(r.project)} <span class="muted">${esc(r.run)}</span>${missing}</span>
      <span class="meta">${badge(r.state)}<span>${r.counts.done || 0}/${r.total} done</span><span>${money(r.cost)}</span></span>
    </button>`;
  }).join('') || '<p class="empty">No runs found.</p>';
  if (rendered.get(el) === html) return;
  rendered.set(el, html);
  const focused = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  el.innerHTML = html;
  if (focused) [...el.querySelectorAll('[data-key]')].find(b => b.dataset.key === focused)?.focus();
}

export function onRunChosen(el, choose) {
  el.addEventListener('click', e => {
    const item = e.target.closest('[data-key]');
    if (item) choose(item.dataset.key);
  });
}
