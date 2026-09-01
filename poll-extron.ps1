[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Plan,

  [Parameter(Mandatory = $true)]
  [string]$Credentials,

  [Parameter(Mandatory = $true)]
  [string]$Output,

  [Parameter(Mandatory = $false)]
  [ValidateRange(500, 30000)]
  [int]$Timeout = 7000,

  [Parameter(Mandatory = $false)]
  [switch]$AllowInsecureTls
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$nodePath = & (Join-Path $projectRoot 'scripts\ensure-node.ps1') -ProjectRoot $projectRoot
$nodeExecutable = @($nodePath | Where-Object { $_ -and ([string]$_).Trim() -match 'node\.exe$' } | Select-Object -Last 1)[0]
if (-not $nodeExecutable -or -not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
  throw 'Не удалось определить проверенную локальную среду Node.js.'
}

$arguments = @(
  (Join-Path $projectRoot 'scripts\poll-devices.js'),
  '--plan', [IO.Path]::GetFullPath($Plan),
  '--timeout', [string]$Timeout
)
$arguments += @('--credentials', [IO.Path]::GetFullPath($Credentials))
$arguments += @('--output-root', [IO.Path]::GetFullPath($Output))
if ($AllowInsecureTls) { $arguments += '--allow-insecure-tls' }

& $nodeExecutable @arguments
if ($LASTEXITCODE -ne 0) { throw "Опрос завершился с кодом $LASTEXITCODE." }
