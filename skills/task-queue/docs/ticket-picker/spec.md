Status: ready-for-agent

# Starting a queue from a repository's tickets

## Problem Statement

The user plans work with the `to-tickets` skill, which writes one file per ticket under `.scratch/<feature>/issues/NN-slug.md` in the repository, each with a `Blocked by` line, a `Status` line and acceptance criteria. To run those tickets unattended, the user opens `/task-queue` and types the list by hand: which tickets, in which order, with the paths spelled out. The skill then rewrites each ticket into a brief, although a ticket already is a brief.

- Picking tickets means reading the `.scratch` folder in an editor and copying names into the chat.
- The order has to be worked out by hand from the `Blocked by` lines, and nothing stops a ticket from being queued before the ticket it depends on.
- Nothing shows which tickets of a repository are done, queued, running or failed. A ticket's `Status` line is updated only when a session remembers to, and a failed or stopped ticket looks the same as one never started.
- Nothing stops the user from queueing a ticket that another queue is already running.

The user wants to open a page from the repository they are working in, tick the tickets to run, and start the queue there. They also want one small file in the repository that says, for each ticket, whether it is waiting, queued, running, done, failed or skipped.

## Solution

A new skill, `ticket-queue`, started from a Claude Code session in the repository. It registers the repository with the monitor and opens the monitor's new **ticket picker** page for it. The chat does nothing else.

The picker lists the repository's tickets, grouped by feature, each with its state. The user ticks tickets, sets the queue's settings and presses Start. The monitor checks the selection against the `Blocked by` lines, orders it, writes the run folder with each ticket as its task's brief, starts the runner in its own window, and switches to that run's view. The old chat flow of `/task-queue` stays as it is.

Each repository gets a **ticket state file**, `.scratch/queue-state.json`, kept out of git through `.git/info/exclude`. The monitor and the runner keep it up to date as the queue moves; the user can also set a ticket to done or back to todo, from the picker or by editing the file.

## Vocabulary

- **Ticket**: a file `.scratch/<feature>/issues/NN-slug.md` in a repository, as `to-tickets` writes it. Its **key** is its path relative to `.scratch`, with forward slashes: `admin-transaction-edit/issues/05-edit-transaction-tracer.md`.
- **Feature**: a folder directly under `.scratch`. Its tickets are the files in its `issues` folder whose names match `NN-slug.md`.
- **Registered repository**: a repository the `ticket-queue` skill was started in, recorded in the **repository register**, `repos.json` in the queue root. The picker offers only registered repositories.
- **Ticket state**: one of `todo`, `queued`, `running`, `done`, `failed`, `skipped`.
- **Ticket state file**: `.scratch/queue-state.json` in the repository.
- **Picker queue**: a run whose `queue.json` came from the picker. Its tasks carry a `ticket` field.

## User Stories

