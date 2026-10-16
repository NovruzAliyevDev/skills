# Registers a repository with the task-queue monitor's ticket picker and prints its project name.
# The register is repos.json in the queue root ($env:TASK_QUEUE_ROOT or ~\.claude-queues). A repository
# already there keeps its entry; paths compare case-insensitively, without a trailing backslash.
# Windows PowerShell 5.1 compatible.
param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false

$queueRoot = $env:TASK_QUEUE_ROOT
if (-not $queueRoot) { $queueRoot = Join-Path $env:USERPROFILE '.claude-queues' }
New-Item -ItemType Directory -Force $queueRoot | Out-Null
$registerFile = Join-Path $queueRoot 'repos.json'

function Normalize([string]$p) { return [System.IO.Path]::GetFullPath($p).TrimEnd('\') }
$repoPath = Normalize $Path

$repos = @()
if (Test-Path $registerFile) {
    $register = Get-Content -Raw -Encoding UTF8 $registerFile | ConvertFrom-Json
    if ($register -and $register.repos) { $repos = @($register.repos) }
}

$known = $repos | Where-Object { (Normalize "$($_.path)") -ieq $repoPath } | Select-Object -First 1
if ($known) { Write-Output $known.project; exit 0 }

# The folder name in CamelCase: words split at spaces, dashes, underscores and dots, characters outside the
# monitor's name pattern dropped, each word's first letter raised.
$words = (Split-Path -Leaf $repoPath) -split '[\s._-]+' | ForEach-Object { $_ -replace '[^A-Za-z0-9]', '' } | Where-Object { $_ }
$name = ($words | ForEach-Object { $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1) }) -join ''
if (-not $name) { $name = 'Repository' }
$project = $name
$taken = @($repos | ForEach-Object { "$($_.project)" })
for ($n = 2; $taken -contains $project; $n++) { $project = "$name$n" }

$repos += [pscustomobject]@{ project = $project; path = $repoPath; addedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
$json = ConvertTo-Json -Depth 5 ([pscustomobject]@{ version = 1; repos = $repos })

# Written whole: a temporary file, then a rename over the register.
$temp = "$registerFile.$PID.tmp"
[System.IO.File]::WriteAllText($temp, $json, $utf8)
Move-Item -Force $temp $registerFile
Write-Output $project
