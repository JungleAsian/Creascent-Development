$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pnpm = (Get-Command pnpm -ErrorAction Stop).Source

Start-Process `
  -FilePath $pnpm `
  -ArgumentList @("--dir", "app", "tauri") `
  -WorkingDirectory $toolsDir `
  -WindowStyle Hidden
