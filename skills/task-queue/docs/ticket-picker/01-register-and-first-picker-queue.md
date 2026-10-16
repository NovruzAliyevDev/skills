# 01: Register a repository and start a first picker queue

**What to build:** The tracer bullet. In a Claude Code session inside a repository, the user runs the new `ticket-queue` skill. It registers the repository, makes sure a monitor of the current version is running, and opens the monitor's ticket picker for that repository. The picker lists the repository's features and tickets. A ticket counts as done when its own `Status` line says `done`, and as todo otherwise. The user ticks tickets, sets the permission mode, model and effort, and presses Start. The monitor writes a run folder whose briefs are the tickets, launches the runner in its own window, and switches to the new run's view. The queue then runs like any other.

This ticket also lays the ground the later tickets stand on:

- the repository register and `register.ps1`;
- the monitor's version number in `/api/health`, and the skill's replacement of an older monitor;
- the repository actions on the admin endpoint (`new-queue`, `forget-repo`) and their checks;
- the `ticket` field on a task in `queue.json`.

In this ticket the order is simply features alphabetically, then ticket number. There is no state file and no blocker check yet.

Read [spec.md](spec.md) first:

- "Vocabulary";
- "The `ticket-queue` skill";
- "Reading tickets", but not its blockers paragraph;
- "Monitor: server" (the GETs, `new-queue`, `forget-repo`, the task title, the brief);
- "Monitor: page";
- the matching scenarios under "Testing Decisions".

Build it test-first on the one seam the spec describes: `register.ps1`, a page or an HTTP request, then the server, the fixture repository, the run folder, and the real runner with the stub `claude`. Rebuild the check tooling from the earlier specs if `%TEMP%\task-queue-monitor-fixtures` is gone. This ticket starts `check-picker.mjs` and the picker fixture repository there.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A new `ticket-queue` skill folder beside `task-queue` and `queue-monitor`, with `disable-model-invocation: true`. Its steps find the repository root, run `register.ps1`, check the monitor's version, open `#new:<Project>`, and tell the user in one or two lines in their language.
- [x] `register.ps1 -Path <root>` adds the repository to `repos.json` in the queue root with its CamelCase project name. Registering it again changes nothing. A second folder with the same name gets a number. The file is written whole and reads back as valid JSON with escaped backslashes.
- [x] `/api/health` answers the server's version number. The skill stops a monitor on the port that answers an older version or none, only if its command line runs a `server.mjs`, and starts the new one. A runner alive at that moment stays alive. A port held by something else is reported, and nothing is killed.
- [x] `/api/repos` lists the registered repositories with `exists`. `/api/tickets?project=` lists features alphabetically. Each lists its tickets by number with key, number, title and status line. A spec-only feature shows with no tickets, and a file in `issues` not named like a ticket is left out. A ticket is `done` when its `Status` line says so, and `todo` otherwise.
- [x] `new-queue` and `forget-repo` go through the admin endpoint with the same token, Origin and Host checks. A project that is not registered or an unknown ticket key answers 400. A done ticket picked answers 409, and nothing is written.
- [x] `new-queue` writes the run folder under `<ProjectName>\<yyyyMMdd-HHmm>`, with `-2` when it exists. Each brief follows the spec's template: title, ticket file, spec line only when the spec exists, the instruction to set `Status: done` and tick criteria, and the ticket's full text. `queue.json` has a `ticket` field on every task and no groups. `run.ps1` is the monitor's `runner.ps1`, unchanged. The first `progress.log` line is `admin: queue created from the ticket picker (<N> tickets)`. The runner is launched in its own window. A failure before the launch removes the run folder and answers 500.
- [x] Task titles are `<feature> <NN> <ticket title>`, without double quotes and at most 60 characters.
- [x] `forget-repo` removes the repository from the register. Its run folders stay.
- [x] The page has a New queue button in the header and opens the picker on `#new:<Project>`. With no registered repository, it says to run the skill. The picker has the repository dropdown, path, Forget with a confirmation dialog, project name field, feature sections, ticket rows with checkboxes (done ones disabled), settings with `auto` first, and Start. After Start the hash becomes the new run's. A refusal shows `Start refused: <reason>`.
- [x] Every picker control has an accessible name and works by keyboard. The picker is checked in Claude's browser pane in light and dark and at 375 px.
- [ ] A picker queue of two tickets runs to the end with the stub `claude`. Each session's brief is the ticket's brief. Chat-flow run folders and the earlier specs' fixtures still display and run as before, and the earlier checks pass.
