$ErrorActionPreference = 'Stop'

# Keep this file encoded as UTF-8 with BOM for Windows PowerShell 5.1.

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolver = Join-Path $projectRoot 'scripts\ensure-node.ps1'
$nodeExe = (& $resolver -ProjectRoot $projectRoot | Select-Object -Last 1)
if (-not $nodeExe -or -not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
  throw 'Не удалось подготовить совместимую локальную среду Node.js.'
}

$nodeMajor = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
  throw "Требуется поддерживаемая Node.js 24 или новее; найден $(& $nodeExe --version)."
}

Set-Location -LiteralPath $projectRoot
Write-Host 'Запуск защищённого локального runtime. Для остановки нажмите Ctrl+C.'
& $nodeExe (Join-Path $projectRoot 'server.js')
