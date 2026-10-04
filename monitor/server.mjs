// Read-only web monitor for task-queue runs. No npm packages.
// Usage: node server.mjs [--open]    Root: $TASK_QUEUE_ROOT or ~/.claude-queues
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.TASK_QUEUE_MONITOR_PORT || 4747);
const ROOT = process.env.TASK_QUEUE_ROOT || path.join(os.homedir(), '.claude-queues');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_BASE = `http://${HOST}:${PORT}/`;
const IDLE_EXIT_MS = 2 * 60 * 60 * 1000;
const LIVENESS_MS = 10_000;
const FEED_TEXT_MAX = 4000;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;

let lastRequestAt = Date.now();

// --- File access: open, read, close at once; the runner may append at any moment. ---

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function withRetry(fn) {
    for (let attempt = 1; ; attempt++) {
        try { return fn(); }
        catch (e) {
            if (e.code === 'ENOENT') return null;
            if (attempt >= 10 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
            sleepSync(30);
        }
    }
}

function stripBom(text) { return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; }

function readText(file) {
    const buf = withRetry(() => fs.readFileSync(file));
    return buf === null ? null : stripBom(buf.toString('utf8'));
}

function statOrNull(file) {
    try { return fs.statSync(file); } catch { return null; }
}

// Reads complete lines from `offset`; a trailing partial line is left for the next call.
function readLinesFrom(file, offset) {
    return withRetry(() => {
        const fd = fs.openSync(file, 'r');
        try {
            const size = fs.fstatSync(fd).size;
            if (offset > size) offset = 0;
            const buf = Buffer.alloc(size - offset);
            let read = 0;
            while (read < buf.length) {
                const n = fs.readSync(fd, buf, read, buf.length - read, offset + read);
                if (n === 0) break;
                read += n;
            }
            const end = buf.subarray(0, read).lastIndexOf(0x0a);
            if (end < 0) return { lines: [], offset, size };
            const lines = buf.subarray(0, end).toString('utf8').split('\n').map(l => l.replace(/\r$/, ''));
            if (offset === 0 && lines.length) lines[0] = stripBom(lines[0]);
            return { lines, offset: offset + end + 1, size };
        } finally { fs.closeSync(fd); }
    });
}

// --- Process table: which runners and task sessions are alive. ---

let liveness = { at: 0, processes: [] };
let livenessPending = null;

function refreshLiveness() {
    if (livenessPending) return livenessPending;
    const script = "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' OR Name='pwsh.exe' OR Name='claude.exe'\" | " +
        'Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress';
    livenessPending = new Promise(resolve => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
            { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
            (err, stdout) => {
                if (!err) {
                    try {
                        const parsed = stdout.trim() ? JSON.parse(stdout) : [];
                        liveness = { at: Date.now(), processes: Array.isArray(parsed) ? parsed : [parsed] };
                    } catch { /* keep the previous snapshot */ }
                }
                livenessPending = null;
                resolve(liveness);
            });
    });
    return livenessPending;
}

function ensureLiveness() {
    if (Date.now() - liveness.at > LIVENESS_MS) refreshLiveness();
}

function runnerOf(runDir) {
    if (!liveness.at) return { known: false };
    const script = path.join(runDir, 'run.ps1').toLowerCase();
    const runner = liveness.processes.find(p => /^(powershell|pwsh)\.exe$/i.test(p.Name) && (p.CommandLine || '').toLowerCase().includes(script));
    if (!runner) return { known: true, alive: false };
    const session = liveness.processes.some(p => /^claude\.exe$/i.test(p.Name) && p.ParentProcessId === runner.ProcessId);
    return { known: true, alive: true, session, pid: runner.ProcessId };
}

// --- progress.log -> run and task states. ---

const LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})  (.*)$/;
const LABEL_RE = /^\[(\d+)\/(\d+)\] (.*?) - (starting|session (\S+)|DONE \(session (\S+?)(?:, cost \$([\d.]+))?\)|STOPPED \((.*)\)|already DONE, skipped)$/;

function parseLocal(stamp) {
    const [d, t] = stamp.split(' ');
    const [y, mo, da] = d.split('-').map(Number);
    const [h, mi, s] = t.split(':').map(Number);
    return new Date(y, mo - 1, da, h, mi, s).getTime();
}

function parseProgress(text) {
    const lines = [];
    for (const raw of (text || '').split(/\r?\n/)) {
        const m = LINE_RE.exec(raw);
        if (m) lines.push({ time: m[1], message: m[2] });
    }
    return lines;
}

