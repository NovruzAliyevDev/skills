// Web monitor for task-queue runs. It shows every run, and administers those whose runner copy supports it
// through one admin endpoint. No npm packages.
// Usage: node server.mjs [--open]    Root: $TASK_QUEUE_ROOT or ~/.claude-queues
import http from 'node:http';
import crypto from 'node:crypto';
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
// Admin requests must carry this server start's token, which the page gets with itself, and come from
// the page's own origin.
const TOKEN = crypto.randomBytes(24).toString('hex');
const ORIGINS = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
const BODY_MAX = 1024 * 1024;

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

// The runner runs each task of a parallel group in a child process, `run.ps1 ... -ParallelTask "<id>"`.
const PARALLEL_TASK_RE = /-ParallelTask\s+"?([A-Za-z0-9_-]+)"?/i;

// The run's runner process, and which tasks have a session process alive: a session of the runner itself
// belongs to the sequential task it runs (`main`), one of a parallel task's child process to that task
// (`tasks`). `tasks` lists the parallel tasks whose child process lives, each with whether its session does.
// Only the first four fields are answered by the API.
// A runner with the run lock (`locked`) is the process its lock names: the window the skill opens outlives
// the script in it (-NoExit), but the script removes its lock when it ends.
function runnerOf(runDir, locked = false) {
    if (!liveness.at) return { known: false };
    const script = path.join(runDir, 'run.ps1').toLowerCase();
    const isShell = p => /^(powershell|pwsh)\.exe$/i.test(p.Name);
    const scripts = liveness.processes.filter(p => isShell(p) && (p.CommandLine || '').toLowerCase().includes(script));
    const holder = locked ? lockHolder(runDir) : null;
    const runner = locked
        ? scripts.find(p => p.ProcessId === holder && !PARALLEL_TASK_RE.test(p.CommandLine))
        : scripts.find(p => !PARALLEL_TASK_RE.test(p.CommandLine));
    if (!runner) return { known: true, alive: false };
    const sessionOf = parent => liveness.processes.some(p => /^claude\.exe$/i.test(p.Name) && p.ParentProcessId === parent);
    const main = sessionOf(runner.ProcessId);
    const tasks = new Map();
    for (const child of scripts) {
        if (child.ParentProcessId !== runner.ProcessId) continue;
        const id = PARALLEL_TASK_RE.exec(child.CommandLine)?.[1];
        if (id) tasks.set(id, tasks.get(id) || sessionOf(child.ProcessId));
    }
    const session = main || [...tasks.values()].some(Boolean);
    return { known: true, alive: true, session, pid: runner.ProcessId, main, tasks };
}

// The runner facts /api/run answers, as before groups; the per-task facts show in the task states.
const publicRunner = ({ known, alive, session, pid }) => ({ known, alive, session, pid });

// --- Run folder files of the admin actions: the runner's marker, its lock, the control file. ---

// The control contract this server speaks; a run folder whose runner copy names it gets admin actions.
const CONTROL_VERSION = 1;
const MARKER_RE = /^# task-queue control contract: (\d+)\s*$/m;

function supportsAdmin(runDir) {
    const runner = readText(path.join(runDir, 'run.ps1'));
    return Number(MARKER_RE.exec(runner || '')?.[1]) === CONTROL_VERSION;
}

// The process id that runner.lock names, or null.
function lockHolder(runDir) {
    const text = readText(path.join(runDir, 'runner.lock'));
    return text && /^\s*\d+\s*$/.test(text) ? Number(text) : null;
}

const NO_COMMANDS = { version: CONTROL_VERSION, pause: false, skip: [], retry: {}, resume: {} };

