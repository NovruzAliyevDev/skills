// Makes sure a task-queue monitor of this plugin's version answers on its port. A monitor that answers an
// older version, or none, is stopped and started again from this plugin's server.mjs, but only when the
// process listening on the port runs a server.mjs: runners and sessions are separate processes and live on.
// Prints what it did; exits 1 when the port is held by another program or the new monitor does not answer.
// Usage: node ensure-monitor.mjs [--port N] [--open <hash>]
// With --open, the monitor's page (with the hash, e.g. #new:OilCard) is opened in the browser once it answers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TASK_QUEUE = path.join(HERE, '..', 'task-queue');
const { portOwner, processTable, killProcesses, startHidden, openUrl } = await import(pathToFileURL(path.join(TASK_QUEUE, 'platform.mjs')).href);

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? '') : null; };
const port = Number(option('--port') || process.env.TASK_QUEUE_MONITOR_PORT || 4747);
const hash = option('--open');
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.log(`Not a port: ${option('--port')}`);
    process.exit(1);
}

const server = path.resolve(TASK_QUEUE, 'monitor', 'server.mjs');
const wanted = Number(/^const VERSION = (\d+);/m.exec(fs.readFileSync(server, 'utf8'))?.[1]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The version the monitor on the port answers: a number, 0 for none, or null when nothing answers.
async function versionOnPort() {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
        const health = await res.json();
        return Number.isInteger(health?.version) ? health.version : 0;
    } catch { return null; }
}

async function done(message) {
    console.log(message);
    if (hash !== null) {
        const tail = hash && !hash.startsWith('#') ? `#${hash}` : hash;
        try { await openUrl(`http://127.0.0.1:${port}/${tail}`); }
        catch (err) { console.log(`The browser could not be opened (${err.message}). Open http://127.0.0.1:${port}/${tail}`); }
    }
    process.exit(0);
}

const running = await versionOnPort();
if (running !== null && running >= wanted) await done(`The monitor (version ${running}) is running on port ${port}.`);

const owner = await portOwner(port);
if (owner) {
    const process_ = (await processTable())?.find(p => p.pid === owner);
    if (!/server\.mjs/.test(process_?.commandLine || '')) {
        console.log(`Port ${port} is held by ${process_?.name || 'a program'} (process ${owner}), which is not a task-queue monitor. Nothing was stopped.`);
        process.exit(1);
    }
    await killProcesses([owner]);
    for (let i = 0; i < 20 && await portOwner(port); i++) await sleep(250);
    const old = running ? `version ${running}` : 'no version';
    console.log(`Stopped the monitor on port ${port} (${old}, process ${owner}); running queues were not touched.`);
}

// Hidden, so it outlives this session. The server reads its port from the environment.
await startHidden({ command: process.execPath, args: [server], env: { ...process.env, TASK_QUEUE_MONITOR_PORT: String(port) } });
for (let i = 0; i < 30; i++) {
    const now = await versionOnPort();
    if (now !== null && now >= wanted) await done(`Started the monitor (version ${now}) on port ${port}.`);
    await sleep(500);
}
console.log(`The monitor did not answer on port ${port} within 15 seconds. Run: node "${server}"`);
process.exit(1);
