[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot,

  [Parameter(Mandatory = $false)]
  [switch]$ForcePortable,

  [Parameter(Mandatory = $false)]
  [switch]$NoDownload
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$manifestPath = Join-Path $ProjectRoot 'portable-runtime.json'
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $ProjectRoot '.runtime'))
$runtimeBoundary = $runtimeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Assert-RuntimePath([string]$PathValue) {
  $resolved = [IO.Path]::GetFullPath($PathValue)
  if ($resolved -ne $runtimeRoot -and -not $resolved.StartsWith($runtimeBoundary, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Подготовка остановлена: обнаружен небезопасный путь локальной среды.'
  }
  return $resolved
}

function Get-NodeVersion([string]$Executable) {
  try {
    $value = (& $Executable --version 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or -not $value) { return $null }
    return ([string]$value).Trim().TrimStart('v')
  } catch {
    return $null
  }
}

function Test-CompatibleNode([string]$Executable, [int]$MinimumMajor, [string]$ExactVersion) {
  if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
  $version = Get-NodeVersion $Executable
  if (-not $version -or $version -notmatch '^\d+\.\d+\.\d+$') { return $false }
  if ($ExactVersion) { return $version -eq $ExactVersion }
  return [int]($version.Split('.')[0]) -ge $MinimumMajor
}

if ($env:OS -ne 'Windows_NT') {
  throw 'Поддерживается только Windows 10/11. Системные настройки не изменялись.'
}
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'Не найден манифест переносимой среды portable-runtime.json.'
}

try {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  throw 'Манифест переносимой среды повреждён и не может быть прочитан.'
}

if ($manifest.schemaVersion -ne 1 -or $manifest.runtime -ne 'node' -or [string]$manifest.version -notmatch '^\d+\.\d+\.\d+$') {
  throw 'Манифест переносимой среды имеет неподдерживаемую структуру.'
}
if ([int]$manifest.minimumMajor -lt 24) {
  throw 'Манифест допускает неподдерживаемую версию Node.js.'
}
$expectedBaseUrl = "https://nodejs.org/download/release/v$($manifest.version)/"
if ([string]$manifest.baseUrl -ne $expectedBaseUrl) {
  throw 'Манифест должен ссылаться на точный официальный выпуск nodejs.org.'
}

$rawArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$normalizedArchitecture = ([string]$rawArchitecture).ToUpperInvariant()
$architecture = switch ($normalizedArchitecture) {
  'AMD64' { 'x64' }
  'ARM64' { 'arm64' }
  default { throw "Архитектура компьютера не поддерживается: $rawArchitecture. Сетевой запрос не выполнялся." }
}
$artifact = $manifest.artifacts.$architecture
if (-not $artifact) { throw "Для архитектуры $architecture отсутствует закреплённый официальный runtime." }
$expectedFilename = "node-v$($manifest.version)-win-$architecture.zip"
if ([string]$artifact.filename -ne $expectedFilename -or [string]$artifact.archiveRoot -ne [IO.Path]::GetFileNameWithoutExtension($expectedFilename)) {
  throw 'Имя официального архива в манифесте не прошло проверку.'
}
if ([string]$artifact.sha256 -notmatch '^[0-9a-f]{64}$') {
  throw 'Контрольная сумма официального архива в манифесте некорректна.'
}

$portableDirectory = Assert-RuntimePath (Join-Path $runtimeRoot ([string]$artifact.archiveRoot))
$portableNode = Assert-RuntimePath (Join-Path $portableDirectory 'node.exe')
if (Test-CompatibleNode $portableNode ([int]$manifest.minimumMajor) ([string]$manifest.version)) {
  Write-Host "Используется проверенная переносимая среда Node.js v$($manifest.version) ($architecture)."
  Write-Output $portableNode
  return
}

if (-not $ForcePortable) {
  $systemNode = Get-Command node -ErrorAction SilentlyContinue
  $systemVersion = if ($systemNode) { Get-NodeVersion $systemNode.Source } else { $null }
  if ($systemVersion -and [int]($systemVersion.Split('.')[0]) -ge [int]$manifest.minimumMajor) {
    Write-Host "Используется установленная совместимая среда Node.js v$systemVersion."
    Write-Output ([IO.Path]::GetFullPath($systemNode.Source))
    return
  }

  $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  $bundledVersion = Get-NodeVersion $bundledNode
  if ($bundledVersion -and [int]($bundledVersion.Split('.')[0]) -ge [int]$manifest.minimumMajor) {
    Write-Host "Используется совместимая локальная среда Node.js v$bundledVersion."
    Write-Output ([IO.Path]::GetFullPath($bundledNode))
    return
  }
}

