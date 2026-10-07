Status: ready-for-agent

# Administering a queue from the monitor

## Problem Statement

The monitor only lets the user watch a queue. Everything else is done by hand, outside it:

- To stop a queue, the user closes the runner's window and hopes nothing is left half-done.
- To continue after a stop, they find the run folder and run `run.ps1` again.
- To skip a task that is no longer wanted, they write a fake `DONE` report by hand.
- To fix a brief before its task starts, they open `tasks\NN.md` in an editor while the queue runs, without knowing whether the runner has already read it.
- To retry a failed task with a hint ("the cause was X, do Y"), they edit the brief and rerun.
- To resume a killed session instead of starting it over, they copy a session id out of `progress.log` into a terminal.

None of this is visible in the monitor. Nothing stops two runners from working on the same run folder, and nothing records that the user stepped in.

The user wants to administer a queue from the same page they watch it on.

## Solution

The monitor gains controls. They sit in the page header and side panel, and on a right-click menu over each worker in the office scene:

- **Stop**: kills the running sessions now.
- **Pause**: the queue stops cleanly after the current task, or after the current group and its merge.
- **Continue**: launches the runner again in its own window.
- **Skip**: a task that has not started is skipped, or un-skipped while the queue has not reached it.
- **Retry**: a failed task is retried, either by resuming its session or from scratch, with an optional note from the user.
- **Edit brief**: the brief of a task that has not started is edited in the page.

The monitor does not reach into the runner. It writes the user's commands to a **control file** in the run folder. The runner reads that file before each task and applies it. Stop and Continue are the exceptions: the monitor kills the runner's process tree and launches a new runner itself. Every action is recorded in `progress.log`. A command-line or chat front end can later write the same file without changing the runner.

Only the page served by the monitor on this computer can send commands: requests must carry a token handed out with the page, and come from the monitor's own origin. Stop and Skip ask for confirmation. The other actions do not.

## User Stories

