[CmdletBinding()]
param([int]$Port = 4173, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choisir un port entre 1024 et 65535.' }
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js est requis pour lancer le serveur local. Installer Node.js puis relancer ce fichier.' }
$gameUrl = 'http://127.0.0.1:' + $Port
function Test-GameServer {
    try {
        $response = Invoke-WebRequest -Uri $gameUrl -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -eq 200 -and $response.Content.Contains('js/main.js') -and $response.Content.Contains('Terres')
    } catch { return $false }
}
if (-not (Test-GameServer)) {
    $runtimeDirectory = Join-Path $PSScriptRoot '.sites-runtime'
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $serverScript = Join-Path $PSScriptRoot 'server.mjs'
    $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $serverScript + '"'), [string]$Port) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-GameServer)) {
        if ($serverProcess.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw "Le serveur n'a pas pu demarrer sur le port $Port. Essayer start.ps1 -Port 4174." }
        Start-Sleep -Milliseconds 150
    }
    [pscustomobject]@{ pid=$serverProcess.Id; started_utc=$serverProcess.StartTime.ToUniversalTime().ToString('o'); script=$serverScript; port=$Port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.json') -Encoding UTF8
}
Write-Host "Jeu pret : $gameUrl"
Write-Host 'Le serveur reste actif. Pour le fermer : .\stop.ps1'
if (-not $NoBrowser) { Start-Process $gameUrl }
