$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCommand) {
  $nodeExe = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $bundledNode) {
  $nodeExe = $bundledNode
} else {
  throw 'Node.js 20+ не найден. Установите Node.js из доверенного корпоративного источника.'
}

$nodeMajor = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
  throw "Требуется Node.js 20 или новее; найден $(& $nodeExe --version)."
}

Set-Location -LiteralPath $projectRoot
Write-Host 'Запуск защищённого локального runtime. Для остановки нажмите Ctrl+C.'
& $nodeExe (Join-Path $projectRoot 'server.js')