1. As a queue user, I want a Stop button in the page header, so that I can halt a queue that is going wrong without hunting for its window.
2. As a queue user, I want Stop to ask me to confirm, so that a stray click does not kill an hour of work.
3. As a queue user, I want Stop to kill every running session of the queue, sequential, parallel and conflict sessions alike, so that nothing keeps editing the repository after I stopped it.
4. As a queue user, I want a task killed by Stop to resume its own session when I continue, with a message telling it that it was stopped and should carry on, so that its context and work are not lost.
5. As a queue user, I want Stop during a group to leave every worktree and branch in place, so that Continue picks each task up where it was.
6. As a queue user, I want the tasks of a group that were already DONE when I stopped to stay DONE, so that they are not run again.
7. As a queue user, I want Stop during a merge step or a conflict session to undo the merge in progress, so that the main checkout is left clean.
8. As a queue user, I want Continue after a Stop during a merge to try the merge again, so that the group is completed as if nothing happened.
9. As a queue user, I want a Pause button, so that the queue stops cleanly at the next task boundary instead of mid-task.
10. As a queue user, I want Pause during a group to take effect only after the group has finished and been merged, so that a group is never split.
11. As a queue user, I want to cancel a Pause I asked for before it takes effect, so that I can change my mind.
12. As a queue user, I want the page to show "pausing" while a pause is pending and "paused" once it has taken effect, so that I know whether the queue is still working.
13. As a queue user, I want a Continue button on a stopped, paused or interrupted queue, so that I can restart it without opening a terminal.
14. As a queue user, I want Continue to open the runner in its own visible window, as the skill does, so that I can still watch the live messages there.
15. As a queue user, I want Continue to be unavailable while the queue's runner is alive, so that two runners never work on the same run folder.
16. As a queue user, I want a runner started by hand while another runner of the same run folder is alive to refuse at once, so that I cannot cause the same conflict from a terminal.
17. As a queue user, I want a runner whose lock was left by a dead process to start normally, so that a crash does not lock the run folder forever.
18. As a queue user, I want to skip a task that has not started, so that a task I no longer need does not run.
19. As a queue user, I want Skip to ask me to confirm, so that I do not drop a task by accident.
20. As a queue user, I want to un-skip a task while the queue has not reached it, so that I can undo a skip.
21. As a queue user, I want a skipped task to get a report that starts with `SKIPPED`, so that the run folder records what happened to it.
22. As a queue user, I want a skipped task to be shown grey, with an empty grey desk in the scene, so that I can tell it apart from done and failed tasks.
23. As a queue user, I want a task that is marked to be skipped but not reached yet to be shown as such, so that I can see what the queue will leave out.
24. As a queue user, I want a finished queue with skipped tasks to say "finished, N skipped" in the page, the log and the notification, so that a partial queue is not mistaken for a complete one.
25. As a queue user, I want a re-run to treat skipped tasks as finished, so that they are not started later by accident.
26. As a queue user, I want to skip a task of a group before the group starts, so that I can drop one of several parallel tasks.
27. As a queue user, I want a group left with one task after skips to run that task as an ordinary sequential task, so that no worktree is made for a single task.
28. As a queue user, I want a group whose tasks are all skipped to be passed over without a merge step, so that nothing is merged.
29. As a queue user, I want Skip to be unavailable for the tasks of a group that has started, so that a running group is never changed underneath its sessions.
30. As a queue user, I want to retry a failed or stopped task by resuming its session, so that the session keeps what it learned.
31. As a queue user, I want to retry a failed or stopped task from scratch instead, so that I can get rid of a session that went the wrong way.
32. As a queue user, I want to add a short note to a retry, so that I can tell the session what went wrong and what to do.
33. As a queue user, I want the note of a resumed retry to go into the resume message, and the note of a fresh retry to be appended to the brief, so that the session sees it either way and the brief keeps a record of it.
34. As a queue user, I want Retry to start the queue again from that task, so that one click does both.
35. As a queue user, I want the resume variant of Retry to be unavailable when the task has no session to resume, so that I am not offered something that cannot work.
36. As a queue user, I want a failed parallel task to be retried in its own worktree, so that its branch and its partial work are kept.
37. As a queue user, I want to edit the brief of a task that has not started, in a text box in its drawer, so that I can fix it without leaving the page.
38. As a queue user, I want saving a brief to be refused when its task has started in the meantime, so that I never believe a change reached a session that did not see it.
39. As a queue user, I want a saved brief to be written whole, never half-written, so that the runner never reads a broken brief.
40. As a queue user, I want the brief editor to be available for the tasks of a group that has not started, so that parallel tasks can be fixed too.
41. As a queue user, I want the task drawer to show the actions available for that task, so that I can act on the task I am looking at.
42. As a queue user, I want to right-click a worker in the scene to get a small menu with that task's available actions, so that I can act straight from the office view.
43. As a keyboard user, I want to open that menu on a focused worker with Shift+F10 or the context-menu key, so that the scene's actions do not need a mouse.
44. As a queue user, I want a left click on a worker to keep opening its drawer, so that the existing way of reading a task does not change.
45. As a queue user, I want the menu to list only what is possible for that task in its current state, so that I am not offered actions that will be refused.
46. As a queue user, I want queue-level actions only in the header and the side panel, not in the scene, so that the scene stays a view.
47. As a queue user, I want paused workers to sit and wait, with "PAUSED" in the scene's heading, so that a paused queue looks paused.
48. As a queue user, I want a task killed by Stop to show the red mark of a stopped task at its desk, so that I can see what was cut off.
49. As a queue user, I want every action, mine or refused, to leave a line in `progress.log` saying what was asked, so that the run folder records when and how I stepped in.
50. As a queue user watching the runner window, I want the runner to print in yellow each command it applies, so that the window explains why the queue skipped or paused.
51. As a queue user, I want controls on any unfinished run in the run list, not only the newest, so that I can continue or clean up an older queue.
52. As a queue user, I want no controls on a finished run, so that a completed queue cannot be changed by accident.
53. As a queue user, I want no controls on a run folder whose runner copy predates this feature, so that the page never sends commands that runner would ignore.
54. As a queue user, I want a refused action to tell me why in the page, for example that the task has already started, so that I know what happened.
55. As a queue user, I want other websites open in my browser to be unable to send commands to the monitor, so that a malicious page cannot stop or change my queue.
56. As a queue user, I want the monitor to keep listening on this computer only, so that nobody on the network can control my queues.
57. As a queue user, I want the controls to work in light and dark themes and at phone width, so that the page stays usable wherever I open it.
58. As a skill user, I want the skill's closing notes to tell me that the monitor can stop, pause, continue, skip, retry and edit, so that I know the controls exist.