1. As a ticket user, I want one command in the repository I am working in that opens a page of that repository's tickets, so that I do not type ticket names into a chat.
2. As a ticket user, I want that command to do nothing else in the chat, so that starting a queue costs no conversation.
3. As a ticket user, I want the repository to stay on the page's repository list after that, so that I can start another queue for it later without running the command again.
4. As a ticket user, I want to choose among all the repositories I have registered, so that one page serves all my projects.
5. As a ticket user, I want to remove a repository from that list, so that old projects do not clutter it.
6. As a ticket user, I want the page to refuse repositories I never registered from a session in them, so that nobody can start unattended sessions in an arbitrary folder through the page.
7. As a ticket user, I want the repository's project name taken from its folder name in CamelCase, so that its queues sit under a sensible folder and sessions get sensible names.
8. As a ticket user, I want to change that project name in the page, so that I can fix a name the folder does not give well.
9. As a ticket user, I want the tickets grouped by feature, in their number order, so that the page reads like the `.scratch` folder.
10. As a ticket user, I want each ticket shown with its number, title and state, so that I see at a glance what is left to do.
11. As a ticket user, I want a feature with no `issues` folder shown greyed, saying it has no tickets, so that I know it was found and why nothing is offered.
12. As a ticket user, I want files in `issues` that are not named like tickets left out, so that notes beside the tickets do not appear as tickets.
13. As a ticket user, I want done tickets shown grey and not selectable, so that I do not run finished work again.
14. As a ticket user, I want tickets that are queued or running in another queue not selectable, so that the same ticket never runs twice at once.
15. As a ticket user, I want a ticket whose `Status` line is neither `ready-for-agent` nor `done` to be selectable with a warning, so that I can still run it when I know it is ready.
16. As a ticket user, I want a ticket whose file says `Status: done` counted as done when the state file has nothing on it, so that tickets finished before this feature, by hand or from the chat, show correctly.
17. As a ticket user, I want the state file to win over the ticket's `Status` line, so that what I set there is what the page shows.
18. As a ticket user, I want the page to block Start when a ticket I picked depends on one that is neither done nor picked, so that a queue never runs a ticket before its blocker.
19. As a ticket user, I want that block to name the ticket and its missing blocker, so that I know what to add.
20. As a ticket user, I want a `Blocked by` line the page cannot read to give a warning only, so that free wording does not stop me.
21. As a ticket user, I want the picked tickets ordered so that every blocker runs before the tickets it blocks, so that I do not order them by hand.
22. As a ticket user, I want to pick tickets from several features in one queue, so that one unattended run can cover all of them.
23. As a ticket user, I want the picked features to run in alphabetical order, each feature's tickets in dependency order, so that the order is predictable.
24. As a ticket user, I want to see the final order before I press Start, so that I know what the queue will do.
25. As a ticket user, I want to set the permission mode, the model and the effort in the page, with the same defaults and choices as the chat flow, so that a picker queue is configured like any other.
26. As a ticket user, I want the picker never to make parallel groups, so that a picker queue runs one ticket at a time in the main checkout.
27. As a ticket user, I want Start blocked while a runner of another queue of this repository is alive, so that two queues never work in the same working tree.
28. As a ticket user, I want a warning, not a block, when this repository has an unfinished queue whose runner is not alive, so that I know about it but can still start a new one.
29. As a ticket user, I want each ticket's full text to be its task's brief, so that the session reads exactly what `to-tickets` wrote.
30. As a ticket user, I want the brief to name the ticket's file and its feature's spec, so that the session can read the spec and update the ticket in place.
31. As a ticket user, I want the brief to ask the session to set the ticket's `Status` line to `done` and tick the acceptance criteria it met, so that the ticket file itself records the work.
32. As a ticket user, I want each session named after its feature, ticket number and ticket title, so that I can tell sessions apart in the session list.
33. As a ticket user, I want Start to open the runner in its own window, as the chat flow does, so that I can watch the live messages there.
34. As a ticket user, I want the page to switch to the new run's view after Start, so that I watch the queue I just started.
35. As a ticket user, I want the picked tickets to show as queued as soon as I press Start, so that the picker reflects the new queue at once.
36. As a ticket user, I want a ticket to show as running when its session starts, so that I know which ticket is being worked on.
37. As a ticket user, I want a ticket to show as done or failed when its session reports, so that the state file follows the queue.
38. As a ticket user, I want a ticket skipped from the monitor to show as skipped, so that it is not mistaken for done.
39. As a ticket user, I want a ticket whose session I stopped from the monitor to show as failed, so that nothing claims to be running when no session is.
40. As a ticket user, I want a ticket retried or continued from the monitor to show as running again, so that a retry is visible in the state file.
41. As a ticket user, I want tickets not yet reached in a stopped or paused queue to stay queued, so that I know Continue would run them.
42. As a ticket user, I want to mark a ticket done or back to todo from the picker, so that I can record work done outside a queue, or release a ticket from a queue I will not continue.
43. As a ticket user, I want that menu unavailable for a ticket a live runner is working through, so that I do not change a ticket under a running queue.
44. As a ticket user, I want to edit the state file by hand and have the page honour it, so that I am not tied to the page.
45. As a ticket user, I want a ticket's state taken from its run folder when the state file and the run disagree, so that a missed write does not leave a wrong state behind.
46. As a ticket user, I want the state file kept out of git without touching `.gitignore`, so that it never dirties the working tree, never lands in a task's commit, and never blocks a queue.
47. As a ticket user, I want the state file small and readable, so that I can read it at a glance.
48. As a ticket user, I want writes to the state file never to leave it half-written or lose another writer's change, so that the monitor and the runner can both write it safely.
49. As a ticket user, I want a failure to write the state file to be recorded but never to stop the queue, so that bookkeeping does not cost me a run.
50. As a ticket user, I want queues started from the chat, and run folders from before this feature, to work and show as before, so that nothing I already have changes.
51. As a ticket user, I want the command to restart a monitor left running from an older version of the plugin, so that the picker page is there when I need it.
52. As a ticket user, I want that restart to leave running queues untouched, so that restarting the page never costs me work.
53. As a keyboard user, I want every control of the picker reachable and usable by keyboard, with accessible names, so that I need no mouse.
54. As a ticket user, I want the picker to look right in light and dark themes and at phone width, as the rest of the monitor does.

