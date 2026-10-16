# Makes sure a task-queue monitor of this plugin's version answers on its port. A monitor that answers an
# older version, or none, is stopped and started again from this plugin's server.mjs, but only when the
# process listening on the port runs a server.mjs: runners and sessions are separate processes and live on.
# Prints what it did; exits 1 when the port is held by another program or the new monitor does not answer.
# Windows PowerShell 5.1 compatible.
param([int]$Port = 0)

$ErrorActionPreference = 'Stop'
if (-not $Port) { $Port = if ($env:TASK_QUEUE_MONITOR_PORT) { [int]$env:TASK_QUEUE_MONITOR_PORT } else { 4747 } }
$server = (Resolve-Path (Join-Path $PSScriptRoot '..\task-queue\monitor\server.mjs')).Path
$wanted = [int][regex]::Match((Get-Content -Raw $server), '(?m)^const VERSION = (\d+);').Groups[1].Value

function Get-Version {
    try { $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3 } catch { return $null }
    if ($null -eq $health.version) { return 0 }
    return [int]$health.version
}

$running = Get-Version
if ($null -ne $running -and $running -ge $wanted) {
    Write-Output "The monitor (version $running) is running on port $Port."
    exit 0
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ("$($process.CommandLine)" -notmatch 'server\.mjs') {
        Write-Output "Port $Port is held by $($process.Name) (process $($listener.OwningProcess)), which is not a task-queue monitor. Nothing was stopped."
        exit 1
    }
    Stop-Process -Id $listener.OwningProcess -Force
    foreach ($i in 1..20) {
        if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
    $old = if ($running) { "version $running" } else { 'no version' }
    Write-Output "Stopped the monitor on port $Port ($old, process $($listener.OwningProcess)); running queues were not touched."
}

# Hidden, so it outlives this session. The inner double quotes are needed: Start-Process joins the arguments
# without quoting them. The server reads its port from the environment.
$env:TASK_QUEUE_MONITOR_PORT = "$Port"
Start-Process node -ArgumentList "`"$server`"" -WindowStyle Hidden
foreach ($i in 1..30) {
    $now = Get-Version
    if ($null -ne $now -and $now -ge $wanted) {
        Write-Output "Started the monitor (version $now) on port $Port."
        exit 0
    }
    Start-Sleep -Milliseconds 500
}
Write-Output "The monitor did not answer on port $Port within 15 seconds. Run: node `"$server`""
exit 1
