# Skills

Claude Code skills, packaged as one plugin, `novruzaliyev-skills`, in the marketplace `novruzaliyev`.
They run on Windows and macOS.
Each folder under `skills/` is one skill: a `SKILL.md` with its instructions, plus any files it needs.

| Skill | What it does | How it starts |
|---|---|---|
| [task-queue](skills/task-queue/) | Runs a list of tasks in order, each in its own fresh, unattended Claude Code session, with tasks you mark as a group running in parallel, and shows the queue on a local web page. | You type `/novruzaliyev-skills:task-queue`. |
| [ticket-queue](skills/ticket-queue/) | Opens the monitor's ticket picker for the repository you are in, where you tick its `.scratch` tickets and start them as a queue, and keeps a small state file of which tickets are done, queued, running, failed or skipped. | You type `/novruzaliyev-skills:ticket-queue`. |
| [delegate](skills/delegate/) | Splits a big task into independent pieces, runs each in its own subagent, and keeps the main session's context light. | Claude uses it when you ask to delegate, split up, fan out or parallelize work; you can also type `/novruzaliyev-skills:delegate`. |
| [queue-monitor](skills/queue-monitor/) | Starts the task-queue monitor again (it exits after two idle hours) and opens it in the browser. | You type `/novruzaliyev-skills:queue-monitor`. |
| [architecture-review](skills/architecture-review/) | Reviews a diff or a path for structural problems: dependency direction, boundary leaks, shallow modules, cycles, decisions in the wrong place. | You type `/novruzaliyev-skills:architecture-review`. |
| [security-review](skills/security-review/) | Reviews a diff or a path for vulnerabilities visible in the code, with a quoted hunk for every finding. | You type `/novruzaliyev-skills:security-review`. |
| [code-quality-review](skills/code-quality-review/) | Reviews a diff or a path for what will cost the next reader or hide the next bug: swallowed failures, untested changes, dead code, loose types. | You type `/novruzaliyev-skills:code-quality-review`. |
| [review-all](skills/review-all/) | Runs the three reviews above in parallel sub-agents and reports them side by side, one verdict per review. | You type `/novruzaliyev-skills:review-all`. |

## Install

The repository is private: install with a GitHub account that has access to it. Claude Code uses your
git credentials (for example `gh auth login`).

```sh
claude plugin marketplace add NovruzAliyevDev/skills
claude plugin install novruzaliyev-skills@novruzaliyev
```

Or, inside a session: `/plugin marketplace add NovruzAliyevDev/skills`, then
`/plugin install novruzaliyev-skills@novruzaliyev`. New sessions pick the skills up.

To update: `claude plugin marketplace update novruzaliyev`, then
`claude plugin update novruzaliyev-skills@novruzaliyev`. Queues already written keep their own copy of
the runner, so an update does not touch them; a monitor already running from an older version is
replaced by the next `/novruzaliyev-skills:queue-monitor` or `/novruzaliyev-skills:ticket-queue`.

## task-queue

Hand Claude a list of tasks and walk away. Each task runs in its own fresh, unattended session, one
after another or, for tasks you mark as a parallel group, side by side in git worktrees. A local web
page shows how far the queue has got.

### Requirements

- Windows 10 or 11, or macOS 13 or later.
- Node.js, on the PATH as `node`: the runner, the monitor and the helper scripts are Node.js scripts.
- The Claude Code CLI on the PATH as `claude`.
- git, for parallel groups and for the monitor's list of commits made during a run (optional without
  groups).

On macOS the runner opens in a Terminal window, through AppleScript. The first time, macOS asks whether
the program that starts it (your terminal or Claude Code for a new queue, `node` for the monitor's
Continue, Retry and Start) may control Terminal. Allow it; if you refused, turn it on again in System
Settings > Privacy & Security > Automation. Until then the launch fails with a line naming that setting.

### Run a queue

1. Open Claude Code in the repository the tasks are about. That session's working directory becomes
   the queue's working directory.
2. Type `/novruzaliyev-skills:task-queue` and send the list: one task per item, in the order they must run, with as much
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
4. Claude writes the run folder, starts the queue in its own window (a console window on Windows, a
   Terminal window on macOS), and opens the monitor.

