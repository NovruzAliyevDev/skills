// Everything that differs between Windows and macOS, for the monitor, the runner and the skills' helpers:
// the process table, killing processes, the process on a port, a visible terminal window, a hidden process,
// the browser, finding `claude`, and comparing paths. Nothing else in the plugin branches on the platform.
// Node's built-in modules only. On a platform other than win32 and darwin, the window and browser functions
// throw; the rest is written to be portable but is not promised there.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

function run(file, args, options = {}) {
    return new Promise(resolve => execFile(file, args, { windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024, ...options },
        (err, stdout, stderr) => resolve({ ok: !err, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout || '', stderr: stderr || '' })));
}

function unsupported(what) { return new Error(`${what} is not supported on ${process.platform}`); }

// --- Processes ---

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// `ps -o lstart` in the C locale: `Sat Oct 17 10:04:05 2026`, local time.
function parseLstart(text) {
    const m = /^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(text.trim());
    if (!m || !(m[1] in MONTHS)) return null;
    return new Date(Number(m[6]), MONTHS[m[1]], Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).getTime();
}

// Every process now: `{ pid, ppid, name, commandLine, created }`, or null when the table cannot be read. `name`
// is the executable's file name; `created` only grows with time, so a process created after another has a
// larger one (pids are reused on both platforms).
export async function processTable() {
    if (WIN) {
        const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ' +
            "@{ n = 'Created'; e = { if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 } } } | ConvertTo-Json -Compress";
        const { ok, stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
        if (!ok) return null;
        try {
            const parsed = JSON.parse(stdout);
            return (Array.isArray(parsed) ? parsed : [parsed]).map(p => ({
                pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name || '', commandLine: p.CommandLine || '', created: Number(p.Created) || 0,
            }));
        } catch { return null; }
    }
    // Two calls, joined by pid: `comm` and `command` may both hold spaces, so each gets a call of its own.
    const env = { ...process.env, LC_ALL: 'C' };
    const [heads, commands] = await Promise.all([
        run('ps', ['-axww', '-o', 'pid=,ppid=,lstart=,comm='], { env }),
        run('ps', ['-axww', '-o', 'pid=,command='], { env }),
    ]);
    if (!heads.ok || !commands.ok) return null;
    const commandOf = new Map();
    for (const line of commands.stdout.split('\n')) {
        const m = /^\s*(\d+)\s(.*)$/.exec(line);
        if (m) commandOf.set(Number(m[1]), m[2].trim());
    }
    const table = [];
    for (const line of heads.stdout.split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/.exec(line);
        if (!m) continue;
        const pid = Number(m[1]);
        const comm = m[4].trim();
        table.push({ pid, ppid: Number(m[2]), name: path.basename(comm), commandLine: commandOf.get(pid) ?? comm, created: parseLstart(m[3]) ?? 0 });
    }
    return table;
}

// Force-kills the processes; resolves once that has been asked of the system. A process already gone is no error.
export async function killProcesses(pids) {
    const list = [...new Set(pids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!list.length) return;
    if (WIN) {
        await run('taskkill', ['/F', ...list.flatMap(pid => ['/PID', String(pid)])]);
        return;
    }
    for (const pid of list) {
        try { process.kill(pid, 'SIGKILL'); } catch (err) { if (err.code !== 'ESRCH') throw err; }
    }
}

// The pid listening on the TCP port, or null.
export async function portOwner(port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`not a port: ${port}`);
    if (WIN) {
        const script = `Get-NetTCPConnection -LocalPort ${n} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`;
        const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
        const pid = Number(stdout.trim());
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    }
    const { stdout } = await run('lsof', ['-nP', `-iTCP:${n}`, '-sTCP:LISTEN', '-t']);
    const pid = Number(stdout.split('\n')[0].trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
}

// --- Windows and processes of our own ---

// One argument for a POSIX shell: single-quoted.
const shQuote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Opens a new visible terminal window that runs `command args` in `cwd` and stays open after it ends.
// Resolves once the window was asked for; rejects with the reason when it could not be.
export async function openWindow({ title, cwd, command, args = [] }) {
    if (WIN) {
        // cmd.exe parses its own line: a `"` cannot be quoted in it and `%` is expanded even inside quotes.
        for (const part of [cwd, command, ...args]) {
            if (/["%]/.test(String(part))) throw new Error(`a window cannot run an argument holding " or %: ${part}`);
        }
        const name = String(title || '').replace(/["%^&|<>]/g, '');
        const inner = [command, ...args].map(a => `"${a}"`).join(' ');
        // Not detached: a process without a console of its own opens no window with `start`.
        const line = `/d /c start "${name}" /D "${cwd}" cmd.exe /d /s /k "${inner}"`;
        await new Promise((resolve, reject) => {
            const child = spawn(process.env.ComSpec || 'cmd.exe', [line], { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
            child.on('error', reject);
            child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`start exited with code ${code}`))));
        });
        return;
    }
    if (MAC) {
        const shell = `cd ${shQuote(cwd)} && ${[command, ...args].map(shQuote).join(' ')}`;
        const asString = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        const { ok, stderr } = await run('osascript', ['-e', 'tell application "Terminal"', '-e', 'activate', '-e', `do script ${asString(shell)}`, '-e', 'end tell']);
        if (ok) return;
        if (/-1743/.test(stderr)) {
            throw new Error(`macOS did not allow ${path.basename(process.execPath)} to control Terminal: System Settings > Privacy & Security > Automation`);
        }
        throw new Error(`Terminal could not open a window: ${stderr.trim() || 'osascript failed'}`);
    }
    throw unsupported('opening a terminal window');
}

// Starts a process with no window that outlives this one. Resolves once it has been spawned.
export function startHidden({ command, args = [], env = process.env, cwd }) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, env, cwd });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(child.pid); });
    });
}

// Opens a URL in the user's browser.
export async function openUrl(url) {
    if (!/^https?:\/\/[^\s"]+$/.test(url)) throw new Error(`not a web address: ${url}`);
    let child;
    if (WIN) child = spawn(process.env.ComSpec || 'cmd.exe', [`/d /c start "" "${url.replace(/%/g, '%%')}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    else if (MAC) child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    else throw unsupported('opening the browser');
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
    child.unref();
}

// --- claude ---

// cmd.exe's metacharacters; an argument of a batch file is escaped twice, since the batch file's %* is
// parsed again (the rules cross-spawn follows).
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

function cmdArgument(arg, batch) {
    let quoted = `${arg}`.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
    quoted = `"${quoted}"`.replace(CMD_META, '^$1');
    return batch ? quoted.replace(CMD_META, '^$1') : quoted;
}

function findOnPath(names) {
    for (const dir of (process.env.PATH || process.env.Path || '').split(path.delimiter)) {
        if (!dir) continue;
        for (const name of names) {
            const file = path.join(dir.replace(/^"(.*)"$/, '$1'), name);
            try { if (fs.statSync(file).isFile()) return file; } catch { /* not here */ }
        }
    }
    return null;
}

// How to run `claude`, found on the PATH: `{ file, viaShell, argv(args), options }`. Spawn `file` with
// `argv(args)` and `options` merged into the spawn options. A Windows `.cmd` or `.bat` runs through cmd.exe
// with every argument quoted by cmd's rules, so that any text reaches `claude` unchanged. Throws when no
// `claude` is found.
export function claudeCommand() {
    const found = findOnPath(WIN ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude']);
    if (!found) throw new Error('claude was not found on the PATH');
    if (!WIN || /\.exe$/i.test(found)) return { file: found, viaShell: false, argv: args => [...args], options: {} };
    const command = found.replace(CMD_META, '^$1');
    return {
        file: process.env.ComSpec || 'cmd.exe',
        viaShell: true,
        argv: args => ['/d', '/s', '/c', `"${[command, ...args.map(a => cmdArgument(a, true))].join(' ')}"`],
        options: { windowsVerbatimArguments: true },
    };
}

// --- Paths ---

// Two paths compared as the platform's file system usually does: without a trailing separator, and ignoring
// case on Windows and macOS (macOS volumes ignore case by default).
export function samePath(a, b) {
    const norm = p => {
        let r = path.resolve(String(p));
        while (r.length > 1 && /[\\/]$/.test(r) && !/^[A-Za-z]:\\$/.test(r)) r = r.slice(0, -1);
        return WIN || MAC ? r.toLowerCase() : r;
    };
    return norm(a) === norm(b);
}
