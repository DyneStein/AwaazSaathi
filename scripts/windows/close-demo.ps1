# Used by AwaazSaathi-Close.bat. Closes only what AwaazSaathi started, nothing else.
$ErrorActionPreference = 'SilentlyContinue'

function Stop-Matching($name, $pattern) {
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='$name'" | Where-Object { $_.CommandLine -like $pattern })
  foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force }
  return $procs.Count
}

# 1) The Chrome windows from AwaazSaathi-Open.bat (they use their own profile folder, so other Chrome windows stay open).
$n = Stop-Matching 'chrome.exe' '*awaazsaathi-chrome*'
if ($n -gt 0) { Write-Output '  Demo screens closed' } else { Write-Output '  No demo screens were open' }

# 2) A server started on this PC by Run-Server-On-This-PC.bat (python + uvicorn), and its internet link.
$s = (Stop-Matching 'python.exe' '*app.main:app*') + (Stop-Matching 'uv.exe' '*app.main:app*')
$t = Stop-Matching 'cloudflared.exe' '*localhost:8000*'
if ($s -gt 0) { Write-Output '  Server on this PC stopped' }
if ($t -gt 0) { Write-Output '  Internet link stopped' }
if ($s -eq 0) { Write-Output '  (A server running on the Mac keeps running. Stop it on the Mac.)' }