Tickets written by the `to-tickets` skill under `.scratch` need no list: start them from the ticket
picker instead (see [ticket-queue](#ticket-queue)), which orders them by their `Blocked by` lines and
uses each ticket as its task's brief.

Leave the repository alone until the queue finishes: the sessions work in that same working tree, and
the merge of a parallel group lands there too.

### The run folder

```
~/.claude-queues/<Project>/<yyyyMMdd-HHmm>/
  queue.json       the settings and the task list
  tasks/NN.md      one brief per task
  run.mjs          the runner, a copy of task-queue/runner.mjs
  platform.mjs     what differs between Windows and macOS, a copy of task-queue/platform.mjs
  progress.log     the running record
  results/NN.md    each task's report; its first line is DONE or FAILED
  logs/NN.jsonl    each session's full event stream
  wt/NN/           the worktree of a task in a parallel group, while the group runs
```

`~` is your home folder (`C:\Users\<you>` on Windows). Run folders written before version 2.0.0 have a
`run.ps1` instead; on Windows the monitor still shows, stops and continues them.

### How a queue runs

- Each task gets a fresh headless session (`claude -p`). It sees the repository, its `CLAUDE.md` and the
  task's brief, and nothing of the conversation that set the queue up.
- The queue stops at the first task whose report does not start with `DONE`. The window then shows a
  red **STOPPED** line with the command that opens that session.
- After a stop, fix the cause and continue the queue from the monitor (or run `node run.mjs` in the run
  folder): finished tasks are skipped, and the stopped one starts over with a pointer to its earlier
  report.
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
  `logs/NN.jsonl` show the rest. The design record is in
  [skills/task-queue/docs/parallel-tasks](skills/task-queue/docs/parallel-tasks/).

### The monitor

A page at <http://127.0.0.1:4747/> for every queue under `~/.claude-queues`. Each
task is a pixel-art worker in an office: waiting in line, typing at the desk, celebrating in the done
zone, or in the red alert corner when it stops. The page also shows the running session's activity, the
reports, the commits made during the run, and browser notifications when a task finishes or the queue
stops. It runs only on this computer and exits after two idle hours with no queue running.

For an unfinished queue the monitor can stop it, pause it after the current task, continue it, skip a
task not yet started, retry a failed or stopped task (resuming its session or starting over, with a
note), and edit the brief of a task not yet started. A queue is better continued from the monitor than
by hand: a run lock makes a second runner of the same run folder exit at once. The design record is in
[skills/task-queue/docs/monitor-admin](skills/task-queue/docs/monitor-admin/).

The queue starts the monitor by itself. To start it again, type `/novruzaliyev-skills:queue-monitor`, or by hand:

```sh
node "<plugin folder>/skills/ticket-queue/ensure-monitor.mjs" --open ""
```

The plugin folder is under `~/.claude/plugins/cache/novruzaliyev/novruzaliyev-skills/`, one
subfolder per installed version.

`TASK_QUEUE_MONITOR_PORT` and `TASK_QUEUE_ROOT` change the port and the queue folder. The monitor's
design record, a spec and three tickets, is in [skills/task-queue/docs/pixel-monitor](skills/task-queue/docs/pixel-monitor/).

## ticket-queue

Start a queue from a repository's tickets without typing them into a chat. The tickets are the files
the `to-tickets` skill writes: `.scratch/<feature>/issues/NN-slug.md`, each with a `Blocked by` line, a
`Status` line and acceptance criteria. Needs everything task-queue needs, and git for the state file.

1. Open Claude Code in the repository and type `/novruzaliyev-skills:ticket-queue`. It registers the
   repository with the monitor (once; the register is `repos.json` in the queue folder), starts the
   monitor or replaces one from an older version (running queues are not touched), and opens the
   picker at `http://127.0.0.1:4747/#new:<Project>`. It does nothing else in the chat.
2. In the picker, tick tickets, check the order it shows, set the permission mode, model and effort as
   for any queue, and press Start. The monitor writes the run folder, starts the runner in its own
   window and switches to the run's view. **New queue** in the monitor's header opens the picker again
   for any registered repository later; Forget takes one off the list (its runs and state file stay).

### The picker

- Tickets are grouped by feature, features in alphabetical order, tickets by number. A feature with no
  tickets says so in a grey line; files in `issues` not named `NN-slug.md` are left out.
- Done, queued and running tickets cannot be picked. A ticket whose `Status` line is neither
  `ready-for-agent` nor `done` can, with a warning.
- Start is blocked while a picked ticket waits on a ticket of its feature that is neither picked nor
  done, and while a runner of another queue of this repository is alive. A `Blocked by` line it cannot
  read, or an unfinished queue of this repository with no runner, gives a warning only.
- The queue runs features alphabetically, each feature's tickets blockers first, one at a time in the
  main checkout: never parallel groups. Each task's brief is the ticket's full text, naming the ticket
  file and the feature's `spec.md`, and asks the session to set the ticket's `Status` line to `done`
  and tick the criteria it met. Sessions are named `Project - <feature> <NN> <title>`.

### The state file

`.scratch/queue-state.json` holds one entry per ticket the picker, a queue or you have touched, with
its state:

| State | Meaning |
|---|---|
| `todo` | Not done; the state of every ticket with no entry, unless its file says `Status: done`. |
| `queued` | Picked into a queue that has not reached it, or that stopped or paused before it. |
| `running` | Its session is working, or was resumed or retried. |
| `done` | Its session reported DONE, or you marked it done. |
| `failed` | Its session reported FAILED, its runner died, or the queue was stopped from the monitor while it ran. |
| `skipped` | Skipped from the monitor. |

The monitor and the runner write it, under a lock, never half-written; a write that fails is noted in
the run's `progress.log` and never stops the queue. An entry tied to a run follows that run: when the
two disagree, the run wins. A file that is not valid JSON is reported in the picker and left alone.

The file stays out of git without touching `.gitignore`: whoever creates it first adds
`.scratch/queue-state.json*` to the repository's `.git/info/exclude`. It never dirties the working
tree or lands in a task's commit.

### Marking by hand

Each ticket's Mark menu in the picker sets it to done (work finished outside a queue) or back to todo
(to release it from a stopped queue you will not continue, so it can be picked again). It is offered
neither while a live runner holds the ticket nor while the state file is unreadable. A marked entry is
yours: no queue rewrites it until you pick the ticket into a new one. You can also edit the file by hand; the picker honours it. The design
record is in [skills/task-queue/docs/ticket-picker](skills/task-queue/docs/ticket-picker/).

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

Ask Claude to delegate, split up, fan out or parallelize a task, or type `/novruzaliyev-skills:delegate`.

## The reviewers

Four skills that review and never fix. Each takes a fixed point (a branch, tag or commit, reviewed as
the three-dot diff against its merge-base) or a path (reviewed as it is now); with no argument it uses
`main`, else `master`. The reading happens in a sub-agent, so the main session stays light. Each review
reads the repo's own rule files first (`CLAUDE.md`, `CONTEXT.md`, ADRs, `CODING_STANDARDS.md` and the
like), and a documented repo decision always overrides the review's own lens.

Every report has the same shape: findings sorted by severity (`blocker`, `should fix`, `nit`), each with
`file:line`, what is wrong, why it matters, the direction of the fix, and the quoted evidence, then a
verdict of **ship**, **fix first** or **rethink**. What each severity means is defined per review.

- **architecture-review**: dependency direction, boundary leaks, shallow modules, mixed reasons to
  change, cycles, decisions in the wrong place, speculative structure.
- **security-review**: injection, missing authorization, secrets in code, sensitive data in logs or
  errors, unvalidated input, unsafe deserialization, weak crypto, SSRF and open redirects, dependency
  changes. A risk with no hunk to quote is not a finding.
- **code-quality-review**: misleading names, oversized units, swallowed failures, dead code, comment
  drift, untested changes, copied logic, loose types.
- **review-all**: the three above as parallel sub-agents, presented under their own headings, never
  merged or reranked across them.

## Adding a skill

Put it in its own folder under `skills/` with a `SKILL.md`, check the plugin with
`claude plugin validate .`, raise `version` in `.claude-plugin/plugin.json`, and commit.
