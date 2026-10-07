---
name: task-queue
description: Collect a list of tasks, then run them in order, each in its own fresh headless Claude Code session, from a generated PowerShell script. Tasks the user marks as a group run in parallel, in git worktrees.
disable-model-invocation: true
---

You prepare and launch the queue; you never do any part of the tasks themselves. Your work is checking that each task is clear enough for an unattended session, and the answers, findings and research all belong to that session.

Talk to the user in their language. Everything written to disk is English, except task text the user wrote themselves, which is copied as written.

Each task runs in a **fresh session**: it sees the repository, its `CLAUDE.md` and the task file, and nothing of this conversation. The runner (`runner.ps1` beside this file) runs the tasks in order and stops at the first one whose report does not start with `DONE`. Its sessions cannot run background commands, which would die when a headless session ends, and a session that ends without writing a report is resumed once to write it.

A **group** is two or more consecutive tasks the user marked to run in parallel. The runner starts them together, each in its own git worktree and branch, and once all of them are `DONE` merges their branches into the queue's branch in task order. A merge conflict goes to a **conflict session**, a headless session of its own. Groups come only from the user's notation: never propose or create one.

## 1. Collect the tasks

Ask for the list: one task per item, in the order they must run, as much detail per item as the user wants. Also offer the settings, each with its default:

- **permission mode**: `auto` (default), `acceptEdits`, `bypassPermissions`. `default`/`manual` cannot work unattended: nothing would approve a prompt.
- **model** and **effort**: unset by default, so each session uses the user's normal ones. `auto` needs a model that supports it; Haiku does not, and silently falls back to `default`. The runner's preflight catches this before the first task.
- **maxParallel**: the most sessions a group runs at once, a whole number from 1 up, default 5. A larger group starts its remaining tasks as running ones finish. It matters only when the list declares groups.

End the turn and wait. Done when the user has sent the list.

## 2. Read the groups

The list may end with the **group notation**: double brackets holding one or more groups, each a comma-separated list of numbers, such as `[[9,10]]` or `[[3,4],[9,10,11]]`. A number is an item's position in the user's list, counting from 1, and resolves to that item's task id: the position as two digits (`9` → `"09"`). A list without the notation has no groups; skip to step 3.

A notation written another way whose meaning is unambiguous, such as `parallel: [1,2,3]` for `[[1,2,3]]`, is accepted: state how you read it when you show the list in step 3.

Check every group. Ask the user, and wait for the answer, when a group:

- has only one task;
- names a number that is not in the list;
- has numbers that are not consecutive (`[[3,9]]`), or names one twice;
- shares a task with another group.

Ask the same way when **maxParallel** is not a whole number from 1 up. Quote the user's notation and name the items it refers to; the user decides the fix. Done when every group has two or more consecutive tasks that exist and no task is in two groups, and **maxParallel** is valid. The runner applies the same checks and stops before the first session if one fails.

## 3. Turn each item into a brief

A **brief** is what a stranger to this conversation needs to do the task: goal, scope, where to look, and what proves it done. It holds the user's words, what they mean, the resolved paths, the scope and the done-criterion, and nothing of the answer. For every item:

