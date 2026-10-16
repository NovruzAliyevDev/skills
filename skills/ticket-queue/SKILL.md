---
name: ticket-queue
description: Register this repository with the task-queue monitor and open its ticket picker, where the repository's .scratch tickets are picked and started as an unattended queue.
disable-model-invocation: true
---

You only open the picker. Never read, write, order or summarise tickets, and never write JSON yourself: the picker page and the scripts beside this file do all of it. Each command below is a `node` command, the same in any shell, on Windows and macOS.

1. Find the repository root: `git rev-parse --show-toplevel`, or this session's working directory when that fails (not a git repository).

2. Register it. The script adds the repository to `repos.json` in the queue root, or leaves it as it is when it is there already, and prints its project name:

   ```sh
   node "<this skill's folder>/register.mjs" "<the repository root>"
   ```

   Done when it prints one name, such as `OilCard`.

3. Make sure a monitor of this plugin's version is running, and open the picker for the repository, with the project name from step 2. The script replaces an older monitor (only a process that runs a `server.mjs`; queues that are running are not touched), starts one when none answers, then opens the page in the browser:

   ```sh
   node "<this skill's folder>/ensure-monitor.mjs" --open "#new:<Project>"
   ```

   On exit code 1, show the user the line it printed (port 4747 held by another program, or a monitor that did not start) and stop here.

4. Tell the user, in their language and in one or two lines: the ticket picker for this repository is open at `http://127.0.0.1:4747/#new:<Project>` (the port is `TASK_QUEUE_MONITOR_PORT` when that is set), where they tick tickets, set the permission mode, model and effort, and press Start.