if ($NoDownload) {
  throw 'Совместимая среда Node.js не найдена. Автоматическое скачивание отключено параметром NoDownload.'
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$cacheDirectory = Assert-RuntimePath (Join-Path $runtimeRoot 'cache')
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
$archivePath = Assert-RuntimePath (Join-Path $cacheDirectory ([string]$artifact.filename))
$partialPath = Assert-RuntimePath (Join-Path $runtimeRoot ("download-{0}.partial" -f [Guid]::NewGuid().ToString('N')))
$stagingPath = Assert-RuntimePath (Join-Path $runtimeRoot ("staging-{0}" -f [Guid]::NewGuid().ToString('N')))
$lockPath = Assert-RuntimePath (Join-Path $runtimeRoot 'bootstrap.lock')
$lock = $null

try {
  try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    throw 'Подготовка уже выполняется в другом процессе. Дождитесь её завершения и повторите запуск.'
  }

  if (Test-CompatibleNode $portableNode ([int]$manifest.minimumMajor) ([string]$manifest.version)) {
    Write-Output $portableNode
    return
  }

  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    $downloadUri = [Uri]::new(([string]$manifest.baseUrl + [string]$artifact.filename))
    if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'nodejs.org' -or $downloadUri.AbsoluteUri -ne ($expectedBaseUrl + [string]$artifact.filename)) {
      throw 'Адрес загрузки не прошёл проверку официального источника.'
    }
    Write-Host "Совместимая среда не найдена. Скачивается официальный Node.js v$($manifest.version) для $architecture. Рабочие данные при этом не читаются и не передаются."
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $downloadUri.AbsoluteUri -Method Get -UseBasicParsing -OutFile $partialPath
      Move-Item -LiteralPath $partialPath -Destination $archivePath
    } catch {
      throw 'Не удалось скачать официальный runtime. Проверьте доступ к https://nodejs.org или поместите закреплённый ZIP в .runtime\cache и повторите запуск.'
    }
  } else {
    Write-Host 'Найден локальный кэш официального архива; сетевой запрос не выполняется.'
  }

  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne [string]$artifact.sha256) {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    throw 'Контрольная сумма runtime не совпала. Архив удалён и не исполнялся.'
  }

  New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
  try {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $stagingPath -Force
  } catch {
    throw 'Проверенный архив не удалось распаковать. Проверьте свободное место и права на каталог проекта.'
  }
  $stagedDirectory = Assert-RuntimePath (Join-Path $stagingPath ([string]$artifact.archiveRoot))
  $stagedNode = Assert-RuntimePath (Join-Path $stagedDirectory 'node.exe')
  if (-not (Test-CompatibleNode $stagedNode ([int]$manifest.minimumMajor) ([string]$manifest.version))) {
    throw 'Распакованная среда не соответствует закреплённой версии и не будет установлена.'
  }

  if (Test-Path -LiteralPath $portableDirectory) {
    Remove-Item -LiteralPath $portableDirectory -Recurse -Force
  }
  Move-Item -LiteralPath $stagedDirectory -Destination $portableDirectory
  $marker = [ordered]@{
    schemaVersion = 1
    runtimeVersion = [string]$manifest.version
    architecture = $architecture
    archiveSha256 = [string]$artifact.sha256
    executableRelativePath = 'node.exe'
    verifiedAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json
  Set-Content -LiteralPath (Join-Path $portableDirectory '.verified.json') -Value $marker -Encoding UTF8
  Write-Host 'Официальная переносимая среда проверена и подготовлена локально.'
  Write-Output $portableNode
} finally {
  if ($lock) { $lock.Dispose() }
  if (Test-Path -LiteralPath $partialPath) { Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $stagingPath) { Remove-Item -LiteralPath $stagingPath -Recurse -Force -ErrorAction SilentlyContinue }
}
