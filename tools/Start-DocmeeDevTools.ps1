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

if (-not (Test-Dashboard)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $nextArgs = "`"$nextBin`" dev -p 4000 -H 127.0.0.1"
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
