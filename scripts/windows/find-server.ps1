# Finds the AwaazSaathi server on the local network and prints its address (for Open-Demo.bat).
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Net.Http
$cache = Join-Path $env:TEMP 'awaazsaathi-server.txt'

function Test-Server($ip) {
  try { $r = Invoke-RestMethod -Uri ("http://{0}:8000/api/health" -f $ip) -TimeoutSec 2; return ($r.app -eq 'awaazsaathi') } catch { return $false }
}

# 1) this laptop itself, then the last address that worked
if (Test-Server 'localhost') { 'localhost'; exit 0 }
if (Test-Path $cache) { $last = (Get-Content $cache | Select-Object -First 1).Trim(); if ($last -and (Test-Server $last)) { $last; exit 0 } }

# 2) scan every local /24 network this laptop is on, all addresses at once
$mine = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)' } | Select-Object -ExpandProperty IPAddress
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromMilliseconds(2500)
$tasks = @{}
foreach ($ip in $mine) {
  $prefix = $ip -replace '\.\d+$', ''
  foreach ($n in 1..254) {
    $t = "$prefix.$n"
    if ($t -ne $ip -and -not $tasks.ContainsKey($t)) { $tasks[$t] = $client.GetStringAsync(("http://{0}:8000/api/health" -f $t)) }
  }
}
try { [void][System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]@($tasks.Values), 4000) } catch {}
foreach ($k in $tasks.Keys) {
  $t = $tasks[$k]
  if ($t.Status -eq 'RanToCompletion' -and $t.Result -match 'awaazsaathi') { Set-Content -Path $cache -Value $k; $k; exit 0 }
}
exit 1
