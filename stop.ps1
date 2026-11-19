$ErrorActionPreference = 'Stop'
$runtimeFile = Join-Path $PSScriptRoot '.sites-runtime\server.json'
if (-not (Test-Path -LiteralPath $runtimeFile)) { Write-Host 'Aucun serveur lance par start.ps1.'; exit 0 }
$serverInfo = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
$serverProcess = Get-Process -Id $serverInfo.pid -ErrorAction SilentlyContinue
if ($serverProcess) {
    $actualStart = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    $commandInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$serverInfo.pid)
    $expectedScript = Join-Path $PSScriptRoot 'server.mjs'
    if ($actualStart -ne $serverInfo.started_utc -or $serverProcess.ProcessName -ne 'node' -or -not $commandInfo.CommandLine.Contains($expectedScript)) { throw 'Ce processus ne correspond pas au serveur du projet. Aucun processus ferme.' }
    Stop-Process -Id $serverProcess.Id
}
Remove-Item -LiteralPath $runtimeFile
Write-Host 'Serveur du jeu ferme.'