## Implementation Decisions

### The `ticket-queue` skill

- A new skill folder beside `task-queue` and `queue-monitor`, with `disable-model-invocation: true`, like the other two. It never reads, writes or orders tickets: the picker does.
- Its steps: find the repository root (`git rev-parse --show-toplevel`, or the working directory when it is not a git repository); run the skill's `register.ps1` with that path; make sure a monitor of the current version is running; open the picker URL for the repository; tell the user in one or two lines, in their language, that the picker is open and where.
- `register.ps1 -Path <root>` reads `repos.json` in the queue root (creating it when missing), adds the repository when its path is not there yet, and prints the project name. Paths compare case-insensitively, without a trailing backslash. The project name is the folder name in CamelCase (characters outside the monitor's name pattern dropped, word boundaries at spaces, dashes, underscores and dots). When that name is taken by another path, a number is appended (`OilCard2`). The file is written whole (temporary file, then rename), as UTF-8 JSON written by `ConvertTo-Json`, so backslashes are always escaped. The skill's model never writes JSON itself.
- The repository register:

  ```json
  {
    "version": 1,
    "repos": [
      { "project": "OilCard", "path": "C:\\Development\\OilCard", "addedAt": "2026-10-16T12:00:00Z" }
    ]
  }
  ```

- **Monitor version.** The server carries a version number; `/api/health` answers it beside `ok` and `root`. The skill reads the number from the `server.mjs` it ships with and compares. When the running monitor answers an older number, or answers without one, the skill stops the process that listens on the monitor's port, only if its command line runs a `server.mjs`, and starts the new one. Runners and sessions are separate processes and are not touched. When the port is held by something else, the skill says so and stops.
- The picker URL is the monitor's page with the hash `#new:<Project>`. The colon cannot occur in a project or run name, so this hash never collides with a run's hash.
- The `task-queue` skill and its chat flow do not change. The `queue-monitor` skill learns the same version check, so that it too replaces an old monitor.

### The ticket state file

- `.scratch/queue-state.json`, UTF-8:

  ```json
  {
    "version": 1,
    "tickets": {
      "admin-transaction-edit/issues/05-edit-transaction-tracer.md": {
        "state": "done",
        "run": "OilCard/20261016-1430",
        "task": "03",
        "updatedAt": "2026-10-16T15:02:11Z"
      }
    }
  }
  ```

  Only `state` is required in an entry. An entry with `run` and `task` is **tied** to that run's task; an entry without them is **manual**. A missing file, a ticket with no entry, and an entry whose `state` is not a known state all count as no entry. A file that is not valid JSON is treated as empty for reading, reported in the picker, and left alone: no writer overwrites a file it could not read.
- **Effective state of a ticket**, in order:
  1. a tied entry whose run folder still exists: the state of that run's task, mapped as below; when it differs from the entry, the server rewrites the entry with the mapped state;
  2. any other entry: its `state`;
  3. no entry: `done` when the ticket's `Status` line says `done`, `todo` otherwise.
- **Mapping from a run's task state** (the monitor's existing derived states): pending → `queued`; running, no-session or pausing → `running`; done → `done`; failed or stopped → `failed`; skipped → `skipped`. A task pending in a run that is stopped, paused or interrupted stays `queued`.
- **Writers.**
  - The server, on Start: `queued` for every picked ticket, tied to the new run and its task id.
  - The runner, when it writes a task's `starting` line: `running`. When it writes the task's verdict: `done`, `failed`, or `skipped` when a skip is applied. A resumed or retried task writes `running` again at its start.
  - The server, on a hard stop: `failed` for each task it cut off.
  - The server, on the picker's mark action: a manual entry with `done` or `todo`.
  - The user, by hand.
