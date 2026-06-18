$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appExe = Join-Path $toolsDir "app\src-tauri\target\debug\docmee-devtools.exe"
$tauriDir = Join-Path $toolsDir "app\src-tauri"
$nextBin = Join-Path $toolsDir "dashboard\node_modules\next\dist\bin\next"

function Test-Dashboard {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:4000" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-DashboardHost {
  if ($env:DOCMEE_DEVTOOLS_HOST) {
    return $env:DOCMEE_DEVTOOLS_HOST
  }
  $tailscale = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -match 'Tailscale' -or $_.IPAddress -like '100.*' } |
    Select-Object -First 1
  if ($tailscale) {
    return "0.0.0.0"
  }
  return "127.0.0.1"
}

if (-not (Test-Dashboard)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $dashboardHost = Get-DashboardHost
  $nextArgs = "`"$nextBin`" dev -p 4000 -H $dashboardHost"
  Start-Process `
    -FilePath $node `
    -ArgumentList $nextArgs `
    -WorkingDirectory (Join-Path $toolsDir "dashboard") `
    -WindowStyle Hidden

  for ($i = 0; $i -lt 30; $i++) {
    if (Test-Dashboard) { break }
    Start-Sleep -Seconds 1
  }
}

if (-not (Test-Path $appExe)) {
  $cargo = (Get-Command cargo -ErrorAction Stop).Source
  Start-Process `
    -FilePath $cargo `
    -ArgumentList @("build") `
    -WorkingDirectory $tauriDir `
    -WindowStyle Hidden `
    -Wait
}

Start-Process `
  -FilePath $appExe `
  -WorkingDirectory $toolsDir `
  -WindowStyle Normal