- Resolve references the user made in shorthand ("ticket 62", "the palette thing", a misspelt skill name) to concrete paths by looking up names and locations only. Opening a file to learn what it says is the task's work, left to its session. Write only what you found or what the user said; a reference you cannot resolve is a question for the user, asked now.
- Keep the user's own words in the brief, and add below them what you resolved.
- Give it a short title (a few words, no double quotes). The session is named `ProjectName - title`, where ProjectName is the project's name in CamelCase, as in this session's title.
- Name what proves it done, when the repository defines it (tests to run, a ticket's acceptance criteria).

When there are groups, first check the working directory with `git rev-parse --is-inside-work-tree` and `git symbolic-ref --quiet HEAD`: it must be a git repository with a branch checked out. If it is not, say so when you show the list and ask whether to drop the groups.

Your checks are exactly these: each task is clear and unambiguous, its shorthand is resolved, the group notation is valid, the settings are valid, and nothing in it needs a person or touches production or an external service. A risk you suspect (a file outside the working directory, a tool the permission mode may refuse) is a flag in the list for the user, left untested.

Show the user the numbered titles, a one-line summary of each brief saying what the task asks (its answer stays with the task's session), the settings, and the working directory (this session's). Mark each group in the list, for example by bracketing its tasks under a `Group 09-10, in parallel` line. When there are groups, state that every task, sequential ones included, will be asked to commit its work following the repository's own commit rules, and that a group starts only from a main checkout with nothing uncommitted or untracked.

Flag anything that looks like it cannot run unattended: a step only a person can do, or one that touches production or an external service. Done when the user confirms the list; apply their corrections and show it again until they do. A correction that adds, drops or moves items changes what the group numbers point at: check the groups again as in step 2 and ask about any that moved.

## 4. Write the run folder

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
    "parallel": [ ["02", "03"] ],
    "maxParallel": 5,
    "tasks": [
      { "id": "01", "title": "Ticket 62 push handling" },
      { "id": "02", "title": "Ticket 63 export dialog" },
      { "id": "03", "title": "Ticket 64 audit log" }
    ]
  }
  ```
  `parallel` holds one list per group, its task ids in ascending order, and `maxParallel` the setting. When the list declares no groups, leave both fields out. Every backslash in `workDir` is doubled, as in the example: a single one is an invalid JSON escape, and the runner exits before its first line.
- `run.ps1`: a copy of `runner.ps1` from this skill's folder, unchanged.

Then read `queue.json` back the way the runner does, and fix the file until this prints the repository's path and `True`:

```powershell
$q = Get-Content -Raw -Encoding UTF8 '<run folder>\queue.json' | ConvertFrom-Json; $q.workDir; Test-Path $q.workDir
```

Done when that check passes, every task in `queue.json` has its `tasks\<id>.md`, and `parallel` holds exactly the groups the user confirmed.

## 5. Launch

Start it in its own window, so it outlives this session and the user can watch it. The inner double quotes are needed: `Start-Process` joins the arguments without quoting them.

```powershell
Start-Process powershell.exe -ArgumentList '-NoExit', '-NoProfile', '-File', '"<run folder>\run.ps1"'
```

Then start the monitor, a web page for every queue under `%USERPROFILE%\.claude-queues` at `http://127.0.0.1:4747/`. It opens the browser. If the monitor is already running, the new process only opens the browser and exits.

```powershell
Start-Process node -ArgumentList '"<this skill''s folder>\monitor\server.mjs"', '--open' -WindowStyle Hidden
```

Then tell the user, briefly:

- the monitor at `http://127.0.0.1:4747/`: tasks and their states, the running session's activity, reports, commits, and browser notifications when a task finishes or the queue stops. For an unfinished queue it can also stop it (killing its sessions), pause it after the current task, continue it, skip a task not yet started, retry a failed or stopped task (resuming its session or starting over, with a note), and edit the brief of a task not yet started: buttons under the run header and in a task's panel, or a right-click on a worker. It runs only on this computer and stops by itself after two idle hours with no queue running. To start it again: `node "<this skill's folder>\monitor\server.mjs" --open`;
- the run folder; `progress.log` there is the running record, `results\NN.md` each task's report, `logs\NN.jsonl` each session's full stream;
- the window shows each session's messages and tool calls live, and a red **STOPPED** line with the resume command when a task fails;
- after a stop: fix the cause, then continue the queue from the monitor (Continue, or Retry on the failed task) rather than running `run.ps1` by hand; finished tasks are skipped either way, and the run lock makes a second runner of the same run folder exit at once;
- the user leaves the repository alone until the queue finishes: the sessions work in this same working tree, and a group's merge lands there too.

When there are groups, also tell them:

- each task of a group works in its own worktree under `wt\` in the run folder, on its own branch; once the group is merged, its worktrees and branches are removed;
- while a group runs, the window shows only start and finish lines for its tasks; the monitor shows the rest, and `logs\NN.jsonl` still holds each full stream;
- a merge conflict starts a conflict session that resolves it, tests what it touched and commits the merge, reporting in `results\merge-<first id>-<last id>.md`. If it cannot, that merge is undone, the queue stops, and the branches and worktrees not yet merged are kept;
- when a task of a group fails, the others finish, nothing is merged and the queue stops; continuing the queue from the monitor continues the failed task in its own worktree.
