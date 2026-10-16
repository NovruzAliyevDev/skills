---
name: queue-monitor
description: Start the task-queue monitor (the admin panel at http://127.0.0.1:4747/) again, replacing one left running from an older version of the plugin, and open it in the browser.
disable-model-invocation: true
---

The monitor is `task-queue/monitor/server.mjs`, in the `task-queue` skill folder beside this one. It exits by itself after two idle hours with no queue running, so it needs a restart now and then. A monitor left running from an older version of the plugin keeps its old code, so it is replaced too.

1. Make sure a monitor of this plugin's version is running, and open it in the browser. The script is the `ticket-queue` skill's, in the folder beside this one. It replaces an older monitor (only a process that runs a `server.mjs`; queues that are running are not touched), starts one when none answers, then opens the page. The command is the same in any shell, on Windows and macOS:

   ```sh
   node "<the ticket-queue skill folder>/ensure-monitor.mjs" --open ""
   ```

   On exit code 1, show the user the line it printed (port 4747 held by another program, or a monitor that did not start) and stop here. A monitor that does not start may lack `node`: `node "<the task-queue skill folder>/monitor/server.mjs"` in the foreground for a few seconds shows its error.

2. Tell the user, in their language and in one or two lines: the monitor is at `http://127.0.0.1:4747/` (the port is `TASK_QUEUE_MONITOR_PORT` when that is set) and open in their browser, where every queue under `~/.claude-queues` can be watched and its unfinished runs stopped, paused, continued, skipped, retried or have their briefs edited, and where New queue opens the ticket picker of a repository registered with `/novruzaliyev-skills:ticket-queue`. Say also what step 1 printed when it stopped an older monitor.
