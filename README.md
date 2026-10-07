# Skills

Claude Code skills, kept in `~/.claude/skills`. Each folder is one skill: a `SKILL.md` with its
instructions, plus any files it needs.

| Skill | What it does | How it starts |
|---|---|---|
| [task-queue](task-queue/) | Runs a list of tasks in order, each in its own fresh, unattended Claude Code session, with tasks you mark as a group running in parallel, and shows the queue on a local web page. | You type `/task-queue`. |
| [delegate](delegate/) | Splits a big task into independent pieces, runs each in its own subagent, and keeps the main session's context light. | Claude uses it when you ask to delegate, split up, fan out or parallelize work; you can also type `/delegate`. |

## Install

The repository is meant to be the `~/.claude/skills` folder itself. It is private, so clone it with
an account that has access.

If there is no `~/.claude/skills` yet:

```powershell
git clone https://github.com/NovruzAliyevDev/skills "$env:USERPROFILE\.claude\skills"
```

If `~/.claude/skills` already exists, clone the repository elsewhere and link each skill folder into it:

```powershell
git clone https://github.com/NovruzAliyevDev/skills C:\src\skills
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\task-queue" -Target C:\src\skills\task-queue
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\delegate" -Target C:\src\skills\delegate
```

New Claude Code sessions pick the skills up.

## task-queue

Hand Claude a list of tasks and walk away. Each task runs in its own fresh, unattended session, one
after another or, for tasks you mark as a parallel group, side by side in git worktrees. A local web
page shows how far the queue has got.

### Requirements

- Windows with Windows PowerShell 5.1: the runner is a PowerShell script.
- The Claude Code CLI on the PATH as `claude`.
- Node.js, for the monitor.
- git, for parallel groups and for the monitor's list of commits made during a run (optional without
  groups).

### Run a queue

1. Open Claude Code in the repository the tasks are about. That session's working directory becomes
   the queue's working directory.
2. Type `/task-queue` and send the list: one task per item, in the order they must run, with as much
   detail per item as you like. You can also set:
   - **permission mode**: `auto` (the default), `acceptEdits` or `bypassPermissions`. `default` and
     `manual` cannot run unattended, since nothing would approve a prompt.
   - **model** and **effort**: unset by default, so each session uses your usual ones. `auto` needs a
     model that supports it (Haiku does not); the runner checks this before the first task.
   - **maxParallel**: how many sessions a parallel group runs at once, 5 by default.

   To run some tasks in parallel, end the list with the group notation, for example `[[9,10]]` or
   `[[3,4],[9,10,11]]`: the numbers are your items in list order, and each group needs two or more
   consecutive items. Claude asks about a group it cannot accept, and never makes groups of its own.
3. Claude turns each item into a brief that a stranger to the conversation could act on, resolving
   shorthand such as "ticket 62" to real paths. It checks the tasks and leaves the work itself, even a
   quick look-up of the answer, to the queue's sessions. It shows the numbered titles, a summary of
   each brief, the groups and the settings, and flags anything that cannot run unattended. Correct it
   until it is right, then confirm.
4. Claude writes the run folder, starts the queue in its own PowerShell window, and opens the monitor.

Leave the repository alone until the queue finishes: the sessions work in that same working tree, and
the merge of a parallel group lands there too.

### The run folder

```
%USERPROFILE%\.claude-queues\<Project>\<yyyyMMdd-HHmm>\
  queue.json       the settings and the task list
  tasks\NN.md      one brief per task
  run.ps1          the runner, a copy of task-queue\runner.ps1
  progress.log     the running record
  results\NN.md    each task's report; its first line is DONE or FAILED
  logs\NN.jsonl    each session's full event stream
  wt\NN\           the worktree of a task in a parallel group, while the group runs
```

### How a queue runs

- Each task gets a fresh headless session (`claude -p`). It sees the repository, its `CLAUDE.md` and the
  task's brief, and nothing of the conversation that set the queue up.
- The queue stops at the first task whose report does not start with `DONE`. The window then shows a
  red **STOPPED** line with the command that opens that session.
- After a stop, fix the cause and continue the queue from the monitor (or run `run.ps1` again): finished
  tasks are skipped, and the stopped one starts over with a pointer to its earlier report.
- Sessions cannot run background commands, because a headless session's background commands die when
  it ends; slow commands such as a full test suite get up to 60 minutes instead. A session that ends
  without writing its report is resumed once to write it.

### Parallel groups

- A queue with groups needs a git repository with a branch checked out, and every task in it is asked
  to commit its work. A group starts only from a main checkout with nothing uncommitted or untracked.
- When the queue reaches a group, its tasks start together, each in its own worktree and branch made
  from the queue's branch. When all of them are `DONE`, the runner merges their branches in task order
  and removes the worktrees and branches.
- A merge conflict starts a conflict session that resolves it, tests what it touched and commits the
  merge. If it cannot, that merge is undone, the queue stops, and the branches and worktrees not yet
  merged are kept.
- If a task of a group fails, the others finish, nothing is merged and the queue stops. Continuing
  the queue continues the failed task in its own worktree.
- While a group runs, the window shows only start and finish lines for its tasks; the monitor and
  `logs\NN.jsonl` show the rest. The design record is in
  [task-queue/docs/parallel-tasks](task-queue/docs/parallel-tasks/).

### The monitor

A page at <http://127.0.0.1:4747/> for every queue under `%USERPROFILE%\.claude-queues`. Each
task is a pixel-art worker in an office: waiting in line, typing at the desk, celebrating in the done
zone, or in the red alert corner when it stops. The page also shows the running session's activity, the
reports, the commits made during the run, and browser notifications when a task finishes or the queue
stops. It runs only on this computer and exits after two idle hours with no queue running.

For an unfinished queue the monitor can stop it, pause it after the current task, continue it, skip a
task not yet started, retry a failed or stopped task (resuming its session or starting over, with a
note), and edit the brief of a task not yet started. A queue is better continued from the monitor than
by hand: a run lock makes a second runner of the same run folder exit at once. The design record is in
[task-queue/docs/monitor-admin](task-queue/docs/monitor-admin/).

The queue starts the monitor by itself. To start it by hand:

```powershell
node "$env:USERPROFILE\.claude\skills\task-queue\monitor\server.mjs" --open
```

`TASK_QUEUE_MONITOR_PORT` and `TASK_QUEUE_ROOT` change the port and the queue folder. The monitor's
design record, a spec and three tickets, is in [task-queue/docs/pixel-monitor](task-queue/docs/pixel-monitor/).

## delegate

For work too big for one context. Claude splits the task into independent pieces, writes one shared
brief, runs the pieces in parallel subagents, gets back short summaries (about 20 lines each, with long
output in files), puts the answer together itself, and has a fresh agent check the result against the
request.

It fans out only when that pays off, that is when at least two of these hold: the work splits into three
or more independent pieces, each piece needs far more reading than its answer is worth, the pieces touch
different files or sources, or one agent would run out of room. Otherwise it does the work inline and
says so. Subagents never spawn their own, agents that write get files of their own (or all stay
read-only), and a round has about 6 agents, at most 2 rounds.

Ask Claude to delegate, split up, fan out or parallelize a task, or type `/delegate`.

## Adding a skill

`.gitignore` tracks only the folders it lists, because the other folders in `~/.claude/skills` are
skills installed from elsewhere, most of them junctions into `~/.agents/skills`. To add a skill of your
own, put it in its own folder with a `SKILL.md`, add a `!/<folder>/` line to `.gitignore`, and commit.