## Implementation Decisions

### Vocabulary

- **Admin action**: one of stop, pause, cancel pause, continue, skip, un-skip, retry, edit brief, asked for by the user.
- **Control file**: `control.json` in the run folder. It holds the user's standing commands to the runner.
- **Run lock**: `runner.lock` in the run folder. It holds the process id of the runner that works on the run folder.
- **Hard stop**: the stop action: the runner's process tree is killed at once.
- **Pause**: a stop at the next task boundary, or after the merge step for a group.
- **Skipped task**: a task the runner passed over because the control file listed it.
- **Admin line**: a `progress.log` line recording an admin action.

### Control file

- The control file is written only by the monitor server. The runner reads it and never writes it. Every write replaces the file whole (temporary file, then rename).
- Its content is the user's standing state, not a queue of commands:
  - `skip`: the task ids to skip;
  - `pause`: whether a pause is asked for;
  - `retry`: per task id, the retry asked for: `mode` (`resume` or `fresh`), an `id` that is unique per request, and an optional `note`;
  - `resume`: per task id, the session id of a task killed by a hard stop, with an `id` unique per request.
- A missing or unreadable control file means no commands. An unreadable one also gives an admin line saying it was ignored.
- One-shot entries (`retry`, `resume`) are applied at most once. The runner writes an admin line naming the entry's `id` when it applies one. The runner and the server both treat an entry whose `id` already appears in such a line as used.
- The file carries a `version` field. A runner reads only a version it knows.

### Runner

- The runner reads the control file before each sequential task, before each group, and after each merge step. It never reads it while a session runs.
- **Skip.** A task listed in `skip` and not DONE gets the report `results\NN.md`. Its first line is `SKIPPED`, followed by a line saying it was skipped by the user. The runner writes its progress line and moves on.
  - A skipped task counts as finished on a re-run, as DONE does.
  - Un-skipping is possible only while the queue has not reached the task. Once a task has a `SKIPPED` report, it stays skipped.
- **Groups and skip.** At the start of a group the runner removes skipped tasks from it:
  - two or more left: the group runs as today with those tasks;
  - one left: that task runs as a sequential task, in the main checkout;
  - none left: the group is passed over, with no merge step.
  - Skip entries for the tasks of a group are not re-read once the group has started.
- **Pause.** When `pause` is set at one of the read points, the runner writes the pause line and exits cleanly. Exit code 0 distinguishes a pause from a stop. A re-run with `pause` still set pauses again before doing anything. Continue clears `pause` first.
- **Resume after a hard stop.** When the runner reaches a task with an unused `resume` entry, it resumes that session. The resume message tells the session that the user stopped it and that it should carry on with its task and write its report. The no-report rule applies as for any session. A parallel task is resumed in its worktree.
- **Retry.** When the runner reaches a task with an unused `retry` entry:
  - `resume`: it resumes the task's last session with a message saying the earlier attempt did not finish, its report's path, and the user's note;
  - `fresh`: it starts a new session as today's re-run does (with the pointer to the earlier report). The note was already appended to the brief by the server.
- **Run lock.**
  - At start the runner reads `runner.lock`. If it names a live process that is a runner of this run folder, it prints that and exits at once without writing to `progress.log`.
  - Otherwise it writes its own process id and goes on. It removes the lock when it exits normally.
  - The parallel child processes neither check nor take the lock.
