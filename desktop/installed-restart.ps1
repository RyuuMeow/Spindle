param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference='Stop'
$job=Get-Content -LiteralPath $JobFile -Raw | ConvertFrom-Json
$deadline=[DateTime]::UtcNow.AddMinutes(10)
try {
 while (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) {
  if ([DateTime]::UtcNow -gt $deadline) { throw 'App has not exited; installation was not started' }
  Start-Sleep -Milliseconds 500
 }
 $ready = $false
 while ([DateTime]::UtcNow -lt $deadline) {
  if (Test-Path -LiteralPath $job.target) {
   $version=(([Diagnostics.FileVersionInfo]::GetVersionInfo($job.target).FileVersion -split '\.')[0..2]) -join '.'
   if ($version -eq $job.version -and !(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $job.installer})) {
    try { $handle=[IO.File]::Open($job.target,'Open','Read','None');$handle.Dispose();$ready = $true;break } catch {}
   }
  }
  Start-Sleep -Milliseconds 500
 }
 if (!$ready) { throw 'Installation did not complete; workspace recovery is preserved' }
 Start-Process -FilePath $job.target -ArgumentList @('--user-data-dir="'+$job.profile+'"') -WindowStyle Hidden
 Remove-Item -LiteralPath $JobFile
} catch {
 $_.Exception.Message | Set-Content -LiteralPath ($JobFile+'.error') -Encoding UTF8
 exit 1
}
