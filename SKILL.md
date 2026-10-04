---
name: task-queue
description: Collect a list of tasks, then run them one after another, each in its own fresh headless Claude Code session, from a generated PowerShell script.
disable-model-invocation: true
---

Talk to the user in their language. Everything written to disk is English, except task text the user wrote themselves, which is copied as written.

Each task runs in a **fresh session**: it sees the repository, its `CLAUDE.md` and the task file, and nothing of this conversation. The runner (`runner.ps1` beside this file) runs the tasks in order and stops at the first one whose report does not start with `DONE`.

## 1. Collect the tasks

Ask for the list: one task per item, in the order they must run, as much detail per item as the user wants. Also offer the settings, each with its default:

- **permission mode**: `auto` (default), `acceptEdits`, `bypassPermissions`. `default`/`manual` cannot work unattended: nothing would approve a prompt.
- **model** and **effort**: unset by default, so each session uses the user's normal ones. `auto` needs a model that supports it; Haiku does not, and silently falls back to `default`. The runner's preflight catches this before the first task.

End the turn and wait. Done when the user has sent the list.

## 2. Turn each item into a brief

A **brief** is what a stranger to this conversation needs to do the task: goal, scope, where to look, and what proves it done. For every item:

- Resolve references the user made in shorthand ("ticket 62", "the palette thing") to concrete paths in the repository by looking them up. Write only what you found or what the user said; a reference you cannot resolve is a question for the user, asked now.
- Keep the user's own words in the brief, and add below them what you resolved.
- Give it a short title (a few words, no double quotes). The session is named `ProjectName - title`, where ProjectName is the project's name in CamelCase, as in this session's title.
- Name what proves it done, when the repository defines it (tests to run, a ticket's acceptance criteria).

Show the user the numbered titles, a one-line summary of each brief, the settings, and the working directory (this session's). Flag anything that looks like it cannot run unattended: a step only a person can do, or one that touches production or an external service. Done when the user confirms the list; apply their corrections and show it again until they do.

## 3. Write the run folder

Create `%USERPROFILE%\.claude-queues\<ProjectName>\<yyyyMMdd-HHmm>\` holding:

- `tasks\01.md`, `tasks\02.md`, ... : one brief each, headed by its title.
- `queue.json`, UTF-8:
  ```json
  {
    "project": "SupportPlatform",
    "workDir": "C:\\path\\to\\repo",
    "permissionMode": "auto",
    "model": null,
    "effort": null,
    "tasks": [ { "id": "01", "title": "Ticket 62 push handling" } ]
  }
  ```
- `run.ps1`: a copy of `runner.ps1` from this skill's folder, unchanged.

Done when every task in `queue.json` has its `tasks\<id>.md`.

## 4. Launch

Start it in its own window, so it outlives this session and the user can watch it. The inner double quotes are needed: `Start-Process` joins the arguments without quoting them.

```powershell
Start-Process powershell.exe -ArgumentList '-NoExit', '-NoProfile', '-File', '"<run folder>\run.ps1"'
```

Then start the monitor, a read-only web page for every queue under `%USERPROFILE%\.claude-queues` at `http://127.0.0.1:4747/`. It opens the browser. If the monitor is already running, the new process only opens the browser and exits.

```powershell
Start-Process node -ArgumentList '"<this skill''s folder>\monitor\server.mjs"', '--open' -WindowStyle Hidden
```

Then tell the user, briefly:

- the monitor at `http://127.0.0.1:4747/`: tasks and their states, the running session's activity, reports, commits, and browser notifications when a task finishes or the queue stops. It runs only on this computer and stops by itself after two idle hours with no queue running. To start it again: `node "<this skill's folder>\monitor\server.mjs" --open`;
- the run folder; `progress.log` there is the running record, `results\NN.md` each task's report, `logs\NN.jsonl` each session's full stream;
- the window shows each session's messages and tool calls live, and a red **STOPPED** line with the resume command when a task fails;
- after a stop: fix the cause, then run `run.ps1` again; finished tasks are skipped;
- the sessions work in this same working tree, so the user leaves the repository alone until the queue finishes.
