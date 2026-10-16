// Runs a task queue: one fresh, headless Claude Code session per task, in order.
// Reads queue.json beside this file. Stops at the first task that does not report DONE;
// running this file again skips the finished tasks and resumes at that one.
// A session that ends without writing its report is resumed once to finish it.
// Tasks that queue.json puts in a parallel group run at the same time, each in its own git worktree
// and branch; when all of them are DONE, their branches are merged into the queue's branch in task order.
// A merge that conflicts is resolved by a session of its own, the conflict session.
// The monitor administers the queue through control.json beside this file (see readControl), and
// runner.lock keeps a second runner of the same run folder from starting.
// Usage: node run.mjs    Node's built-in modules and ./platform.mjs only; a port of runner.ps1.

// The monitor reads this marker in a run folder's copy: it offers admin actions only to runners that have it.
// task-queue control contract: 1

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { processTable, claudeCommand } from './platform.mjs';

// --parallel-task is set by the runner itself: it starts one copy of this file per task of a parallel group.
const parallelAt = process.argv.indexOf('--parallel-task');
const parallelTask = parallelAt >= 0 ? process.argv[parallelAt + 1] || '' : '';

// A headless session ends with its final answer, and Claude Code then kills the commands it left
// running in the background: a session that ends its turn to wait for a test run loses the run and
// never writes its report. So the sessions get no background tasks, and foreground commands get
// enough time for a full test suite.
const bashMaxMinutes = 60;
process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
process.env.BASH_DEFAULT_TIMEOUT_MS = '600000';
process.env.BASH_MAX_TIMEOUT_MS = `${bashMaxMinutes * 60000}`;

const SCRIPT = fileURLToPath(import.meta.url);
const root = path.dirname(SCRIPT);
const stripBom = text => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const queue = JSON.parse(stripBom(fs.readFileSync(path.join(root, 'queue.json'), 'utf8')));
const resultsDir = path.join(root, 'results');
const logsDir = path.join(root, 'logs');
for (const dir of [resultsDir, logsDir]) fs.mkdirSync(dir, { recursive: true });
const progressLog = path.join(root, 'progress.log');

// The text of a value as PowerShell's "$value" gives it, for the values queue.json and control.json hold.
const text = value => (value === null || value === undefined ? '' : String(value));

const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The monitor reads progress.log at any moment, and the sessions of a parallel group write here too:
// a write that finds the file busy is tried again.
function appendLine(file, line) {
    for (let attempt = 1; ; attempt++) {
        try { fs.appendFileSync(file, line + os.EOL); return; }
        catch (err) {
            if (attempt >= 20) throw err;
            sleepSync(50);
        }
    }
}

// The PowerShell console colours the runner used, as ANSI codes.
const COLORS = { White: 97, Cyan: 96, Green: 92, Red: 91, Yellow: 93, DarkGray: 90, DarkCyan: 36, DarkYellow: 33 };
const TTY = !!process.stdout.isTTY;

function show(line, color) {
    process.stdout.write(color && TTY ? `\x1b[${COLORS[color]}m${line}\x1b[0m\n` : `${line}\n`);
}