// The user's standing commands. A missing control file means none; so does an unreadable one, and
// `problem` then says why it was ignored.
function readControl(runDir) {
    const text = readText(path.join(runDir, 'control.json'));
    if (text === null) return { control: { ...NO_COMMANDS }, problem: null };
    let control = null;
    try { control = text.trim() ? JSON.parse(text) : null; } catch { return { control: { ...NO_COMMANDS }, problem: 'it is not valid JSON' }; }
    if (!control || typeof control !== 'object') return { control: { ...NO_COMMANDS }, problem: 'it is empty' };
    // Compared as text, as the runner compares it.
    if (String(control.version) !== String(CONTROL_VERSION)) return { control: { ...NO_COMMANDS }, problem: `version '${control.version}' is not one this monitor knows` };
    return { control: { ...NO_COMMANDS, ...control }, problem: null };
}

// The task ids the control file lists to skip, as text.
const skipList = control => (Array.isArray(control.skip) ? control.skip : []).map(String);

// The server is the only writer of the control file, and replaces it whole: the runner never reads half
// of it.
function writeControl(runDir, control) {
    const file = path.join(runDir, 'control.json');
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ ...control, version: CONTROL_VERSION }, null, 2));
    withRetry(() => fs.renameSync(temp, file));
}

function stamp(date = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

// Appends a line to progress.log in the runner's format.
function appendProgress(runDir, message) {
    withRetry(() => fs.appendFileSync(path.join(runDir, 'progress.log'), `${stamp()}  ${message}\r\n`));
}

// Runners that Continue launched, by run folder: until a process snapshot taken after the launch shows the
// new runner, it counts as alive, so a second Continue cannot launch another. A runner that never shows
// up (its window failed to start) stops counting after STARTING_MS.
const launches = new Map();
const STARTING_MS = 30_000;

function starting(runDir, runner) {
    const at = launches.get(runDir);
    if (at && Date.now() - at < STARTING_MS && !(liveness.at > at && runner.alive)) return true;
    launches.delete(runDir);
    return false;
}

// Opens the run folder's runner in a new visible window, as the skill does. The hidden PowerShell that
// starts it ends at once. It must not be detached: without a console of its own, its Start-Process opens
// nothing.
function launchRunner(runDir) {
    const script = path.join(runDir, 'run.ps1').replace(/'/g, "''");
    const command = `Start-Process powershell.exe -ArgumentList '-NoExit', '-NoProfile', '-File', '"${script}"'`;
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
        { stdio: 'ignore', windowsHide: true }).unref();
    launches.set(runDir, Date.now());
}

// --- progress.log -> run and task states. ---

const LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})  (.*)$/;
const LABEL_RE = /^\[(\d+)\/(\d+)\] (.*?) - (starting|session (\S+)|DONE \(session (\S+?)(?:, cost \$([\d.]+))?\)|STOPPED \((.*)\)|already DONE, skipped|SKIPPED \(by the user\)|already SKIPPED, passed over)$/;

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

// The parallel groups of queue.json, as the runner reads them: task ids in queue order, the group named
// `<first id>-<last id>`. A group naming a task the queue lacks is left out; the runner refuses such a
// queue before any task starts.
function groupsOf(queue) {
    if (!Array.isArray(queue.parallel)) return [];
    const position = new Map((queue.tasks || []).map((t, i) => [t.id, i]));
    return queue.parallel
        .filter(g => Array.isArray(g) && g.length > 1 && g.every(id => position.has(id)))
        .map(g => [...g].sort((a, b) => position.get(a) - position.get(b)))
        .map(g => ({ id: `${g[0]}-${g[g.length - 1]}`, tasks: g }));
}

// A group's lines, as the README's progress line contract words them. Group ids are task ids joined by `-`.
const GROUP_LINE_RE = /^Group (\S+) - (.*)$/;
const CONFLICT_DONE_RE = /^DONE \(session (\S*?)(?:, cost \$([\d.]+))?\)$/;

// The conflict session's id, as its log and report are named: `merge-<group id>`.
const conflictIdOf = group => `merge-${group}`;

