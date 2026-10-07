---
name: queue-monitor
description: Start the task-queue monitor (the admin panel at http://127.0.0.1:4747/) again and open it in the browser.
disable-model-invocation: true
---

The monitor is `task-queue\monitor\server.mjs`, in the `task-queue` skill folder beside this one. It exits by itself after two idle hours with no queue running, so it needs a restart now and then. Started while it is already running, it only opens the browser and exits.

1. Start it hidden, so it outlives this session. The inner double quotes are needed: `Start-Process` joins the arguments without quoting them.

   ```powershell
   Start-Process node -ArgumentList '"<the task-queue skill folder>\monitor\server.mjs"', '--open' -WindowStyle Hidden
   ```

2. Wait for it to answer, up to 15 seconds:

   ```powershell
   $ok = $false; foreach ($i in 1..15) { try { Invoke-WebRequest http://127.0.0.1:4747/api/runs -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep 1 } }; $ok
   ```

   Done when it prints `True`. On `False`, start `node "<the task-queue skill folder>\monitor\server.mjs"` in the foreground for a few seconds and show the user its error (a missing `node`, or port 4747 held by another program).

3. Tell the user, in their language and in one or two lines: the monitor is at `http://127.0.0.1:4747/` and open in their browser, where every queue under `%USERPROFILE%\.claude-queues` can be watched and its unfinished runs stopped, paused, continued, skipped, retried or have their briefs edited.
