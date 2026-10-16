// Registers a repository with the task-queue monitor's ticket picker and prints its project name.
// Usage: node register.mjs <repository path>
// The register is repos.json in the queue root ($TASK_QUEUE_ROOT or ~/.claude-queues). A repository already
// there keeps its entry; paths compare as the platform module's samePath does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { samePath } = await import(pathToFileURL(path.join(HERE, '..', 'task-queue', 'platform.mjs')).href);

const given = process.argv[2];
if (!given) {
    console.error('Usage: node register.mjs <repository path>');
    process.exit(2);
}

const queueRoot = process.env.TASK_QUEUE_ROOT || path.join(os.homedir(), '.claude-queues');
fs.mkdirSync(queueRoot, { recursive: true });
const registerFile = path.join(queueRoot, 'repos.json');

// The full path, without a trailing separator (a drive or file system root keeps its own).
function normalize(p) {
    let r = path.resolve(p);
    while (r.length > 1 && /[\\/]$/.test(r) && !/^[A-Za-z]:\\$/.test(r)) r = r.slice(0, -1);
    return r;
}
const repoPath = normalize(given);

let repos = [];
if (fs.existsSync(registerFile)) {
    const text = fs.readFileSync(registerFile, 'utf8').replace(/^﻿/, '');
    const register = text.trim() ? JSON.parse(text) : null;
    if (register && Array.isArray(register.repos)) repos = register.repos;
}

const known = repos.find(r => typeof r?.path === 'string' && samePath(r.path, repoPath));
if (known) {
    console.log(known.project);
    process.exit(0);
}

// The folder name in CamelCase: words split at spaces, dashes, underscores and dots, characters outside the
// monitor's name pattern dropped, each word's first letter raised.
const words = path.basename(repoPath).split(/[\s._-]+/).map(w => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
const name = words.map(w => w[0].toUpperCase() + w.slice(1)).join('') || 'Repository';
const taken = new Set(repos.map(r => `${r?.project}`));
let project = name;
for (let n = 2; taken.has(project); n++) project = `${name}${n}`;

repos.push({ project, path: repoPath, addedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });

// Written whole: a temporary file, then a rename over the register.
const temp = `${registerFile}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify({ version: 1, repos }, null, 2)}\n`);
fs.renameSync(temp, registerFile);
console.log(project);