function deriveRun(runDir, queue, lines, runner) {
    const tasks = (queue.tasks || []).map((t, i) => ({
        index: i + 1, id: t.id, title: t.title, state: 'pending',
        start: null, end: null, sessionId: null, cost: null, reason: null,
    }));
    let runState = lines.length ? 'running' : 'not-started';
    let startedAt = lines.length ? lines[0].time : null;
    let preflight = null;
    for (const { time, message } of lines) {
        if (message.startsWith('Queue ')) { runState = 'running'; continue; }
        if (message.startsWith('Preflight: model')) { preflight = message.slice('Preflight: '.length); continue; }
        if (message.startsWith('Preflight: asked')) { runState = 'preflight-failed'; preflight = message; continue; }
        if (message.startsWith('All ') && message.includes(' tasks DONE')) { runState = 'done'; continue; }
        if (message.startsWith('Fix the cause')) { runState = 'stopped'; continue; }
        const m = LABEL_RE.exec(message);
        if (!m) continue;
        const task = tasks[Number(m[1]) - 1];
        if (!task) continue;
        const what = m[4];
        if (what === 'starting') Object.assign(task, { state: 'running', start: time, end: null, reason: null, cost: null });
        else if (what.startsWith('session')) task.sessionId = m[5];
        else if (what.startsWith('DONE')) Object.assign(task, { state: 'done', end: time, sessionId: m[6], cost: m[7] ? Number(m[7]) : null });
        else if (what.startsWith('STOPPED')) {
            const reason = m[8];
            Object.assign(task, { state: /report status 'FAILED'/.test(reason) ? 'failed' : 'stopped', end: time, reason });
        }
        else if (what.startsWith('already DONE')) { if (task.state !== 'done') task.state = 'done'; }
    }

    // A task that started but has no final line is running only while its runner and session live.
    // A process snapshot taken before the last log line can't judge it (the runner may have just started).
    const open = tasks.find(t => t.state === 'running');
    const lastLineAt = lines.length ? parseLocal(lines[lines.length - 1].time) : 0;
    if (runState === 'running' && liveness.at > lastLineAt + 5000) {
        if (runner.known && !runner.alive) runState = 'interrupted';
        else if (runner.known && runner.alive && open && !runner.session) runState = 'no-session';
    }
    if (open && runState !== 'running' && runState !== 'no-session') open.state = 'interrupted';
    if (open && runState === 'no-session') open.state = 'no-session';

    for (const t of tasks) {
        const result = statOrNull(path.join(runDir, 'results', `${t.id}.md`));
        const previous = statOrNull(path.join(runDir, 'results', `${t.id}.previous.md`));
        const log = statOrNull(path.join(runDir, 'logs', `${t.id}.jsonl`));
        t.hasBrief = !!statOrNull(path.join(runDir, 'tasks', `${t.id}.md`));
        t.resultMtime = result ? result.mtimeMs : null;
        t.hasPrevious = !!previous;
        t.logSize = log ? log.size : 0;
        t.lastActivity = log ? log.mtimeMs : null;
    }
    const finishedAt = ['done', 'stopped', 'preflight-failed', 'interrupted'].includes(runState) && lines.length ? lines[lines.length - 1].time : null;
    return { state: runState, startedAt, finishedAt, preflight, tasks };
}

function listRuns() {
    const runs = [];
    for (const project of safeReaddir(ROOT)) {
        const projectDir = path.join(ROOT, project);
        for (const run of safeReaddir(projectDir)) {
            const runDir = path.join(projectDir, run);
            const queue = readQueue(runDir);
            if (!queue) continue;
            runs.push(summarize(project, run, runDir, queue));
        }
    }
    return runs.sort((a, b) => (b.run.localeCompare(a.run)) || a.project.localeCompare(b.project));
}

function summarize(project, run, runDir, queue) {
    const detail = deriveRun(runDir, queue, parseProgress(readText(path.join(runDir, 'progress.log'))), runnerOf(runDir));
    const counts = {};
    for (const t of detail.tasks) counts[t.state] = (counts[t.state] || 0) + 1;
    const missingBriefs = detail.tasks.filter(t => !t.hasBrief).map(t => t.id);
    return {
        project, run, state: detail.state, total: detail.tasks.length, counts, missingBriefs,
        startedAt: detail.startedAt, finishedAt: detail.finishedAt,
        cost: detail.tasks.reduce((sum, t) => sum + (t.cost || 0), 0),
    };
}

