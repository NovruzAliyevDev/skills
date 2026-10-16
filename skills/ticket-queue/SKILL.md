---
name: ticket-queue
description: Register this repository with the task-queue monitor and open its ticket picker, where the repository's .scratch tickets are picked and started as an unattended queue.
disable-model-invocation: true
---

You only open the picker. Never read, write, order or summarise tickets, and never write JSON yourself: the picker page and the scripts beside this file do all of it.

1. Find the repository root: `git rev-parse --show-toplevel`, or this session's working directory when that fails (not a git repository).

2. Register it. The script adds the repository to `repos.json` in the queue root, or leaves it as it is when it is there already, and prints its project name:

   ```powershell
   & "<this skill's folder>\register.ps1" -Path "<the repository root>"
   ```

   Done when it prints one name, such as `OilCard`.

3. Make sure a monitor of this plugin's version is running. The script replaces an older monitor (only a process that runs a `server.mjs`; queues that are running are not touched) and starts one when none answers:

   ```powershell
   & "<this skill's folder>\ensure-monitor.ps1"
   ```

   On exit code 1, show the user the line it printed (port 4747 held by another program, or a monitor that did not start) and stop here.

4. Open the picker for the repository, with the project name from step 2 (the port is `TASK_QUEUE_MONITOR_PORT` when that is set):

   ```powershell
   Start-Process "http://127.0.0.1:4747/#new:<Project>"
   ```

5. Tell the user, in their language and in one or two lines: the ticket picker for this repository is open at that address, where they tick tickets, set the permission mode, model and effort, and press Start.