- **Feature marker.** The runner script carries a fixed marker line naming the version of the control contract it supports. The server reads the run folder's copy for that marker.
- Queues without a control file run exactly as today. The runner stays Windows PowerShell 5.1 compatible.

### Progress line contract

- Admin lines start with `admin: `, after the usual timestamp. The runner writes those for what it applies:
  - skip;
  - pause;
  - resume after stop (with the entry's `id`);
  - retry (with mode and `id`);
  - an ignored control file.
- The server writes those for what it does itself:
  - hard stop (which tasks were cut off);
  - merge undone;
  - continue launched;
  - brief edited;
  - retry or skip requested;
  - actions refused.
- New non-admin lines:
  - a skipped task's line, in the task-line format with `SKIPPED (by the user)`;
  - `Queue - PAUSED (by the user)`;
  - `Queue - STOPPED (by the user)`, written by the server after a hard stop;
  - a final line for a queue that finished with skips, in the place of today's "All N tasks DONE" line.
- The exact wording of each line is fixed in the runner ticket and recorded in this folder's README, as the parallel-tasks README did. That wording is the contract the server parses.

### Monitor: server

- **API.** The server accepts POST on one admin endpoint. Every other non-GET request is still refused with 405.
  - The request names the run, the action, and where needed the task, the retry mode, the note, or the brief text.
  - Answers:
    - 200 when the action was applied;
    - 409 when the action is not allowed in the run's current state, with the reason;
    - 400 for a malformed request;
    - 403 for a bad token, origin or host.
- **Security.**
  - The server still listens on 127.0.0.1 only and still refuses a foreign Host.
  - Each server start makes a random token and hands it to the page with the page itself.
  - Admin requests must carry the token in a header and an Origin equal to the monitor's own origin.
- **Allowed actions.** The server judges each action against the state it already derives (run state, per-task state, groups, merge steps, process table). It uses the same rules the page uses to show controls:
  - stop: the runner is alive;
  - pause and cancel pause: the runner is alive and the run is not finished;
  - continue: the run is not finished and no runner of it is alive;
  - skip: the task has not started and is not in a group that has started;
  - un-skip: the task is marked to be skipped and has no `SKIPPED` report yet;
  - retry: the task is failed or stopped and no runner is alive. Resume mode needs a session id;
  - edit brief: the task has not started and is not in a group that has started.
- **Hard stop.**
  - The server finds the runner, its `-ParallelTask` children and their session processes in the process table it already reads, and kills that whole tree.
  - It writes a `resume` entry for each task that had a session running.
  - If a merge was in progress in the main checkout, it runs `git merge --abort` there.
  - It writes its admin lines, then `Queue - STOPPED (by the user)`.
- **Continue.**
  - The server clears `pause`, writes its admin line, and launches the run folder's `run.ps1` in a new visible PowerShell window, the way the skill does.
  - Retry is the same launch, after writing the `retry` entry. A fresh retry with a note first appends the note to the brief under a heading that says it is the user's note for a retry, with the time.
- **Brief edit.** The server writes the brief whole (temporary file, then rename) after checking that the task has not started. A narrow race remains: the runner may start the task between the check and the write. It is accepted, and recorded in Further Notes.
- **New derived states.**
  - The run state gains `pausing` (pause asked, runner alive), `paused` and `finished-with-skips`.
  - A task gains `skipped` and a `skipPending` flag.
  - A task cut off by a hard stop is `stopped`, with a reason saying the user stopped it.
  - The run answer also says whether the run supports admin actions (the runner copy's marker) and which actions are allowed for the run and for each task. The page shows exactly those.
- The idle exit is unchanged. A server started by Continue's launch is not needed, since the server is already running.

### Monitor: page

- **Header.** For an unfinished run that supports admin actions, the header shows Stop, Pause (or Cancel pause while pausing) and Continue, each enabled per the run answer.
- **Task drawer.**
  - The drawer shows the task's actions: Skip, Un-skip, Retry and Edit brief.
  - Retry offers the two modes and a note field.
  - Edit brief turns the Brief tab into a text box with Save and Cancel. A refused save shows the reason and keeps the text.
- **Scene.**
  - A right-click on a worker opens a small menu in the scene's pixel style, with the task's allowed actions. So do Shift+F10 and the context-menu key on a focused worker.
  - Edit brief from the menu opens the drawer with the editor open. Retry from the menu opens the drawer on its retry form.
  - Left click, Enter and hover keep their current behaviour.
- **Confirmation.** Stop and Skip ask for confirmation in a dialog. Pause, Cancel pause, Continue, Un-skip, Retry and Edit brief do not.
- **New states in the scene.** No new sprites; existing ones are reused.
  - Paused: workers sit and wait, and the scene heading reads "PAUSED".
  - Hard stop: the stopped task gets the existing red stopped mark.
  - Skipped: the task's desk is grey and empty. A skip-pending task is greyed in the queue line.
- **Feedback.** A refused or failed action shows its reason near the control that sent it. The page updates from its normal polling, not from the POST answer alone.
- Light and dark themes, phone width (375 px) and keyboard use apply to every new control.

### Skill instructions

- Step 5's notes to the user say that the monitor can stop, pause, continue, skip, retry and edit briefs of unfinished queues, and that a run is better continued from the monitor than by hand, since the run lock refuses a second runner.
- The skill's own behaviour is unchanged. It does not administer queues.

### Compatibility

- A run folder keeps its own runner copy. A run folder whose copy lacks the feature marker gets no controls. Copying the new runner into an old run folder enables them, as the handoff rule for runner updates already says.
- Run folders without `control.json`, `runner.lock` or admin lines are read exactly as before.

## Testing Decisions

- A good check drives only real inputs and asserts only on what the user or the next program can observe. It never reaches into the runner's functions, the server's internals or the page's modules. The control file's format stays inside the seam: checks press buttons or send requests, they do not write `control.json`.
- There is one seam: **page or HTTP request → monitor server → run folder → the real runner, with a stub `claude`, on a throwaway git repository → observable results.**
  - Inputs:
    - controls pressed in Claude's built-in browser pane (header, drawer, the scene's right-click menu);
    - HTTP POSTs with and without the token.
  - Observed:
    - the page (accessibility tree, text, screenshots) and the API answers;
    - `progress.log`, admin lines included, and the reports, `SKIPPED` included;
    - the stub's record of calls: resumed or new session, the prompt text with or without the note;
    - the process table: sessions killed, a second runner exiting;
    - the repository's state: worktrees, branches, merge in progress or not, working tree status.
- The stub `claude` gains one ability: stay "working" until a release file appears. That makes stop, pause, and refused edits during a running task checkable. The parallel-tasks checks already have a similar wait.
- The server under test runs with the queue-root variable pointing at the fixtures and a port other than 4747. The real queue root and any monitor on 4747 are not touched. Continue's launch opens a real window from the fixtures' run folder. That is accepted for the checks.
- Scenarios:
  - Stop during a sequential task: the session is killed, the task is stopped, and Continue resumes the same session with the stopped-by-user message and then continues the queue.
  - Stop during a group of two with one task already DONE: both live sessions are killed, the worktrees and branches remain, and Continue resumes only the unfinished one, then merges.
  - Stop during a conflict session: the merge is aborted, the main checkout is clean, and Continue tries the merge again.
  - Pause during a sequential task: the queue pauses after it. Cancel pause before then: the queue goes on. Continue after a pause: the queue goes on from the next task.
  - Pause during a group: the queue pauses only after the merge step.
  - Skip a pending task: it gets the `SKIPPED` report, the next task runs, and the run finishes with "1 skipped". Un-skip before it is reached: it runs.
  - Skip inside a group not yet started: one task left runs sequentially without a worktree. All skipped: no merge step. Skip in a started group: refused with 409.
  - Retry with resume and a note: the stub is called with `--resume` and the note. Retry fresh with a note: a new session, and the brief ends with the note. Resume offered without a session id: refused.
  - Edit brief of a pending task: the next session's prompt carries the new brief. Edit of a running task: refused, and the file is unchanged.
  - A second runner started by hand while one is alive: it exits at once, and `progress.log` gains nothing from it. A stale lock with a dead process id: the runner starts.
  - A run folder whose runner copy has no feature marker: no controls in the page, and POSTs are refused.
  - A finished run: no controls.
  - Security: no token, a wrong token, a foreign Origin and a foreign Host each answer 403 and change nothing. Non-POST methods on the admin endpoint and non-GET elsewhere answer 405.
  - The page: every control and menu by accessible name; confirmation dialogs for Stop and Skip only; the menu lists only allowed actions; left click still opens the drawer; Shift+F10 opens the menu. The paused, stopped and skipped looks are checked by screenshot, in light and dark, and at 375 px.
  - Old run folders and fixtures from the earlier specs still display as before.
- Notifications are not checked in the pane, as before. Their new "finished, N skipped" wording is checked in the code by reading.
- The skill's notes are checked by reading.
- One real check at the end, with real sessions on a scratch repository, is the only check that costs money. A queue of three tasks with one group of two: stop and continue during the group, skip the last task, and retry one task by resume.
- Prior art: the runner checks (`check-runner.ps1`, `check-parallel.ps1`, the stub `claude`) and the monitor checks (`check-states.mjs`, `check-http.mjs`, `check-parallel.mjs`, the fake runner). They live outside the repository in `%TEMP%\task-queue-monitor-fixtures`. If they are gone, they are rebuilt from the earlier specs' Testing Decisions. The fake runner is not used for the new checks; the real runner is. Nothing is committed: no test suite, no fixtures, no npm.

## Out of Scope

- Adding, removing or reordering tasks of a queue.
- Changing the model, effort, permission mode or `maxParallel` of a queue after it was written.
- Archiving or deleting run folders.
- A command-line or chat front end for admin actions. The control file allows them later.
- Controlling a running session beyond killing it: sending it a message, changing its brief mid-run.
- Skipping or editing the tasks of a group after the group has started.
- Retrying a conflict session on its own. Continue tries the merge again.
- Undoing a skip once its task has a `SKIPPED` report.
- Access from other computers, user accounts, passwords.
- New sprites or scene objects for queue-level controls.
- A committed test suite or committed fixtures.

## Further Notes

- This spec comes from a design interview with the user, and the decisions above are theirs. These defaults were chosen while writing and can be overruled:
  - The server finds the processes to kill in the process table it already reads, instead of the runner writing session process ids to the run folder, as the interview said. The server already attributes every session to its task. The run lock still holds the runner's process id.
  - The server, not the runner, writes the lines for a hard stop, since the runner is dead by then.
  - A pause ends the runner with exit code 0. The page tells pause from stop by its line, not the exit code.
  - The control file is written only by the server. One-shot entries are marked used by admin lines, not by the runner rewriting the file, so the two never write the same file.
  - A fresh retry's note is written into the brief file, so the Brief tab shows it. A resumed retry's note goes only into the resume message and its admin line.
  - The runner copy's marker decides whether a run folder gets controls.
  - The run state names `pausing`, `paused`, `finished-with-skips`, and the task state `skipped`.
- The brief-edit race: the server checks that the task has not started, then writes. The runner reads the brief when it starts the task. A start between the two can miss the edit. The window is milliseconds, the runner only starts a task at a boundary, and the edit's admin line shows when it happened. A lock between server and runner was judged not worth it.
- Killing a session mid-tool-call can leave a half-written file in the working tree. Resuming the same session lets it see and repair that, which is one reason resume was chosen over a fresh start.
- Suggested tickets, in build order:
  1. the runner: control file, skip, pause, resume after stop, retry, run lock, marker, progress lines;
  2. the server: admin endpoint, security, hard stop, continue, brief edit, derived states;
  3. the page header and drawer controls, with the brief editor;
  4. the scene's right-click menu and the new looks;
  5. the skill notes.

  Tickets 1 and 2 are checkable with the stub and HTTP alone. Tickets 3 and 4 depend on 2. Ticket 5 can go any time after 1.
