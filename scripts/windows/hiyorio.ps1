# Správa Hiyorio na pozadí ve Windows.
#
#   npm run bg:start          spustí server skrytě na pozadí
#   npm run bg:stop           zastaví ho
#   npm run bg:status         vypíše, jestli běží
#   npm run autostart         spouštění po přihlášení do Windows (zástupce ve složce Po spuštění)
#   npm run autostart:remove  zruší spouštění po přihlášení
param([Parameter(Mandatory)][ValidateSet('start', 'stop', 'status', 'install', 'remove')][string]$Action)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $here 'start-hidden.vbs'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hiyorio.lnk'
$port = if ($env:PORT) { [int]$env:PORT } else { 7000 }

function Get-ServerProcesses {
  # smyčka run-server.cmd a node, který spustila (ta používá src\server.js
  # se zpětným lomítkem, ručně spuštěný `npm start` tedy nezasáhne)
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*run-server.cmd*') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*src\server.js*')
  }
}

function Test-Running {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$port/health"
    return $res.StatusCode -eq 200
  } catch {
    return $false
  }
}

switch ($Action) {
  'start' {
    if (Test-Running) { "Hiyorio už běží na http://127.0.0.1:$port"; break }
    # Přes Průzkumník, aby server nebyl potomkem tohoto okna a přežil jeho zavření.
    Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$vbs`""
    foreach ($i in 1..90) {
      Start-Sleep -Milliseconds 500
      if (Test-Running) { "Hiyorio běží na pozadí: http://127.0.0.1:$port/configure"; break }
    }
    if (-not (Test-Running)) { "Server se nespustil, podívej se do logs\server.log" }
  }
  'stop' {
    $procs = @(Get-ServerProcesses)
    # nejdřív smyčka, ať node znovu nespustí
    $procs | Sort-Object { $_.Name -ne 'cmd.exe' } | ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if (Test-Running) { "Server na portu $port pořád odpovídá (možná je spuštěný ručně přes npm start)." }
    else { 'Hiyorio zastaveno.' }
  }
  'status' {
    if (Test-Running) { "Běží: http://127.0.0.1:$port/configure" } else { 'Neběží.' }
    if (Test-Path $shortcut) { 'Spouštění po přihlášení: zapnuto' } else { 'Spouštění po přihlášení: vypnuto' }
  }
  'install' {
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($shortcut)
    $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $lnk.Arguments = "`"$vbs`""
    $lnk.WorkingDirectory = $here
    $lnk.Description = 'Hiyorio – titulky z Hiyori pro Stremio'
    $lnk.Save()
    "Spouštění po přihlášení zapnuto ($shortcut)."
  }
  'remove' {
    if (Test-Path $shortcut) { Remove-Item $shortcut; 'Spouštění po přihlášení vypnuto.' }
    else { 'Spouštění po přihlášení nebylo zapnuté.' }
  }
}
