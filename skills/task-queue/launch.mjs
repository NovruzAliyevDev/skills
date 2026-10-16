// Checks a run folder the task-queue skill wrote, and starts its queue.
// Reads queue.json back as the runner does, prints workDir and whether it exists, and checks that every task
// has its brief in tasks/<id>.md. Exits 1 naming each problem it finds, before launching anything.
// Without --check it then copies runner.mjs (as run.mjs) and platform.mjs in when they are missing, opens the
// runner in a window of its own, so the queue outlives the Claude session that started it, and makes sure a
// monitor of this plugin's version runs and opens it in the browser (ticket-queue's ensure-monitor.mjs).
// Usage: node launch.mjs [--check] <run folder>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openWindow } from './platform.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const folders = args.filter(a => a !== '--check');
if (folders.length !== 1 || !folders[0]) {
    console.log('Usage: node launch.mjs [--check] <run folder>');
    process.exit(1);
}
const runDir = path.resolve(folders[0]);

const problems = [];
const stripBom = text => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
let queue = null;
try {
    queue = JSON.parse(stripBom(fs.readFileSync(path.join(runDir, 'queue.json'), 'utf8')));
} catch (err) {
    // A single backslash in workDir is the usual cause: JSON reads it as an escape.
    problems.push(err.code ? `queue.json cannot be read: ${err.message}` : `queue.json is not valid JSON: ${err.message}`);
}

if (queue) {
    if (typeof queue.workDir !== 'string' || !queue.workDir) {
        problems.push('queue.json has no workDir');
    } else {
        const exists = fs.existsSync(queue.workDir) && fs.statSync(queue.workDir).isDirectory();
        console.log(`workDir: ${queue.workDir}`);
        console.log(`exists: ${exists}`);
        if (!exists) problems.push(`workDir is not an existing folder: ${queue.workDir}`);
    }
    const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
    if (!tasks.length) problems.push('queue.json has no tasks');
    for (const task of tasks) {
        const id = typeof task?.id === 'string' ? task.id : '';
        if (!id) { problems.push(`a task has no id: ${JSON.stringify(task)}`); continue; }
        if (!fs.existsSync(path.join(runDir, 'tasks', `${id}.md`))) problems.push(`task ${id} has no brief: ${path.join(runDir, 'tasks', `${id}.md`)} is missing`);
    }
}

if (problems.length) {
    for (const problem of problems) console.log(`Problem: ${problem}`);
    process.exit(1);
}
console.log(`${queue.tasks.length} task(s), each with its brief.`);
if (checkOnly) process.exit(0);

// The run folder keeps its own copy of the runner, so a later update of the plugin does not touch it.
for (const [from, to] of [['runner.mjs', 'run.mjs'], ['platform.mjs', 'platform.mjs']]) {
    if (fs.existsSync(path.join(runDir, to))) continue;
    fs.copyFileSync(path.join(HERE, from), path.join(runDir, to));
    console.log(`Copied ${from} in as ${to}.`);
}

const runner = path.join(runDir, 'run.mjs');
try {
    await openWindow({ title: `Task queue: ${path.basename(runDir)}`, cwd: runDir, command: process.execPath, args: [runner] });
} catch (err) {
    console.log(`The runner's window could not be opened (${err.message}). Run it by hand: node "${runner}"`);
    process.exit(1);
}
console.log(`The runner is starting in a new window: ${runner}`);

// The monitor starts hidden and outlives this process; ensure-monitor prints what it did and its exit code is ours.
const monitor = spawnSync(process.execPath, [path.join(HERE, '..', 'ticket-queue', 'ensure-monitor.mjs'), '--open', ''], { stdio: 'inherit' });
process.exit(monitor.status ?? 1);