- The runner writes only for tasks whose `queue.json` entry has a `ticket` field; run folders without one never touch any state file. The runner finds the file from `workDir`. Picker queues have no groups, so only the sequential path writes; a `-ParallelTask` child writes nothing.
- **Safe writes.** Every writer takes a lock file `.scratch/queue-state.json.lock`, created only if absent, holding the writer's process id and the time. It retries for up to 10 s, and takes over a lock older than 60 s. Under the lock it reads the file, changes only its own entries, writes a temporary file beside it, renames it over the file, then removes the lock. The server and the runner follow the same protocol.
- A runner that cannot write the state file goes on, and writes `ticket state: could not update <key> (<why>)` to `progress.log`. The server's failures answer the request with the reason; on Start the queue is still launched and the page shows the warning.
- **Git.** The writer that creates the state file first adds the line `.scratch/queue-state.json*` to the repository's `info/exclude` (found with `git rev-parse --git-path info/exclude`) when it is not there yet; the pattern also covers the lock and temporary files. `.gitignore` is never touched. A folder that is not a git repository gets no exclude line.

### Reading tickets

- A ticket's **number** is the `NN` of its file name; its **title** is its first `# ` heading with a leading `NN:` removed, or the file name's slug when it has no heading.
- Its **status line** is the first line matching `**Status:** <word>`; the word is kept as written (`ready-for-agent`, `done`, anything else, or none).
- Its **blockers** come from the first `**Blocked by:**` line. A line starting with `None` has no blockers. Otherwise every one- or two-digit number in the line that is the number of a ticket of the same feature is a blocker. A line with no such number is **unread**: the picker shows a warning on the ticket and treats it as having no blockers. References to other features are not followed.
- `.scratch` is read on every picker request; nothing is cached.

### Monitor: server

- **New GETs.**
  - `/api/repos`: the registered repositories, `{ project, path, exists }` each, `exists` saying whether the folder is still there.
  - `/api/tickets?project=<Project>`: for one registered repository, its features in alphabetical order, each with `hasIssues`, its spec's presence, and its tickets: key, number, title, status line, blockers, unread flag, effective state, the run holding it when tied, and the actions allowed now (`select`, `mark-done`, `mark-todo`). Also the repository's runs (runs whose `queue.json` `workDir` is this path, compared case-insensitively): whether any runner of them is alive, and the unfinished ones whose runner is not. Also a `stateFile` field saying whether the state file is missing, valid, or unreadable with the reason.