// Applies one group line to its group's merge step and to its conflict session. The merge is `waiting`
// until the group's merge step starts, `merging` while branches are merged, `resolving` from a conflict
// until the conflict session ends, then `merged` or `failed`. A merge step that starts again (a re-run)
// starts a new conflict session at its first conflict; a later conflict of the same step resumes it. A
// merge step that ends without a conflict leaves no conflict session from an earlier attempt to show.
function applyGroupLine(group, conflicts, time, rest) {
    group.seen = true;
    if (rest.startsWith('starting (')) { group.merge = 'waiting'; group.reason = null; return; }
    if (rest === 'merging') { Object.assign(group, { merge: 'merging', merged: [], reason: null, freshStep: true }); return; }
    if (rest === 'merge DONE') {
        group.merge = 'merged';
        if (group.freshStep) conflicts.delete(conflictIdOf(group.id));
        return;
    }
    let m = /^merged (\S+) \(/.exec(rest);
    if (m) { if (!group.merged.includes(m[1])) group.merged.push(m[1]); group.merge = 'merging'; return; }
    m = /^conflict merging (\S+) \(/.exec(rest);
    if (m) { group.merge = 'resolving'; group.conflictTask = m[1]; return; }
    m = /^merge STOPPED \((.*)\)$/.exec(rest);
    if (m) { Object.assign(group, { merge: 'failed', reason: m[1] }); return; }
    if (!rest.startsWith('conflict session - ')) return;
    const what = rest.slice('conflict session - '.length);
    const id = conflictIdOf(group.id);
    if (what === 'starting') {
        const fresh = group.freshStep || !conflicts.has(id);
        group.freshStep = false;
        const entry = fresh ? { id, kind: 'conflict', group: group.id, title: `Merge ${group.id}`, start: time, sessionId: null, cost: null } : conflicts.get(id);
        Object.assign(entry, { conflictTask: group.conflictTask ?? null, state: 'running', end: null, reason: null });
        conflicts.set(id, entry);
        return;
    }
    const entry = conflicts.get(id);
    if (!entry) return;
    if ((m = /^session (\S+)$/.exec(what))) entry.sessionId = m[1];
    else if ((m = CONFLICT_DONE_RE.exec(what))) {
        Object.assign(entry, { state: 'done', end: time, sessionId: m[1] || entry.sessionId, cost: m[2] ? Number(m[2]) : null });
        group.merge = 'merging';
    }
    else if ((m = /^STOPPED \((.*)\)$/.exec(what))) {
        Object.assign(entry, { state: /report status 'FAILED'/.test(m[1]) ? 'failed' : 'stopped', end: time, reason: m[1] });
    }
}

// What the page reads about a task's or conflict session's files: its report, the earlier attempt's, its
// session log.
function addFileFacts(runDir, entry) {
    const result = statOrNull(path.join(runDir, 'results', `${entry.id}.md`));
    const previous = statOrNull(path.join(runDir, 'results', `${entry.id}.previous.md`));
    const log = statOrNull(path.join(runDir, 'logs', `${entry.id}.jsonl`));
    entry.resultMtime = result ? result.mtimeMs : null;
    entry.hasPrevious = !!previous;
    entry.logSize = log ? log.size : 0;
    entry.lastActivity = log ? log.mtimeMs : null;
}

// Admin lines record what the user asked and what was applied; they say nothing about the run's own
// progress, except the pause.
const isAdminLine = message => message.startsWith('admin: ');
const PAUSED_LINE = 'Queue - PAUSED (by the user)';
// The final line of a queue that finished with skipped tasks, in place of "All N tasks DONE".
const FINISHED_WITH_SKIPS_RE = /^Finished, \d+ skipped: /;

// `control` is the run's control file (see readControl): a pause asked of a live runner makes it pausing,
// and a pending task it lists to skip is `skipPending`.
function deriveRun(runDir, queue, lines, runner, control = NO_COMMANDS) {
    const groups = groupsOf(queue);
    const groupOf = new Map(groups.flatMap(g => g.tasks.map(id => [id, g.id])));
    const merges = new Map(groups.map(g => [g.id, { id: g.id, merge: 'waiting', merged: [], reason: null, conflictTask: null, freshStep: false, seen: false }]));
    const conflicts = new Map();               // conflict session id -> its entry, in the order they started
    const tasks = (queue.tasks || []).map((t, i) => ({
        index: i + 1, id: t.id, title: t.title, state: 'pending',
        start: null, end: null, sessionId: null, cost: null, reason: null,
        ...(groups.length ? { group: groupOf.get(t.id) ?? null } : {}),
    }));
    // A run whose log holds only admin lines (a Continue not taken up yet) has not started.
    const runLines = lines.filter(l => !isAdminLine(l.message));
    let runState = runLines.length ? 'running' : 'not-started';
    let startedAt = runLines.length ? runLines[0].time : null;
    let preflight = null;
    for (const { time, message } of runLines) {
        if (message === PAUSED_LINE) { runState = 'paused'; continue; }
        if (message.startsWith('Queue ')) {
            runState = 'running';
            // A re-run tries a merge that did not end again, and a conflict session still open was cut off with
            // the runner before it.
            for (const g of merges.values()) if (g.merge !== 'merged') Object.assign(g, { merge: 'waiting', reason: null });
            for (const c of conflicts.values()) if (c.state === 'running') c.state = 'interrupted';
            continue;
        }
        if (message.startsWith('Preflight: model')) { preflight = message.slice('Preflight: '.length); continue; }
        if (message.startsWith('Preflight: asked')) { runState = 'preflight-failed'; preflight = message; continue; }
        if (message.startsWith('All ') && message.includes(' tasks DONE')) { runState = 'done'; continue; }
        if (FINISHED_WITH_SKIPS_RE.test(message)) { runState = 'finished-with-skips'; continue; }
        if (message.startsWith('Fix the cause')) { runState = 'stopped'; continue; }
        // A re-run starts a group again: a task of it still open from an earlier, killed run waits for its
        // child process (maybe for a free slot) and writes its starting line again when it gets one.
        const groupLine = GROUP_LINE_RE.exec(message);
        if (groupLine && merges.has(groupLine[1])) {
            const [, id, rest] = groupLine;
            if (rest.startsWith('starting (')) {
                for (const t of tasks) if (t.group === id && t.state === 'running') Object.assign(t, { state: 'pending', start: null });
            }
            applyGroupLine(merges.get(id), conflicts, time, rest);
            continue;
        }
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
        else if (what.startsWith('SKIPPED') || what.startsWith('already SKIPPED')) task.state = 'skipped';
    }

    // A group left with fewer than two tasks by skips has no merge step, and the task left runs as a
    // sequential task, in the runner's own process.
    const byId = new Map(tasks.map(t => [t.id, t]));
    const alone = [];                          // the task left in such a group
    for (const g of groups) {
        const left = g.tasks.filter(id => byId.get(id).state !== 'skipped');
        if (left.length > 1) continue;
        merges.get(g.id).merge = 'skipped';
        for (const id of left) { groupOf.delete(id); alone.push(byId.get(id)); }
    }

    // A task that started but has no final line is running only while its runner and session live: for a
    // parallel task, its own child process of the runner and that process's session. Each task is judged
    // on its own; the run is no-session only when no running task has a session. A process snapshot taken
    // before the last log line can't judge it (the runner, or a task's process, may have just started).
    // A conflict session runs in the runner's own process, as a sequential task does.
    const open = tasks.filter(t => t.state === 'running');
    const openConflicts = [...conflicts.values()].filter(c => c.state === 'running');
    const lastLineAt = lines.length ? parseLocal(lines[lines.length - 1].time) : 0;
    if (runState === 'running' && liveness.at > lastLineAt + 5000 && runner.known) {
        if (!runner.alive) runState = 'interrupted';
        else if (open.length || openConflicts.length) {
            for (const t of open) {
                if (!groupOf.has(t.id)) t.state = runner.main ? 'running' : 'no-session';
                else if (!runner.tasks.has(t.id)) t.state = 'interrupted';
                else t.state = runner.tasks.get(t.id) ? 'running' : 'no-session';
            }
            for (const c of openConflicts) c.state = runner.main ? 'running' : 'no-session';
            if (![...open, ...openConflicts].some(t => t.state === 'running')) runState = 'no-session';
        }
    }
    if (runState !== 'running' && runState !== 'no-session') for (const t of [...open, ...openConflicts]) t.state = 'interrupted';
    if ((runState === 'running' || runState === 'no-session') && control.pause === true) runState = 'pausing';

    for (const t of tasks) {
        t.hasBrief = !!statOrNull(path.join(runDir, 'tasks', `${t.id}.md`));
        addFileFacts(runDir, t);
    }
    for (const c of conflicts.values()) addFileFacts(runDir, c);
    const finishedAt = ['done', 'finished-with-skips', 'stopped', 'preflight-failed', 'interrupted', 'paused'].includes(runState) && runLines.length ? runLines[runLines.length - 1].time : null;
    const toSkip = new Set(skipList(control));
    for (const t of tasks) t.skipPending = t.state === 'pending' && toSkip.has(t.id);
    // A group has started once the runner wrote a line of it or one of its tasks left the queue line.
    const started = new Set(groups.filter(g => merges.get(g.id).seen ||
        g.tasks.some(id => !['pending', 'skipped'].includes(byId.get(id).state))).map(g => g.id));
    for (const t of tasks) t.groupStarted = !!t.group && started.has(t.group);
    // The task left alone runs as a sequential task, so it is shown without its group.
    for (const t of alone) t.group = null;
    // Runs with groups also answer each group's merge step, and the conflict sessions: task-like entries
    // that are not tasks, so they are left out of the tasks and their counts.
    const parallel = groups.length ? {
        groups: groups.map(g => {
            const { merge, merged, reason } = merges.get(g.id);
            return { ...g, merge, merged, reason };
        }),
        conflicts: [...conflicts.values()],
    } : {};
    return { state: runState, startedAt, finishedAt, preflight, tasks, ...parallel };
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

// Everything known about a run folder now: its log lines, runner, control file, derived states, and the
// admin actions it allows.
function snapshotOf(runDir, queue) {
    const lines = parseProgress(readText(path.join(runDir, 'progress.log')));
    const supported = supportsAdmin(runDir);
    const runner = runnerOf(runDir, supported);
    const { control, problem } = readControl(runDir);
    const detail = deriveRun(runDir, queue, lines, runner, control);
    const admin = adminOf(runDir, supported, detail, runner, control);
    for (const t of detail.tasks) delete t.groupStarted;
    return { lines, runner, control, problem, detail, admin };
}

const FINISHED = new Set(['done', 'finished-with-skips']);

// Why a task action is not allowed now, or null when it is. Skip needs a task that has not started, in no
// group that has started; un-skip a task marked to be skipped that has no SKIPPED report yet.
function taskRefusal(action, task, finished, control) {
    if (finished) return 'the run is finished';
    if (task.state === 'skipped') return 'the task is skipped: it has its SKIPPED report';
    const marked = skipList(control).includes(task.id);
    if (action === 'unskip') return marked ? null : 'the task is not marked to be skipped';
    if (marked) return 'the task is already marked to be skipped';
    if (task.state !== 'pending') return 'the task has started';
    if (task.groupStarted) return "the task's group has started";
    return null;
}

// The run-level admin actions allowed now, each with why it is not when it is not, and the same per task
// (`taskRefusals` by task id; each task's `actions` lists its allowed ones). The page shows these; the
// admin endpoint judges each request by the same rules.
function adminOf(runDir, supported, detail, runner, control) {
    for (const t of detail.tasks) t.actions = [];
    if (!supported) return { supported: false, actions: [], refusals: {}, taskRefusals: {} };
    const finished = FINISHED.has(detail.state);
    const launching = starting(runDir, runner);
    const alive = launching || (runner.known && runner.alive);
    const refusals = {};
    const refuse = (action, reason) => { if (reason) refusals[action] = reason; };
    const noRunner = !runner.known && !launching ? 'the process check is still pending' : !alive ? 'no runner of this run is alive' : null;
    refuse('pause', finished ? 'the run is finished' : noRunner || (control.pause ? 'a pause is already asked for' : null));
    refuse('cancel-pause', finished ? 'the run is finished' : noRunner || (!control.pause ? 'no pause is asked for' : null));
    refuse('continue', finished ? 'the run is finished'
        : !runner.known && !launching ? 'the process check is still pending'
        : launching ? 'the runner is starting' : alive ? 'a runner of this run is alive' : null);
    const actions = RUN_ACTIONS.filter(a => !refusals[a]);
    const taskRefusals = {};
    for (const t of detail.tasks) {
        taskRefusals[t.id] = Object.fromEntries(TASK_ACTIONS.map(a => [a, taskRefusal(a, t, finished, control)]).filter(([, why]) => why));
        t.actions = TASK_ACTIONS.filter(a => !taskRefusals[t.id][a]);
    }
    return { supported: true, actions, refusals, taskRefusals };
}

// A run with groups also answers how many merges have conflicted so far, so the page can notify each one.
function summarize(project, run, runDir, queue) {
    const { lines, detail } = snapshotOf(runDir, queue);
    const counts = {};
    for (const t of detail.tasks) counts[t.state] = (counts[t.state] || 0) + 1;
    const missingBriefs = detail.tasks.filter(t => !t.hasBrief).map(t => t.id);
    return {
        project, run, state: detail.state, total: detail.tasks.length, counts, missingBriefs,
        startedAt: detail.startedAt, finishedAt: detail.finishedAt,
        cost: [...detail.tasks, ...(detail.conflicts || [])].reduce((sum, t) => sum + (t.cost || 0), 0),
        ...(detail.groups ? { conflicts: lines.filter(l => /^Group \S+ - conflict merging /.test(l.message)).length } : {}),
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
    '/marked.min.js': ['marked.min.js', 'text/javascript; charset=utf-8'],
};

// The page's browser modules. The name is checked before anything touches the disk,
// so dots, slashes, backslashes and percent-encoded sequences never reach a file path.
const MODULE_RE = /^\/pixel\/([a-z0-9-]+)\.js$/;

function moduleFile(pathname) {
    const name = MODULE_RE.exec(pathname)?.[1];
    if (!name) return null;
    const file = path.join(HERE, 'pixel', `${name}.js`);
    return statOrNull(file)?.isFile() ? file : null;
}

// --- Admin actions: POST /api/admin { project, run, action }, with `task` for a task action. ---

const RUN_ACTIONS = ['pause', 'cancel-pause', 'continue'];
const TASK_ACTIONS = ['skip', 'unskip'];

// The body as text; it rejects a body over BODY_MAX once it has been read to its end and dropped, so that
// the sender gets the answer instead of a reset connection.
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size <= BODY_MAX) chunks.push(chunk);
        });
        req.on('end', () => size > BODY_MAX ? reject(new Error('too large')) : resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function sameToken(given) {
    const a = Buffer.from(String(given || '')), b = Buffer.from(TOKEN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Every action leaves an admin line, a refused one too. Runs that do not support admin actions are not
// touched at all.
async function handleAdmin(req, res) {
    if (!sameToken(req.headers['x-admin-token']) || !ORIGINS.has(req.headers.origin)) return send(res, 403, { error: 'forbidden' });
    let text;
    try { text = await readBody(req); } catch { return send(res, 413, { error: 'the request is too large' }); }
    let body;
    try { body = JSON.parse(text); } catch { return send(res, 400, { error: 'the request is not JSON' }); }
    if (!body || typeof body !== 'object') return send(res, 400, { error: 'the request is not a JSON object' });
    const { project, run, action, task } = body;
    if (typeof project !== 'string' || typeof run !== 'string' || !NAME_RE.test(project) || !NAME_RE.test(run)) return send(res, 400, { error: 'no valid project and run' });
    const forTask = TASK_ACTIONS.includes(action);
    if (!forTask && !RUN_ACTIONS.includes(action)) return send(res, 400, { error: `unknown action '${String(action)}'` });
    if (forTask && (typeof task !== 'string' || !TASK_ID_RE.test(task))) return send(res, 400, { error: 'no valid task' });
    const runDir = runDirFrom(new URLSearchParams({ project, run }));
    if (!runDir) return send(res, 404, { error: 'unknown run' });
    const queue = readQueue(runDir);
    if (!queue) return send(res, 404, { error: 'unreadable queue.json' });
    if (forTask && !(queue.tasks || []).some(t => t.id === task)) return send(res, 400, { error: `unknown task '${task}'` });

    await refreshLiveness();
    const { control, problem, admin } = snapshotOf(runDir, queue);
    if (!admin.supported) return send(res, 409, { error: "this run folder's runner copy predates admin actions" });
    if (problem) appendProgress(runDir, `admin: control.json ignored (${problem})`);
    const refusal = forTask ? admin.taskRefusals[task][action] : admin.refusals[action];
    if (refusal) {
        appendProgress(runDir, `admin: ${action} refused (${forTask ? `task ${task}: ` : ''}${refusal})`);
        return send(res, 409, { error: refusal });
    }

    if (action === 'pause') {
        writeControl(runDir, { ...control, pause: true });
        appendProgress(runDir, 'admin: pause requested');
    } else if (action === 'cancel-pause') {
        writeControl(runDir, { ...control, pause: false });
        appendProgress(runDir, 'admin: pause cancelled');
    } else if (action === 'continue') {
        // The new runner must not pause at once on a pause the user asked of the one before.
        if (control.pause) writeControl(runDir, { ...control, pause: false });
        appendProgress(runDir, 'admin: continue - run.ps1 launched in a new window');
        launchRunner(runDir);
    } else if (action === 'skip') {
        writeControl(runDir, { ...control, skip: [...skipList(control), task] });
        appendProgress(runDir, `admin: skip requested (task ${task})`);
    } else if (action === 'unskip') {
        writeControl(runDir, { ...control, skip: skipList(control).filter(id => id !== task) });
        appendProgress(runDir, `admin: unskip requested (task ${task})`);
    }
    return send(res, 200, { ok: true, action });
}

async function handle(req, res) {
    const url = new URL(req.url, URL_BASE);
    const isAdmin = url.pathname === '/api/admin';
    if (req.method !== (isAdmin ? 'POST' : 'GET')) return send(res, 405, { error: isAdmin ? 'POST only' : 'read-only' });
    // Only same-machine pages may call the API: refuse requests whose Host is not ours (DNS rebinding).
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host || '')) return send(res, 403, { error: 'forbidden host' });
    lastRequestAt = Date.now();
    if (isAdmin) return handleAdmin(req, res);

    // The page carries the admin token.
    if (url.pathname === '/') {
        const page = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
        const slot = '<meta name="admin-token" content="">';
        // A page without the slot would send every admin request without a token.
        if (!page.includes(slot)) return send(res, 500, { error: 'index.html has no admin-token meta tag' });
        return send(res, 200, page.replace(slot, `<meta name="admin-token" content="${TOKEN}">`), 'text/html; charset=utf-8');
    }
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
        const { lines, runner, detail, admin } = snapshotOf(runDir, queue);
        let commits = null;
        if (detail.startedAt && queue.workDir) {
            commits = await commitsFor(queue.workDir, detail.startedAt, detail.finishedAt, `${runDir}|${detail.finishedAt}`);
        }
        const settings = { workDir: queue.workDir, permissionMode: queue.permissionMode, model: queue.model, effort: queue.effort };
        return send(res, 200, { ...detail, settings, runner: publicRunner(runner), admin: { supported: admin.supported, actions: admin.actions },
            livenessAt: liveness.at, commits, progress: lines });
    }

    // A task of the queue, or the conflict session of one of its groups, whose log and report are named
    // like a task's; it has no brief.
    const taskId = url.searchParams.get('task');
    const known = (queue.tasks || []).some(t => t.id === taskId) || groupsOf(queue).some(g => conflictIdOf(g.id) === taskId);
    if (!taskId || !TASK_ID_RE.test(taskId) || !known) return send(res, 404, { error: 'unknown task' });

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