function safeReaddir(dir) {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
    catch { return []; }
}

function readQueue(runDir) {
    const text = readText(path.join(runDir, 'queue.json'));
    if (text === null) return null;
    try { return JSON.parse(text); } catch { return null; }
}

// --- git log for the run's time window. ---

const commitCache = new Map();

function commitsFor(workDir, since, until, key) {
    const cached = commitCache.get(key);
    if (cached && Date.now() - cached.at < 15_000) return Promise.resolve(cached.value);
    const args = ['-C', workDir, 'log', '--all', '--source', `--since=${since}`, '--date=format-local:%Y-%m-%d %H:%M:%S',
        '--format=%h%x1f%ad%x1f%an%x1f%S%x1f%s'];
    if (until) args.push(`--until=${until}`);
    return new Promise(resolve => {
        execFile('git', args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 20_000 }, (err, stdout) => {
            const value = err ? { error: (err.message || '').split('\n')[0] } : {
                commits: stdout.split('\n').filter(Boolean).map(line => {
                    const [hash, date, author, ref, subject] = line.split('\x1f');
                    return { hash, date, author, ref: (ref || '').replace(/^refs\/(heads|remotes)\//, ''), subject };
                }),
            };
            commitCache.set(key, { at: Date.now(), value });
            resolve(value);
        });
    });
}

// --- Session stream (logs/NN.jsonl) -> compact feed items. ---

function describe(input) {
    for (const key of ['file_path', 'command', 'pattern', 'description', 'url', 'skill', 'prompt', 'query']) {
        if (input && input[key]) {
            const flat = String(input[key]).replace(/\s+/g, ' ').trim();
            return flat.length > 160 ? flat.slice(0, 160) + '...' : flat;
        }
    }
    return '';
}

function clip(text) { return text.length > FEED_TEXT_MAX ? text.slice(0, FEED_TEXT_MAX) + '\n...' : text; }

function toFeedItems(line) {
    let e;
    try { e = JSON.parse(line); } catch { return line.trim() ? [{ k: 'raw', t: clip(line) }] : []; }
    const sub = e.parent_tool_use_id || null;
    if (e.type === 'system') {
        if (e.subtype === 'session_title_changed') return [{ k: 'session', t: e.title, sid: e.session_id }];
        if (e.subtype === 'init') return [{ k: 'init', t: `${e.model}, ${e.permissionMode}`, sid: e.session_id }];
        if (e.subtype === 'task_started' && e.task_type === 'local_agent') return [{ k: 'agent', id: e.tool_use_id, t: e.description, type: e.subagent_type }];
        if (e.subtype === 'task_notification' && e.tool_use_id) return [{ k: 'agent-end', id: e.tool_use_id, status: e.status }];
        return [];
    }
    if (e.type === 'assistant' && e.message && Array.isArray(e.message.content)) {
        const items = [];
        for (const block of e.message.content) {
            if (block.type === 'text' && block.text && block.text.trim()) items.push({ k: 'text', t: clip(block.text), ts: e.timestamp, sub, mid: e.message.id });
            else if (block.type === 'tool_use') items.push({ k: 'tool', name: block.name, t: describe(block.input), id: block.id, ts: e.timestamp, sub });
        }
        return items;
    }
    if (e.type === 'result') {
        return [{ k: 'result', error: !!e.is_error, cost: e.total_cost_usd, ms: e.duration_ms, turns: e.num_turns, t: clip(String(e.result || '')) }];
    }
    return [];
}

function readFeed(runDir, taskId, offset) {
    const file = path.join(runDir, 'logs', `${taskId}.jsonl`);
    const chunk = readLinesFrom(file, offset);
    if (!chunk) return { items: [], offset: 0, size: 0, missing: true };
    return { items: chunk.lines.flatMap(toFeedItems), offset: chunk.offset, size: chunk.size, reset: offset > chunk.size };
}

// --- HTTP ---

function send(res, status, body, type = 'application/json; charset=utf-8') {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
}

function runDirFrom(query) {
    const project = query.get('project'), run = query.get('run');
    if (!project || !run || !NAME_RE.test(project) || !NAME_RE.test(run)) return null;
    const dir = path.join(ROOT, project, run);
    return statOrNull(path.join(dir, 'queue.json')) ? dir : null;
}

const STATIC = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/preview': ['preview.html', 'text/html; charset=utf-8'],
    '/marked.min.js': ['marked.min.js', 'text/javascript; charset=utf-8'],
};