- **New actions** on the existing admin endpoint, with the same token, Origin and Host checks, answers and size limit. These are **repository actions**: they carry `project` (a registered repository's project name) and no `run`.
  - `new-queue` `{ project, tickets, settings }`: `tickets` is a list of ticket keys, `settings` holds `permissionMode` (`auto`, `acceptEdits` or `bypassPermissions`), `model` and `effort` (text or null), and `projectName` (optional, matching the name pattern). It is refused with 409 when a runner of this repository is alive or starting, when a picked ticket's effective state is `done`, `queued` or `running`, or when a picked ticket has a blocker that is neither picked nor done; the reason names the ticket and the blocker. An unknown key answers 400.
  - `mark` `{ project, ticket, state }`, with `state` `done` or `todo`: refused with 409 while a live runner holds the ticket in a task (its tied run's runner is alive or starting).
  - `forget-repo` `{ project }`: removes the repository from the register. Its run folders and its state file stay.
- **What `new-queue` does**, in order:
  1. orders the picked tickets: features alphabetically, then within each feature a topological order of the picked tickets by their blockers, ties broken by number;
  2. creates the run folder `<queue root>\<ProjectName>\<yyyyMMdd-HHmm>\`, adding `-2`, `-3` ... when the folder already exists;
  3. writes `tasks\NN.md` for each ticket, numbered from `01` in queue order (the brief, below);
  4. writes `queue.json` as the chat flow does, with no `parallel` and no `maxParallel`, and a `ticket` field (the key) on every task;
  5. copies the monitor's own `runner.ps1` from the skill folder as `run.ps1`, unchanged;
  6. reads `queue.json` back and checks that `workDir` exists and every task has its brief;
  7. writes `queued` entries into the state file;
  8. writes `admin: queue created from the ticket picker (<N> tickets)` as the run's first `progress.log` line;
  9. launches `run.ps1` in its own window, as Continue does, and answers `{ ok, project, run }`.

  When a step before the launch fails, the run folder is removed and the request answers 500 with the reason.
- **The task title** is `<feature> <NN> <ticket title>`, with double quotes removed and the whole cut to 60 characters. The session's name is `ProjectName - title`, as the runner already makes it.
- **The brief** of a ticket:

  ```
  # <task title>

  Ticket file: .scratch/<feature>/issues/<NN-slug>.md
  Feature spec: .scratch/<feature>/spec.md            (this line only when the spec exists)

  Work this ticket. Read the feature spec for the context it points to. When the ticket is done,
  set its **Status:** line in the ticket file to `done` and tick the acceptance criteria you met.

  ## The ticket, as written

  <the ticket file's full text>
  ```

  The copy is the ticket as it was at Start; the session edits the ticket file in the repository.
- **Changes to existing actions.** The hard stop writes `failed` for each task it cut off, in a picker queue. Retry, Continue, Skip and Edit brief do not write the state file themselves; the runner does when it acts on them.
- The server's version number is raised by this feature.

### Runner

- A task entry in `queue.json` may carry `ticket`. When it does, the runner updates the state file at the points listed above, under the lock, with `run` set to `<Project>/<run folder name>` and `task` to the task's id.
- The runner prints nothing new in its window; failures to write go to `progress.log` only.
- The feature marker does not change: the picker's actions are repository actions and do not need one. A picker queue's runner always has the current runner, since the server copies its own.

### Monitor: page

- The header gets a **New queue** button that opens the picker for the repository last picked, or the first registered one. The `#new:<Project>` hash opens it for that repository. With no registered repository, the picker says to run the `ticket-queue` skill in a repository.
- **The picker**, top to bottom:
  1. the repository: a dropdown of registered repositories, its path, a Forget button (with a confirmation dialog), and the project name field;
  2. the repository's warnings: a live runner (Start blocked), unfinished runs with no runner (linked), an unreadable state file;
  3. the features, each a section with its name and, when it has no tickets, a grey "no tickets" line;
  4. under each feature, one row per ticket: a checkbox, the number, the title, the state as a badge, the status-line warning, the unread `Blocked by` warning, the run holding it as a link when tied, and a small menu with Mark done or Mark todo;
  5. the settings: permission mode (three choices, `auto` first), model and effort (free text, empty for unset);
  6. the order: the picked tickets in queue order with their task numbers, and each blocking problem in red under it;
  7. Start, disabled with the reason while anything blocks it.
- Done tickets are grey with the checkbox disabled; queued and running ones too, with the run's link. A ticket whose status line is neither `ready-for-agent` nor `done` has a warning badge but can be picked.
- After Start the page switches to the new run's hash. A refusal shows `Start refused: <reason>` above the button.
- The picker's data comes from `/api/tickets` on the same polling as the run view, so states change on the page while a queue runs.

## Testing Decisions

- A good check drives only real inputs and asserts only on what the user or the next program can observe. It never reaches into the server's functions, the runner's functions or the page's modules. The state file is observed, and a check may write it only to stand in for the user editing it by hand (user story 44).
- There is one seam: **page or HTTP request → monitor server → fixture repository → new run folder → the real runner, with the stub `claude`, on a throwaway git repository → observable results.** `register.ps1`, run in a fixture repository, is the start of the same path: its effect is what `/api/repos` and the picker show.
  - Inputs:
    - `register.ps1` run in a fixture repository;
    - the picker's controls pressed in Claude's built-in browser pane;
    - HTTP requests with and without the token;
    - the state file edited by hand.
  - Observed:
    - the page and the API answers;
    - the repository register;
    - the state file after each step;
    - the run folder: `queue.json` with its order and `ticket` fields, the briefs, `progress.log`;
    - the stub's record of calls and the briefs its sessions read;
    - `info/exclude` and `git status` of the fixture repository.
- The fixture repository is a throwaway git repository with a `.scratch` holding:
  - a feature of four tickets with blockers, one with `Status: done` in its file, one with an unreadable `Blocked by` line;
  - a second feature of two tickets;
  - a feature with only a spec;
  - a file in `issues` not named like a ticket.
- The server under test runs with the queue-root variable pointing at the fixtures and on port 4851. The real queue root, the real register and any monitor on 4747 are not touched.
- Scenarios:
  - Register: a new repository is added with its CamelCase name; registering it again changes nothing; a second folder with the same name gets a number; the register's paths read back as valid JSON with escaped backslashes.
  - Reading: features in order, the spec-only feature with no tickets, the stray file left out, the `Status: done` ticket counted done with no state file, the unread blocker warned.
  - Start refusals: a blocker neither picked nor done; a done, queued or running ticket picked; a live runner of this repository. Each answers 409 with a reason naming the ticket, and nothing is written.
  - Start: the order is features alphabetical and blockers first; `queue.json` has the `ticket` fields and no groups; each brief names the ticket and the spec and holds the ticket's text; the picked tickets are `queued` in the state file; the exclude line is added once; `git status` stays clean.
  - The queue runs with the stub: each ticket goes `running` then `done`; a failing ticket goes `failed` and the next stays `queued`; a skip from the monitor gives `skipped`; a hard stop gives `failed`; a retry gives `running` again and then its verdict.
  - Conflict: a tied entry edited by hand to `done` while its run says failed is rewritten to `failed` on the next picker read; a manual entry is never rewritten.
  - Mark: done and todo write manual entries; refused for a ticket a live runner holds.
  - Forget: the repository leaves `/api/repos`, its runs and state file stay, and a repository action naming it answers 400.
  - State file: unreadable JSON is reported and left untouched by every writer; a held lock delays a write; a lock older than 60 s is taken over; two writers at once both land their entries.
  - Security: repository actions without the token, with a wrong token, from a foreign Origin or Host answer 403; a project that is not registered answers 400.
  - Version: `/api/health` answers the version; the skill's restart replaces an older monitor and leaves a running runner alive.
  - Old run folders, chat-flow queues and the earlier specs' fixtures display and run as before; their runners write no state file.
  - The page: every picker control by accessible name and by keyboard; the blocking reasons and warnings; light and dark and 375 px, by screenshot.
- One real check at the end, with real sessions on a scratch repository, is the only check that costs money. Two features, three tickets in all, one blocked by another, started from the picker. At the end the state file says `done` for all three, and each ticket file says `Status: done` with its criteria ticked.
- Prior art: the checks of the earlier specs in `%TEMP%\task-queue-monitor-fixtures`, above all `check-admin.mjs`, the stub `claude` and `setup-admin-ui.mjs`. If they are gone, they are rebuilt from those specs' Testing Decisions. This spec adds `check-picker.mjs` and a picker fixture repository there. Nothing is committed: no test suite, no fixtures, no npm. The earlier checks must still pass.

## Out of Scope

- Parallel groups in picker queues.
- Tickets on a real issue tracker (GitHub, Linear and the like); only local `.scratch` tickets.
- Blockers across features, and the automatic adding of missing blockers to a selection.
- Reordering the queue by hand in the picker.
- Adding a repository from the page.
- The runner or the server editing a ticket file's `Status` line or checkboxes; that is the session's work, asked by the brief.
- Changing the chat flow of `/task-queue`, or adding ticket state to its queues.
- Backfilling the state file from run folders made before this feature.
- Remembering settings per repository.

## Further Notes

- The state file is a mirror and an input at once. Entries tied to a run follow that run, so the monitor can always correct them; manual entries belong to the user. Marking a tied ticket from the picker makes it manual, which is how a ticket is released from a queue the user will not continue.
- A ticket marked `todo` while its old queue is stopped can be picked into a new queue. If the old queue is then continued too, the ticket runs twice. The picker's warning about unfinished runs is the guard; nothing stronger is planned.
- The skill opens a URL with the project name in the hash. The name is not secret, and the page holds no data the monitor does not already serve on this computer.
