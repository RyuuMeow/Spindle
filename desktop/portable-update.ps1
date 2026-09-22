param([Parameter(Mandatory=$true)][string]$JobFile)
$ErrorActionPreference = 'Stop'
$job = Get-Content -LiteralPath $JobFile -Raw | ConvertFrom-Json
$target = [IO.Path]::GetFullPath($job.target)
$source = [IO.Path]::GetFullPath($job.source)
$backup = $target + '.previous-' + $job.token
try {
 if ([IO.Path]::GetExtension($target) -ne '.exe' -or [IO.Path]::GetExtension($source) -ne '.exe') { throw 'Invalid update files' }
 $sourceVersion = (([Diagnostics.FileVersionInfo]::GetVersionInfo($source).FileVersion -split '\.')[0..2]) -join '.'
 if ($job.version -and $sourceVersion -ne $job.version) { throw 'Executable version mismatch' }
 $stream = [IO.File]::OpenRead($source)
 $algorithm = [Security.Cryptography.SHA256]::Create()
 try { $digest = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $algorithm.Dispose() }
 if ($digest -ne $job.sha256) { throw 'Checksum mismatch' }
 $deadline = [DateTime]::UtcNow.AddSeconds(120)
 while (Get-Process -Id $job.pid -ErrorAction SilentlyContinue) {
  if ([DateTime]::UtcNow -gt $deadline) { throw 'App did not exit' }
  Start-Sleep -Milliseconds 300
 }
 while ($true) {
  try { $handle=[IO.File]::Open($target,'Open','ReadWrite','None');$handle.Dispose();break } catch {
   if ([DateTime]::UtcNow -gt $deadline) { throw 'Portable launcher is still in use' }
   Start-Sleep -Milliseconds 500
  }
 }
 if (Test-Path -LiteralPath $backup) { throw 'Previous backup exists; preserve it before retrying' }
 Move-Item -LiteralPath $target -Destination $backup
 try {
  Copy-Item -LiteralPath $source -Destination $target
  $launched=Start-Process -FilePath $target -ArgumentList @('--user-data-dir="'+$job.profile+'"', '--spindle-update-token='+$job.token) -WindowStyle Hidden -PassThru -ErrorAction Stop
  $health=Join-Path $job.profile ('updates/'+$job.token+'.ready')
  $healthDeadline=[DateTime]::UtcNow.AddSeconds(90)
  while (!(Test-Path -LiteralPath $health)) {
   if ($launched.HasExited) { throw 'New version exited before readiness' }
   if ([DateTime]::UtcNow -gt $healthDeadline) { throw 'New version has not confirmed startup; backup retained' }
   Start-Sleep -Milliseconds 500
  }
 } catch {
  if ($launched -and !$launched.HasExited) { throw }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
  Move-Item -LiteralPath $backup -Destination $target
  throw
 }
 Remove-Item -LiteralPath $JobFile
} catch {
 $_.Exception.Message | Set-Content -LiteralPath ($JobFile+'.error') -Encoding UTF8
 exit 1
}