// Browser modules of the pixel page. The name is checked before anything touches the disk,
// so dots, slashes, backslashes and percent-encoded sequences never reach a file path.
const MODULE_RE = /^\/pixel\/([a-z0-9-]+)\.js$/;

function moduleFile(pathname) {
    const name = MODULE_RE.exec(pathname)?.[1];
    if (!name) return null;
    const file = path.join(HERE, 'pixel', `${name}.js`);
    return statOrNull(file)?.isFile() ? file : null;
}

async function handle(req, res) {
    const url = new URL(req.url, URL_BASE);
    if (req.method !== 'GET') return send(res, 405, { error: 'read-only' });
    // Only same-machine pages may call the API: refuse requests whose Host is not ours (DNS rebinding).
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host || '')) return send(res, 403, { error: 'forbidden host' });
    lastRequestAt = Date.now();

    const asset = STATIC[url.pathname];
    if (asset) return send(res, 200, fs.readFileSync(path.join(HERE, asset[0])), asset[1]);
    if (url.pathname.startsWith('/pixel/')) {
        const file = moduleFile(url.pathname);
        return file ? send(res, 200, fs.readFileSync(file), 'text/javascript; charset=utf-8') : send(res, 404, { error: 'not found' });
    }

    if (url.pathname === '/api/health') return send(res, 200, { ok: true, root: ROOT });

    ensureLiveness();
    if (url.pathname === '/api/runs') return send(res, 200, { root: ROOT, livenessAt: liveness.at, runs: listRuns() });

    const runDir = runDirFrom(url.searchParams);
    if (!runDir) return send(res, 404, { error: 'unknown run' });
    const queue = readQueue(runDir);
    if (!queue) return send(res, 404, { error: 'unreadable queue.json' });

    if (url.pathname === '/api/run') {
        const lines = parseProgress(readText(path.join(runDir, 'progress.log')));
        const runner = runnerOf(runDir);
        const detail = deriveRun(runDir, queue, lines, runner);
        let commits = null;
        if (detail.startedAt && queue.workDir) {
            commits = await commitsFor(queue.workDir, detail.startedAt, detail.finishedAt, `${runDir}|${detail.finishedAt}`);
        }
        const settings = { workDir: queue.workDir, permissionMode: queue.permissionMode, model: queue.model, effort: queue.effort };
        return send(res, 200, { ...detail, settings, runner, livenessAt: liveness.at, commits, progress: lines });
    }

    const taskId = url.searchParams.get('task');
    if (!taskId || !TASK_ID_RE.test(taskId) || !(queue.tasks || []).some(t => t.id === taskId)) return send(res, 404, { error: 'unknown task' });

    if (url.pathname === '/api/feed') {
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        return send(res, 200, readFeed(runDir, taskId, offset));
    }
    if (url.pathname === '/api/file') {
        const kind = url.searchParams.get('kind');
        const rel = { brief: ['tasks', `${taskId}.md`], result: ['results', `${taskId}.md`], previous: ['results', `${taskId}.previous.md`] }[kind];
        if (!rel) return send(res, 400, { error: 'unknown kind' });
        const text = readText(path.join(runDir, ...rel));
        return text === null ? send(res, 404, { error: 'missing' }) : send(res, 200, { text });
    }
    return send(res, 404, { error: 'not found' });
}

function openBrowser() {
    spawn('cmd.exe', ['/c', 'start', '""', URL_BASE], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
        console.error(err);
        if (!res.headersSent) send(res, 500, { error: err.message });
    });
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Monitor already running at ${URL_BASE}`);
        if (process.argv.includes('--open')) openBrowser();
        process.exit(0);
    }
    throw err;
});

server.listen(PORT, HOST, () => {
    console.log(`Task queue monitor: ${URL_BASE} (root ${ROOT})`);
    if (process.argv.includes('--open')) openBrowser();
});

// Exit after two idle hours, unless a queue is still running.
setInterval(async () => {
    if (Date.now() - lastRequestAt < IDLE_EXIT_MS) return;
    await refreshLiveness();
    const root = ROOT.toLowerCase();
    const anyRunner = liveness.processes.some(p => /^(powershell|pwsh)\.exe$/i.test(p.Name) &&
        (p.CommandLine || '').toLowerCase().includes(root) && /run\.ps1/i.test(p.CommandLine || ''));
    if (!anyRunner) {
        console.log('Idle for 2 hours with no running queue; exiting.');
        process.exit(0);
    }
}, 5 * 60 * 1000).unref();