function stamp(date = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function say(message, color = 'White') {
    const stamped = `${stamp()}  ${message}`;
    show(stamped, color);
    appendLine(progressLog, stamped);
}

function describe(toolInput) {
    for (const key of ['file_path', 'command', 'pattern', 'description', 'url', 'skill', 'prompt']) {
        const value = toolInput?.[key];
        if (value) {
            let flat = (Array.isArray(value) ? value.join(' ') : String(value)).replace(/\s+/g, ' ').trim();
            if (flat.length > 110) flat = flat.slice(0, 110) + '...';
            return flat;
        }
    }
    return '';
}

function readTextOrNull(file) {
    try { return stripBom(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// A report's first line, trimmed, or null when there is no report or it is empty.
function readStatus(file) {
    const content = readTextOrNull(file);
    if (!content) return null;
    return content.split(/\r\n|\r|\n/)[0].trim();
}

// Statuses compare as runner.ps1 compared them: without regard to case.
const is = (status, word) => typeof status === 'string' && status.toUpperCase() === word;

const tasks = Array.isArray(queue.tasks) ? queue.tasks : queue.tasks == null ? [] : [queue.tasks];
const total = tasks.length;

// The script ends through this, so that the run lock is released on the way out (see the end).
class QueueExit { constructor(code) { this.code = code; } }
const quit = code => { throw new QueueExit(code); };

// The user's standing commands, written whole by the monitor only: `pause`; `skip`, the task ids to
// pass over; `resume`, per task id the session a hard stop cut off; and `retry`, per task id the retry the
// user asked for a failed or stopped task. The runner reads them before each sequential task, before each
// group and before each task's session starts, never while a session runs.
const controlFile = path.join(root, 'control.json');
const controlVersion = 1;
let controlIgnored = null;

// The control file's commands, or null when there are none: no file, or one this runner cannot read,
// which an admin line names (once, until the problem changes).
function readControl() {
    if (!fs.existsSync(controlFile)) return null;
    let problem = null, control = null;
    try {
        const content = readTextOrNull(controlFile) ?? '';
        control = content.trim() ? JSON.parse(content) : null;
        if (control === null) problem = 'it is empty';
        else if (text(control.version) !== `${controlVersion}`) problem = `version '${text(control.version)}' is not one this runner knows`;
    }
    catch { problem = 'it is not valid JSON'; }
    if (!problem) { controlIgnored = null; return control; }
    if (controlIgnored !== problem) say(`admin: control.json ignored (${problem})`, 'Yellow');
    controlIgnored = problem;
    return null;
}

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One-shot entries of the control file (`resume`, `retry`) are applied at most once: an entry whose id the
// runner's admin line for applying it names (`admin: <what> applied (task <id>, [mode <mode>, ]entry <id>)`)
// is used.
function entryUsed(entryId) {
    const log = readTextOrNull(progressLog);
    if (log === null) return false;
    return new RegExp(`  admin: \\S+ applied \\(task [A-Za-z0-9_-]+, (mode \\S+, )?entry ${escapeRegExp(entryId)}\\)\\r?$`, 'm').test(log);
}

const ENTRY_ID_RE = /^[A-Za-z0-9-]+$/;

// The unused `resume` entry the monitor wrote for a task its hard stop cut off, or null: the session to
// resume (`session`) and the entry's id (`id`).
function resumeEntryOf(task) {
    const control = readControl();
    if (!control || !control.resume) return null;
    const entry = control.resume[text(task.id)];
    if (!entry || !ENTRY_ID_RE.test(text(entry.id)) || !ENTRY_ID_RE.test(text(entry.session))) return null;
    if (entryUsed(text(entry.id))) return null;
    return entry;
}

// The unused `retry` entry the monitor wrote for a failed or stopped task, or null: the mode (`resume`, with
// the task's last session in `session`, or `fresh`), the entry's id (`id`) and the user's `note`.
function retryEntryOf(task) {
    const control = readControl();
    if (!control || !control.retry) return null;
    const entry = control.retry[text(task.id)];
    if (!entry || !ENTRY_ID_RE.test(text(entry.id)) || !/^(resume|fresh)$/i.test(text(entry.mode))) return null;
    if (/^resume$/i.test(text(entry.mode)) && !ENTRY_ID_RE.test(text(entry.session))) return null;
    if (entryUsed(text(entry.id))) return null;
    return entry;
}

// Ends the run cleanly here when the user asked for a pause; `where` names the place for the admin line.
// Exit code 0 tells a pause from a stop.
function testPause(where) {
    const control = readControl();
    if (!(control && control.pause === true)) return;
    say(`admin: pause applied (${where})`, 'Yellow');
    say('Queue - PAUSED (by the user)', 'Yellow');
    quit(0);
}

// Runs git in a directory and returns its output lines, stderr after stdout; the exit code is left in
// gitExit. Git reports progress on stderr, which must not stop the script.
let gitExit = 0;
function runGit(dir, gitArgs) {
    const result = spawnSync('git', ['-C', dir, ...gitArgs], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    gitExit = result.status ?? 1;
    return `${result.stdout || ''}${result.stderr || ''}`.split(/\r?\n/).filter((line, i, all) => i < all.length - 1 || line !== '');
}

// The parallel groups of queue.json: groupOf leads from a task id to its group, which is
// { label: '<first id>-<last id>', ids: its task ids in queue order }.
const groupOf = new Map();
let maxParallel = 5;
let queueProblem = null;
const position = new Map(tasks.map((t, i) => [text(t.id), i]));
if (queue.parallel !== null && queue.parallel !== undefined) {
    for (const entry of Array.isArray(queue.parallel) ? queue.parallel : [queue.parallel]) {
        let ids = (Array.isArray(entry) ? entry : [entry]).map(text);
        const named = `the group '${ids.join(', ')}'`;
        const unknown = ids.filter(id => !position.has(id));
        const taken = ids.filter(id => groupOf.has(id));
        if (!Array.isArray(entry) || ids.length < 2) { queueProblem = `${named} needs at least two task ids`; break; }
        if (unknown.length) { queueProblem = `${named} names task '${unknown[0]}', which is not in the queue`; break; }
        if (taken.length) { queueProblem = `${named} names task '${taken[0]}', which is already in another group`; break; }
        if (new Set(ids).size !== ids.length) { queueProblem = `${named} names a task twice`; break; }
        ids = [...ids].sort((a, b) => position.get(a) - position.get(b));
        if (position.get(ids.at(-1)) - position.get(ids[0]) !== ids.length - 1) { queueProblem = `the tasks of ${named} are not consecutive in the queue`; break; }
        const group = { label: `${ids[0]}-${ids.at(-1)}`, ids };
        for (const id of ids) groupOf.set(id, group);
    }
}
const hasGroups = groupOf.size > 0;
if (hasGroups && queue.maxParallel !== null && queue.maxParallel !== undefined && !queueProblem) {
    if (/^[1-9]\d*$/.test(text(queue.maxParallel))) maxParallel = Number(text(queue.maxParallel));
    else queueProblem = `maxParallel '${text(queue.maxParallel)}' is not a whole number from 1 up`;
}

const labelOf = task => `[${position.get(text(task.id)) + 1}/${total}] ${text(task.title)}`;
const resultOf = task => path.join(resultsDir, `${text(task.id)}.md`);
const branchOf = task => `queue/${path.basename(root)}/${text(task.id)}`;
const worktreeOf = task => path.join(root, 'wt', text(task.id));

function testBranch(task) {
    runGit(queue.workDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchOf(task)}`]);
    return gitExit === 0;
}

// What git status reports in a directory: nothing when everything there is committed.
const uncommitted = dir => runGit(dir, ['status', '--porcelain']);

// A parallel task that reported DONE but left changes uncommitted in its worktree is not done:
// the merge would drop them. Once its branch is merged and gone, the worktree no longer counts.
function testDone(task) {
    if (!is(readStatus(resultOf(task)), 'DONE')) return false;
    if (groupOf.has(text(task.id))) {
        const worktree = worktreeOf(task);
        if (fs.existsSync(worktree) && testBranch(task) && uncommitted(worktree).length) return false;
    }
    return true;
}

// The repository's ticket state file, .scratch/queue-state.json under workDir. A task whose queue.json entry has
// `ticket` (a picker queue's) gets its ticket's state written there: `running` at its starting line, `done` or
// `failed` with its verdict, `skipped` when a skip is applied. The runner, like the monitor, writes under the
// file's lock and changes only its own entry. A --parallel-task child writes nothing. A failure to write is logged
// to progress.log only, and the queue goes on.
const ticketExcludeLine = '.scratch/queue-state.json*';
const stateLockWaitSeconds = 10;
const stateLockStaleSeconds = 60;

// How many seconds old a state lock is: by the time it holds, or its file's time when it holds none.
function lockAge(lockFile, held) {
    let time = NaN;
    try {
        const value = JSON.parse(held)?.time;
        if (typeof value === 'string' && value) time = Date.parse(value);
    } catch { /* no time in it */ }
    if (Number.isNaN(time)) {
        try { time = fs.statSync(lockFile).mtimeMs; } catch { return 0; }
    }
    return (Date.now() - time) / 1000;
}

// Takes the state lock: created only if absent, retried for up to 10 s, and taken over when older than 60 s.
// Returns the lock's text, by which the writer knows its own lock.
async function lockState(lockFile) {
    const mine = JSON.stringify({ pid: process.pid, time: new Date().toISOString(), id: crypto.randomBytes(4).toString('hex') });
    const until = Date.now() + stateLockWaitSeconds * 1000;
    while (true) {
        try {
            const fd = fs.openSync(lockFile, 'wx');
            try { fs.writeSync(fd, mine); } finally { fs.closeSync(fd); }
            return mine;
        }
        catch (err) {
            if (err.code === 'ENOENT') throw new Error('its folder is missing');
            if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
        }
        let held = null;
        try { held = fs.readFileSync(lockFile, 'utf8'); } catch { /* gone meanwhile */ }
        if (held !== null && lockAge(lockFile, held) > stateLockStaleSeconds) {
            // Removed only while it still is the lock judged stale: another writer may have taken it over.
            unlockState(lockFile, held);
            continue;
        }
        if (Date.now() >= until) throw new Error('its lock file is held by another writer');
        await sleep(100);
    }
}

// Removes the lock while it holds `held`.
function unlockState(lockFile, held) {
    try { if (fs.readFileSync(lockFile, 'utf8') === held) fs.rmSync(lockFile, { force: true }); } catch { /* not ours any more */ }
}

// Adds the exclude line to the repository's info/exclude when it is not there yet. A folder that is not a git
// repository gets none.
function addTicketExclude() {
    const found = runGit(queue.workDir, ['rev-parse', '--git-path', 'info/exclude']);
    if (gitExit !== 0 || !found.length) return;
    let file = found[0];
    if (!path.isAbsolute(file)) file = path.join(queue.workDir, file);
    const content = readTextOrNull(file) ?? '';
    if (content.split(/\r?\n/).some(line => line.trim() === ticketExcludeLine)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lead = content && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(file, `${lead}${ticketExcludeLine}\n`);
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Writes the task's ticket state, tied to this run and the task's id; see above.
async function writeTicketState(task, state) {
    if (parallelTask || !task.ticket || !queue.workDir) return;
    const key = text(task.ticket);
    const stateFile = path.join(queue.workDir, '.scratch', 'queue-state.json');
    const lockFile = `${stateFile}.lock`;
    try {
        const mine = await lockState(lockFile);
        try {
            let doc;
            if (fs.existsSync(stateFile)) {
                const content = readTextOrNull(stateFile) ?? '';
                try { doc = content.trim() ? JSON.parse(content) : null; } catch { throw new Error('the state file is not valid JSON; it was left as it is'); }
                if (!isObject(doc)) throw new Error('the state file is not a JSON object; it was left as it is');
            }
            else {
                addTicketExclude();
                doc = { version: 1, tickets: {} };
            }
            if (!isObject(doc.tickets)) doc.tickets = {};
            const run = `${path.basename(path.dirname(root))}/${path.basename(root)}`;
            // The entry goes last, as runner.ps1's Add-Member -Force put it.
            delete doc.tickets[key];
            doc.tickets[key] = { state, run, task: text(task.id), updatedAt: new Date().toISOString() };
            // Written whole: a temporary file beside it, renamed over it. A reader may hold the file a moment.
            const temp = `${stateFile}.${process.pid}.tmp`;
            fs.writeFileSync(temp, `${JSON.stringify(doc, null, 2)}\n`);
            for (let attempt = 1; ; attempt++) {
                try { fs.renameSync(temp, stateFile); break; }
                catch (err) {
                    if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) { fs.rmSync(temp, { force: true }); throw err; }
                    await sleep(50);
                }
            }
        }
        finally { unlockState(lockFile, mine); }
    }
    catch (err) {
        appendLine(progressLog, `${stamp()}  ticket state: could not update ${key} (${err.message})`);
    }
}

// A task the user skipped has a report whose first line is SKIPPED; it counts as finished, as DONE does.
const testSkipped = task => is(readStatus(resultOf(task)), 'SKIPPED');

// Passes over a task that is not DONE when the user skipped it: it already has its SKIPPED report, or the
// control file lists it, and it gets that report now. Returns whether the task is skipped.
async function skipTask(task, control) {
    const label = labelOf(task);
    if (testSkipped(task)) {
        say(`${label} - already SKIPPED, passed over`, 'DarkGray');
        return true;
    }
    const skip = control ? (Array.isArray(control.skip) ? control.skip : control.skip == null ? [] : [control.skip]).map(text) : [];
    if (!skip.includes(text(task.id))) return false;
    const resultFile = resultOf(task);
    if (fs.existsSync(resultFile)) fs.renameSync(resultFile, path.join(resultsDir, `${text(task.id)}.previous.md`));
    fs.writeFileSync(resultFile, `SKIPPED${os.EOL}${os.EOL}Skipped by the user from the monitor, before the queue reached this task. The task was not run.${os.EOL}`);
    say(`admin: skip applied (task ${text(task.id)})`, 'Yellow');
    say(`${label} - SKIPPED (by the user)`, 'Yellow');
    await writeTicketState(task, 'skipped');
    return true;
}

function stopQueue(message) {
    say(message, 'Red');
    say('Fix the cause, then run this file again: finished tasks are skipped.', 'Yellow');
    quit(1);
}

function assertQueueBranch() {
    const inside = runGit(queue.workDir, ['rev-parse', '--is-inside-work-tree']);
    if (gitExit !== 0 || inside[0] !== 'true') stopQueue(`Parallel groups need a git repository, and ${text(queue.workDir)} is not one.`);
    runGit(queue.workDir, ['symbolic-ref', '--quiet', 'HEAD']);
    if (gitExit !== 0) stopQueue(`Parallel groups need a branch checked out in ${text(queue.workDir)}, and none is.`);
}

function modelArgs() {
    const extra = [];
    if (queue.model) extra.push('--model', text(queue.model));
    if (queue.effort) extra.push('--effort', text(queue.effort));
    return extra;
}

// Runs `claude` with the arguments in a directory, the input on its stdin, and calls onLine with each line
// of its stdout, read as UTF-8. Its stderr goes to the window. Resolves to its exit code.
async function runClaude(cliArgs, input, dir, onLine) {
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`the folder ${dir} does not exist`);
    const claude = claudeCommand();
    const child = spawn(claude.file, claude.argv(cliArgs), { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'], ...claude.options });
    const ended = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => resolve(code ?? 1));
    });
    // A claude that ends before reading its input is no error of the runner's.
    child.stdin.on('error', () => {});
    child.stdin.end(input + os.EOL);
    child.stdout.setEncoding('utf8');
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) onLine(line);
    return ended;
}

// Runs one claude call in a directory with the text on stdin, showing its messages and tool calls
// (not for a quiet session) and appending every event to the task's log. Sets sessionId, isError and
// cost, and returns the exit code. A resumed session's result reports the session's whole cost so far.
let sessionId = null, isError = true, cost = null, reportWritten = false;
async function invokeSession(label, input, cliArgs, logFile, dir, quiet) {
    isError = true;
    let sawSessionId = false;
    return runClaude(cliArgs, input, dir, line => {
        appendLine(logFile, line);
        let evt;
        try { evt = JSON.parse(line); } catch { if (!quiet) show(line, 'DarkYellow'); return; }
        if (!isObject(evt)) return;
        if (evt.session_id && !sawSessionId) {
            sawSessionId = true;
            if (evt.session_id !== sessionId) {
                sessionId = evt.session_id;
                say(`${label} - session ${sessionId}`, 'DarkGray');
            }
        }
        if (evt.type === 'assistant') {
            if (quiet) return;
            const content = evt.message?.content;
            for (const block of Array.isArray(content) ? content : []) {
                if (block?.type === 'text' && block.text) show(block.text);
                else if (block?.type === 'tool_use') show(`  > ${text(block.name)} ${describe(block.input)}`, 'DarkCyan');
            }
        }
        else if (evt.type === 'result') {
            isError = !!evt.is_error;
            if (evt.total_cost_usd !== null && evt.total_cost_usd !== undefined) cost = evt.total_cost_usd;
        }
    });
}

// The arguments of a session's call: a new session with that name, or with resumeId the
// continuation of an existing one.
function sessionArgs(dirArgs, name, resumeId) {
    const cliArgs = ['-p'];
    if (resumeId) cliArgs.push('--resume', resumeId);
    cliArgs.push('--output-format', 'stream-json', '--verbose',
        '--permission-mode', text(queue.permissionMode), '--permission-prompts', 'none', ...dirArgs);
    if (!resumeId) cliArgs.push('--name', name);
    return [...cliArgs, ...modelArgs()];
}

// The file's last write time to the nanosecond, as text, or null.
function writeTime(file) {
    try { return String(fs.statSync(file, { bigint: true }).mtimeNs); } catch { return null; }
}

// Runs a session to its report: the call, and the single resume when it ends without one. Returns
// what kept it from a DONE report, or null. A report that was already there counts only once the
// session has written it again; reportWritten says whether it has.
async function runSession(label, prompt, cliArgs, dirArgs, logFile, resultFile, dir, quiet) {
    const writtenBefore = writeTime(resultFile);
    let exitCode = await invokeSession(label, prompt, cliArgs, logFile, dir, quiet);
    let status = readStatus(resultFile);
    reportWritten = writeTime(resultFile) !== writtenBefore;

    // A session that ended cleanly without a report stopped too early, for example by ending its
    // turn to wait for something. Resume it once to finish the task and write the report.
    if (exitCode === 0 && !isError && (!reportWritten || !(is(status, 'DONE') || is(status, 'FAILED'))) && sessionId) {
        say(`${label} - no report yet, resuming the session once`, 'Yellow');
        const resumePrompt = `Your session ended before you wrote ${resultFile}, so the task is not finished. This session is headless: it ends with your final answer, and nothing wakes it up again; whatever was still running when it ended has stopped.

Finish the task now. Run again, in the foreground, whatever had not completed, then write ${resultFile} as your last step. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.`;
        exitCode = await invokeSession(label, resumePrompt, sessionArgs(dirArgs, '', sessionId), logFile, dir, quiet);
        status = readStatus(resultFile);
        reportWritten = writeTime(resultFile) !== writtenBefore;
    }

    if (exitCode !== 0 || isError || !reportWritten || !is(status, 'DONE')) {
        // The flag is written as PowerShell wrote a boolean.
        let reason = `exit code ${exitCode}, error flag ${isError ? 'True' : 'False'}, report status '${text(status)}'`;
        if (status && !reportWritten) reason += ', but the report was not written again';
        return reason;
    }
    return null;
}

// A cost rounded to cents as .NET's Math.Round rounds: a half goes to the even cent.
function roundCents(value) {
    const scaled = value * 100, floor = Math.floor(scaled), rest = scaled - floor;
    const cents = rest > 0.5 ? floor + 1 : rest < 0.5 ? floor : (floor % 2 === 0 ? floor : floor + 1);
    return cents / 100;
}

// How a finished session is named in its DONE line.
function sessionNote() {
    let costNote = '';
    if (cost) costNote = `, cost $${roundCents(Number(cost))}`;
    return `session ${sessionId}${costNote}`;
}

// The tasks of a group the user did not skip, in queue order.
const membersOf = group => group.ids.map(id => tasks[position.get(id)]).filter(t => !testSkipped(t));

// Runs one task: its session, the single resume when the session ends without a report, and the
// verdict. Writes the task's progress lines and returns whether the task is DONE. A parallel task
// runs in its worktree, quietly, and must leave nothing uncommitted there.
async function runTask(task) {
    const id = text(task.id);
    const index = position.get(id) + 1;
    const label = labelOf(task);
    const taskFile = path.join(root, 'tasks', `${id}.md`);
    const resultFile = resultOf(task);
    const previousFile = path.join(resultsDir, `${id}.previous.md`);
    const logFile = path.join(logsDir, `${id}.jsonl`);
    const group = groupOf.get(id);
    let sessionDir = queue.workDir;
    if (group) {
        // The same folder of the repository as the queue's working directory, inside the worktree.
        sessionDir = worktreeOf(task);
        const inRepository = (runGit(queue.workDir, ['rev-parse', '--show-prefix'])[0] || '').trim().replace(/^\/+|\/+$/g, '');
        if (inRepository) sessionDir = path.join(sessionDir, ...inRepository.split('/'));
    }

    let retryNote = '';
    if (fs.existsSync(resultFile)) fs.renameSync(resultFile, previousFile);
    if (fs.existsSync(previousFile)) {
        retryNote = `\nAn earlier attempt at this task stopped without finishing; its report is ${previousFile}. Its partial work may still be in the working tree - check before you start.`;
    }

    let commitNote = '';
    if (hasGroups) {
        commitNote = '\n\nThis queue runs some of its tasks in parallel, each in its own git worktree, and that only works from committed work. Commit your work before you finish, following this repository\'s own commit rules. Work left uncommitted stops the queue.';
    }
    let parallelNote = '';
    if (group) {
        const beside = membersOf(group).filter(t => text(t.id) !== id).map(t => `task ${position.get(text(t.id)) + 1} ('${text(t.title)}')`).join(', ');
        parallelNote = `

You run at the same time as ${beside}. They are working right now, each in its own worktree, and you cannot see their changes. Do not wait for their reports and do not rely on them; the reports of the tasks before yours are complete.

Your working directory is a fresh git worktree of the repository, on its own branch, ${branchOf(task)}; stay on that branch. A fresh worktree has no build outputs and no installed dependencies, so a missing build does not mean the repository is broken. Prepare what your task needs (restore packages, install dependencies) and no more.

The main checkout is ${text(queue.workDir)}. Files the repository does not track (tickets, notes, local settings) exist only there: read them there and update them there. Do not change tracked files in the main checkout: every change to a tracked file belongs in your worktree. When all parallel tasks are done, your branch is merged and your worktree is removed, so work left uncommitted in the worktree is lost.`;
    }

    // How every prompt of a task ends, a resumed session's too.
    const closing = `This session is headless: it ends with your final answer, and nothing wakes it up again. Background commands are turned off, so run every command in the foreground and wait for it; give slow ones, such as a full test suite, a timeout of up to ${bashMaxMinutes} minutes.

Before you finish, write ${resultFile}. Its first line is exactly DONE or FAILED. After it: what you did, how you verified it, and anything the next task or the user must know.`;

    const sessionName = `${text(queue.project)} - ${text(task.title)}`.replace(/"/g, "'");
    let prompt = `You are task ${index} of ${total} in an unattended queue. Nobody is watching this session and nobody can answer a question. The session is already named '${sessionName}'.

Your task is in: ${taskFile}
Reports from earlier tasks in this queue are in: ${resultsDir}${retryNote}${parallelNote}

Do the task completely, following this repository's own instructions (CLAUDE.md and what it points to). Where the task leaves a choice open, take the sensible default and record it in your report. If you reach a decision only the user can make, or something blocks you, stop there instead of guessing.${commitNote}

${closing}`;

    // --add-dir: the task file and the reports live outside the working directory, and an
    // unattended session cannot approve access to anything outside its directories. A parallel
    // session also needs the main checkout, where the repository's untracked files are.
    const dirArgs = ['--add-dir', root];
    if (group) dirArgs.push('--add-dir', text(queue.workDir));

    // A task the user retries from the monitor resumes its last session with the user's note, or starts over
    // in a new one, whose brief the server already ended with the note. Otherwise a task the user's hard stop
    // cut off resumes its own session, told why it stopped.
    let cliArgs = sessionArgs(dirArgs, sessionName);
    sessionId = null;
    let resume = null;
    const retry = retryEntryOf(task);
    if (retry) say(`admin: retry applied (task ${id}, mode ${text(retry.mode)}, entry ${text(retry.id)})`, 'Yellow');
    else resume = resumeEntryOf(task);
    if (retry && /^resume$/i.test(text(retry.mode))) {
        sessionId = text(retry.session);
        cliArgs = sessionArgs(dirArgs, '', sessionId);
        let earlier = 'It wrote no report.';
        if (fs.existsSync(previousFile)) earlier = `Its report is ${previousFile}.`;
        let userNote = '';
        if (text(retry.note).trim()) userNote = `\n\nThe user's note for this retry:\n\n${text(retry.note).trim()}`;
        prompt = `Your earlier attempt at this task did not finish. ${earlier} The user has asked, from the monitor, for the task to be tried again in this same session.${userNote}

Check the working tree before you go on: the earlier attempt's work may still be in it. Then carry on with your task; it is in ${taskFile}.${commitNote}

${closing}`;
    }
    else if (resume) {
        say(`admin: resume applied (task ${id}, entry ${text(resume.id)})`, 'Yellow');
        sessionId = text(resume.session);
        cliArgs = sessionArgs(dirArgs, '', sessionId);
        prompt = `The user stopped the queue from the monitor while you were working on your task, and has now continued it. Everything that was running in this session when it stopped was killed: a command may not have finished, and a file may have been left half-written. Check the working tree before you go on.

Carry on with your task where you left off; it is in ${taskFile}.${commitNote}

${closing}`;
    }

    say(`${label} - starting`, 'Cyan');
    await writeTicketState(task, 'running');
    cost = null;
    let reason = await runSession(label, prompt, cliArgs, dirArgs, logFile, resultFile, sessionDir, !!group);
    if (!reason && group) {
        const left = uncommitted(worktreeOf(task)).length;
        if (left) reason = `report status 'DONE', but ${left} uncommitted change(s) left in the worktree`;
    }
    if (reason) {
        say(`${label} - STOPPED (${reason})`, 'Red');
        await writeTicketState(task, 'failed');
        if (fs.existsSync(resultFile)) say(`Report: ${resultFile}`, 'Red');
        say(`Log: ${logFile}`, 'Red');
        if (sessionId) say(`Open the session: cd "${sessionDir}"; claude --resume ${sessionId}`, 'Yellow');
        return false;
    }

    say(`${label} - DONE (${sessionNote()})`, 'Green');
    await writeTicketState(task, 'done');
    return true;
}

function testMerging() {
    runGit(queue.workDir, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
    return gitExit === 0;
}

// Has the group's conflict session resolve the conflict that merging a task's branch ran into; the
// merge is in progress in the main checkout. A group has one conflict session, conflictSession, and a
// later conflict of the group resumes it. Returns null when the merge is committed and the main
// checkout clean; otherwise puts the main checkout back at its commit before this merge and returns
// why the merge step stops.
let conflictSession = null;
async function resolveConflict(group, task) {
    const label = `Group ${group.label} - conflict session`;
    const branch = branchOf(task);
    const named = `task ${position.get(text(task.id)) + 1} ('${text(task.title)}')`;
    const resultFile = path.join(resultsDir, `merge-${group.label}.md`);
    const previousFile = path.join(resultsDir, `merge-${group.label}.previous.md`);
    const logFile = path.join(logsDir, `merge-${group.label}.jsonl`);
    const dirArgs = ['--add-dir', root];
    const headless = `This session is headless: it ends with your final answer, and nothing wakes it up again. Background commands are turned off, so run every command in the foreground and wait for it; give slow ones, such as a full test suite, a timeout of up to ${bashMaxMinutes} minutes.`;
    // While the merge is in progress, HEAD is still the commit before it: what a failure goes back to.
    const queueBranch = runGit(queue.workDir, ['symbolic-ref', '--short', 'HEAD'])[0];
    const beforeMerge = runGit(queue.workDir, ['rev-parse', 'HEAD'])[0];

    let prompt, cliArgs;
    if (conflictSession) {
        prompt = `The queue went on merging the group, and the next branch conflicts too: ${branch}, the branch of ${named}. Its merge is in progress in your working directory.

Resolve this conflict as you did the earlier one: keep what every task intended, run the tests of what you touched, then commit the merge and leave nothing uncommitted. If it needs a decision only the user can make, or something blocks you, stop there instead of guessing and report FAILED.

${headless}

Before you finish, write ${resultFile} again, so that it covers this conflict and the earlier ones. Its first line is exactly DONE or FAILED.`;
        cliArgs = sessionArgs(dirArgs, '', conflictSession);
    }
    else {
        let retryNote = '';
        if (fs.existsSync(resultFile)) fs.renameSync(resultFile, previousFile);
        if (fs.existsSync(previousFile)) {
            retryNote = `\nThe report of an earlier conflict session for this group is ${previousFile}.`;
        }
        const members = membersOf(group);
        const beside = members.map(t => `task ${position.get(text(t.id)) + 1} ('${text(t.title)}')`).join(', ');
        const briefs = members.map(t => '  ' + path.join(root, 'tasks', `${text(t.id)}.md`)).join('\n');
        const reports = members.map(t => '  ' + resultOf(t)).join('\n');
        const sessionName = `${text(queue.project)} - Merge ${group.label}`.replace(/"/g, "'");
        prompt = `You are the conflict session of an unattended queue. Nobody is watching this session and nobody can answer a question. The session is already named '${sessionName}'.

The queue ran ${beside} at the same time, each in its own git worktree and branch, and is now merging their branches into ${text(queueBranch)}, in task order. Merging ${branch}, the branch of ${named}, ran into a conflict. That merge is in progress in your working directory.

What each task was asked to do:
${briefs}
What each task reports it did:
${reports}${retryNote}

Resolve the conflict so that what every task intended is kept, following this repository's own instructions (CLAUDE.md and what it points to). Run the tests of what you touched, then commit the merge and leave nothing uncommitted. If the conflict needs a decision only the user can make, or something blocks you, stop there instead of guessing and report FAILED: the queue then undoes the merge and keeps every branch.

${headless}

Before you finish, write ${resultFile}. Its first line is exactly DONE or FAILED. After it: which files conflicted, how you resolved each and why, how you verified it, and anything the next task or the user must know.`;
        cliArgs = sessionArgs(dirArgs, sessionName);
    }

    say(`${label} - starting`, 'Cyan');
    sessionId = conflictSession;
    cost = null;
    reportWritten = false;
    // A merge left in progress would stop every later run, so a failure of the runner itself is a
    // stop like any other: the merge is undone below.
    let failure;
    try { failure = await runSession(label, prompt, cliArgs, dirArgs, logFile, resultFile, text(queue.workDir), false); }
    catch (err) {
        if (err instanceof QueueExit) throw err;
        failure = `the runner failed: ${err.message}`;
    }
    conflictSession = sessionId;
    if (!failure) {
        runGit(queue.workDir, ['merge-base', '--is-ancestor', branch, 'HEAD']);
        const isMerged = gitExit === 0;
        const left = uncommitted(queue.workDir).length;
        if (testMerging()) failure = "report status 'DONE', but the merge is still in progress";
        else if (!isMerged) failure = `report status 'DONE', but branch ${branch} is not merged`;
        else if (left) failure = `report status 'DONE', but ${left} uncommitted change(s) left in the main checkout`;
    }
    if (!failure) {
        say(`${label} - DONE (${sessionNote()})`, 'Green');
        return null;
    }

    say(`${label} - STOPPED (${failure})`, 'Red');
    // A report from an earlier conflict that was not written again is not this conflict's report.
    if (reportWritten && fs.existsSync(resultFile)) say(`Report: ${resultFile}`, 'Red');
    say(`Log: ${logFile}`, 'Red');

    // The session may have left the merge in progress, committed it although it failed, or left
    // files behind. The main checkout goes back to its commit before this merge, so that the kept
    // branch is really unmerged and the next run can try the merge again. It was clean before the
    // merge, so whatever is untracked now came from the merge or the session.
    let ending = 'no merge was left to undo';
    const head = runGit(queue.workDir, ['rev-parse', 'HEAD'])[0];
    if (testMerging() || head !== beforeMerge || uncommitted(queue.workDir).length) {
        const onBranch = runGit(queue.workDir, ['symbolic-ref', '--short', '--quiet', 'HEAD'])[0];
        if (onBranch !== queueBranch) ending = `the merge could not be undone: the main checkout is no longer on ${text(queueBranch)}`;
        else {
            let undone = runGit(queue.workDir, ['reset', '--hard', beforeMerge]);
            if (gitExit === 0) undone = runGit(queue.workDir, ['clean', '-fd']);
            if (gitExit === 0) ending = 'the merge was undone';
            else ending = `the merge could not be undone: ${undone.at(-1) ?? ''}`;
        }
    }
    return `conflict merging task ${text(task.id)}, branch ${branch}; ${ending}`;
}

// Applies the user's skips to a group about to start, once: the tasks it lists that are not DONE get
// their SKIPPED report. A group that started in an earlier run (a branch of it, or a report other than
// SKIPPED) reads no skips again; its skipped tasks stay skipped. Returns the tasks left.
async function skipMembers(group) {
    const members = group.ids.map(id => tasks[position.get(id)]);
    const started = members.filter(t => testBranch(t) || (readStatus(resultOf(t)) && !testSkipped(t))).length;
    let control = null;
    if (!started) control = readControl();
    for (const id of group.ids) {
        const task = tasks[position.get(id)];
        if (!testDone(task)) await skipTask(task, control);
    }
    return membersOf(group);
}

// Runs the tasks in --parallel-task children of this file, started with this very node, at most
// maxParallel at a time; resolves when the last one has ended. The children write to this window.
function runChildren(todo) {
    return new Promise((resolve, reject) => {
        const waiting = [...todo];
        let running = 0;
        const next = () => {
            while (waiting.length && running < maxParallel) {
                const child = spawn(process.execPath, [SCRIPT, '--parallel-task', text(waiting.shift().id)],
                    { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
                running++;
                child.once('error', reject);
                child.once('exit', () => {
                    running--;
                    if (!waiting.length && !running) resolve();
                    else next();
                });
            }
        };
        next();
    });
}

// Runs a parallel group of two or more tasks the user did not skip, `members`: every task that is not done
// yet in its own worktree and branch, at most maxParallel at a time, then the merge step. Returns when
// the group is done and merged, and stops the queue otherwise.
async function runGroup(group, members) {
    const todo = members.filter(t => !testDone(t));
    for (const task of members) {
        if (!todo.includes(task)) say(`${labelOf(task)} - already DONE, skipped`, 'DarkGray');
    }
    if (!todo.length && !members.some(testBranch)) return;

    // The group's worktrees start from the main checkout's commit and its branches are merged into
    // the main checkout: uncommitted work there would be missing from the first and in the way of
    // the second.
    assertQueueBranch();
    if (testMerging()) {
        stopQueue(`Group ${group.label} - STOPPED (the main checkout ${text(queue.workDir)} has a merge in progress; commit it or run git merge --abort)`);
    }
    if (uncommitted(queue.workDir).length) {
        stopQueue(`Group ${group.label} - STOPPED (the main checkout ${text(queue.workDir)} has uncommitted or untracked files; commit or remove them)`);
    }

    if (todo.length) {
        say(`Group ${group.label} - starting (tasks ${members.map(t => text(t.id)).join(', ')})`, 'Cyan');
        runGit(queue.workDir, ['worktree', 'prune']);
        for (const task of todo) {
            const worktree = worktreeOf(task);
            if (fs.existsSync(worktree)) continue;
            const added = testBranch(task)
                ? runGit(queue.workDir, ['worktree', 'add', worktree, branchOf(task)])
                : runGit(queue.workDir, ['worktree', 'add', '-b', branchOf(task), worktree, 'HEAD']);
            if (gitExit !== 0) {
                stopQueue(`Group ${group.label} - STOPPED (no worktree for task ${text(task.id)}: ${added.at(-1) ?? ''})`);
            }
        }

        await runChildren(todo);

        const notDone = members.filter(t => !testDone(t)).map(t => text(t.id));
        if (notDone.length) {
            say(`Group ${group.label} - STOPPED (not DONE: ${notDone.join(', ')}; nothing was merged)`, 'Red');
            say('Fix the cause, then run this file again: finished tasks are skipped and the stopped ones continue in their worktrees.', 'Yellow');
            quit(1);
        }
    }

    // The merge step. A task is merged when its branch is gone.
    say(`Group ${group.label} - merging`, 'Cyan');
    const unmerged = members.filter(testBranch);
    conflictSession = null;
    for (const task of unmerged) {
        const branch = branchOf(task);
        const worktree = worktreeOf(task);
        const merged = runGit(queue.workDir, ['merge', '--no-edit', branch]);
        let reason = null;
        if (gitExit !== 0) {
            reason = `git merge of task ${text(task.id)}, branch ${branch}, failed: ${merged.at(-1) ?? ''}`;
            if (testMerging()) {
                say(`Group ${group.label} - conflict merging ${text(task.id)} (branch ${branch})`, 'Yellow');
                reason = await resolveConflict(group, task);
            }
        }
        if (reason) {
            say(`Group ${group.label} - merge STOPPED (${reason})`, 'Red');
            for (const kept of unmerged) {
                if (testBranch(kept)) say(`Kept: task ${text(kept.id)}, branch ${branchOf(kept)}, worktree ${worktreeOf(kept)}`, 'Red');
            }
            if (conflictSession) say(`Open the conflict session: cd "${text(queue.workDir)}"; claude --resume ${conflictSession}`, 'Yellow');
            say('Fix the cause, then run this file again: finished tasks are skipped and the merge is tried again.', 'Yellow');
            quit(1);
        }
        // A file held open can keep git from deleting the folder. The work is merged either way, so
        // the queue goes on and the leftovers are named.
        if (fs.existsSync(worktree)) runGit(queue.workDir, ['worktree', 'remove', '--force', worktree]);
        runGit(queue.workDir, ['worktree', 'prune']);
        runGit(queue.workDir, ['branch', '-d', branch]);
        if (fs.existsSync(worktree)) {
            say(`Group ${group.label} - could not remove the worktree ${worktree}; remove it by hand`, 'Yellow');
        }
        say(`Group ${group.label} - merged ${text(task.id)} (branch ${branch})`, 'Green');
    }
    say(`Group ${group.label} - merge DONE`, 'Green');
    const worktrees = path.join(root, 'wt');
    try { if (!fs.readdirSync(worktrees).length) fs.rmdirSync(worktrees); } catch { /* none, or not empty */ }
}

// One session of a parallel group: the runner started this copy of the file for it. Answers the exit code.
async function runParallelTask() {
    const task = tasks[position.get(parallelTask)];
    try { return (await runTask(task)) ? 0 : 1; }
    catch (err) {
        say(`${labelOf(task)} - STOPPED (the runner failed: ${err.message})`, 'Red');
        return 1;
    }
}

// The run lock: one runner per run folder. A lock naming a live runner stops this one before it writes
// anything; a lock left by a process that is gone, or reused by another program, does not.
const lockFile = path.join(root, 'runner.lock');
const caseless = process.platform === 'win32' || process.platform === 'darwin';
const fold = s => (caseless ? s.toLowerCase() : s);

// Whether a command line runs this file: by its full path, as the monitor and the skill start it, or as a
// bare `run.mjs` from its folder, which cannot be told from another folder's and so counts too.
function runsThisFile(commandLine) {
    if (fold(commandLine).includes(fold(SCRIPT))) return true;
    return /(^|[\s"'])(\.[\\/])?run\.mjs(["']|\s|$)/i.test(commandLine);
}

async function lockHolder() {
    const held = readTextOrNull(lockFile);
    if (held === null) return null;
    const holder = held.trim();
    if (!/^\d+$/.test(holder) || holder === String(process.pid)) return null;
    // A table that cannot be read leaves the lock to its holder: better no runner than two.
    const table = await processTable();
    if (!table) return holder;
    const proc = table.find(p => p.pid === Number(holder));
    if (!proc || !/^node(\.exe)?$/i.test(proc.name)) return null;
    if (/--parallel-task/.test(proc.commandLine) || !runsThisFile(proc.commandLine)) return null;
    return holder;
}

// Takes the lock: creates it, or replaces one whose holder is gone. Of two runners starting at once, the
// one whose process id the file holds afterwards goes on.
async function lockRun() {
    try {
        fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
        return null;
    }
    catch (err) {
        if (!['EEXIST', 'EPERM', 'EBUSY'].includes(err.code)) throw err;
        const holder = await lockHolder();
        if (holder) return holder;
        fs.writeFileSync(lockFile, String(process.pid));
        await sleep(200);
        const now = (readTextOrNull(lockFile) ?? '').trim();
        if (now !== String(process.pid)) return now;
        return null;
    }
}

// The queue, under the run lock. Answers the exit code: 0 when the queue ran to its end or paused, 1 otherwise.
async function runQueue() {
    const holder = await lockRun();
    if (holder) {
        show(`Another runner of this run folder is alive (process ${holder}), so this one exits. Continue the queue from the monitor once that runner has stopped.`, 'Red');
        return 1;
    }
    try {
        await runTasks();
        return 0;
    }
    catch (err) {
        if (err instanceof QueueExit) return err.code;
        show(`The runner failed: ${err?.message ?? err}`, 'Red');
        return 1;
    }
    finally {
        // A runner killed outright leaves its lock behind, naming a process that is gone.
        if ((readTextOrNull(lockFile) ?? '').trim() === String(process.pid)) fs.rmSync(lockFile, { force: true });
    }
}

async function runTasks() {
    if (TTY) process.stdout.write(`\x1b]0;Task queue: ${text(queue.project)} (${total} tasks)\x07`);
    say(`Queue ${root} - ${total} tasks, project ${text(queue.project)}, permission mode ${text(queue.permissionMode)}`, 'Cyan');
    testPause('at start');
    if (queueProblem) stopQueue(`queue.json: ${queueProblem}.`);
    if (hasGroups) assertQueueBranch();

    // A model without the requested mode (Haiku has no auto mode) silently starts in 'default',
    // where an unattended session is denied every write. Check once before spending a task on it.
    const preflightArgs = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
        '--permission-mode', text(queue.permissionMode), '--permission-prompts', 'none', ...modelArgs()];
    let actualMode = null, actualModel = null;
    await runClaude(preflightArgs, 'Reply with just OK', text(queue.workDir), line => {
        let evt;
        try { evt = JSON.parse(line); } catch { return; }
        if (evt?.subtype === 'init') { actualMode = evt.permissionMode; actualModel = evt.model; }
    });
    if (text(actualMode).toLowerCase() !== text(queue.permissionMode).toLowerCase()) {
        say(`Preflight: asked for permission mode '${text(queue.permissionMode)}', the session started in '${text(actualMode)}' (model ${text(actualModel)}). Change the model or the mode in queue.json and run again.`, 'Red');
        quit(1);
    }
    say(`Preflight: model ${text(actualModel)}, permission mode ${text(actualMode)}`, 'DarkGray');

    for (let i = 0; i < total; i++) {
        const task = tasks[i];
        const group = groupOf.get(text(task.id));
        if (group) {
            testPause(`before group ${group.label}`);
            // A group left with one task runs it as a sequential task, in the main checkout; a group left
            // with none is passed over, with no merge step.
            const left = await skipMembers(group);
            if (left.length >= 2) await runGroup(group, left);
            else if (left.length === 1) {
                const alone = left[0];
                groupOf.delete(text(alone.id));
                if (testDone(alone)) say(`${labelOf(alone)} - already DONE, skipped`, 'DarkGray');
                else if (!(await runTask(alone))) {
                    say('Fix the cause, then run this file again: finished tasks are skipped and this one starts over.', 'Yellow');
                    quit(1);
                }
            }
            else say(`Group ${group.label} - passed over (all its tasks skipped)`, 'DarkGray');
            testPause(`after group ${group.label}`);
            i += group.ids.length - 1;
            continue;
        }
        if (testDone(task)) {
            say(`${labelOf(task)} - already DONE, skipped`, 'DarkGray');
            continue;
        }
        if (await skipTask(task, readControl())) continue;
        testPause(`before task ${text(task.id)}`);
        if (!(await runTask(task))) {
            say('Fix the cause, then run this file again: finished tasks are skipped and this one starts over.', 'Yellow');
            quit(1);
        }
    }

    // A queue that finished with skipped tasks is not "all DONE".
    const skipped = tasks.filter(testSkipped).length;
    if (skipped) say(`Finished, ${skipped} skipped: ${total - skipped} of ${total} tasks DONE. Reports: ${resultsDir}`, 'Green');
    else say(`All ${total} tasks DONE. Reports: ${resultsDir}`, 'Green');
}

// The exit code is set rather than exited with, so that the window gets every line written before.
process.exitCode = parallelTask ? await runParallelTask() : await runQueue();
