param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [int]$ExpectedStatus
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec $TimeoutSec
    if ($response.StatusCode -eq $ExpectedStatus) {
      Write-Host "[PASS] $Name -> $($response.StatusCode)"
      return $true
    }

    Write-Host "[FAIL] $Name -> $($response.StatusCode), expected $ExpectedStatus"
    return $false
  }
  catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq $ExpectedStatus) {
      Write-Host "[PASS] $Name -> $ExpectedStatus"
      return $true
    }

    Write-Host "[FAIL] $Name -> $($_.Exception.Message)"
    return $false
  }
}

function Test-UnsignedWebhook {
  param([string]$Url)

  $body = '{"data":{"event_type":"call.initiated","id":"probe-unsigned"}}'

  try {
    Invoke-WebRequest -Uri $Url -Method Post -Body $body -ContentType 'application/json' -TimeoutSec $TimeoutSec | Out-Null
    Write-Host "[FAIL] unsigned webhook probe -> expected 401, got success"
    return $false
  }
  catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
      Write-Host "[PASS] unsigned webhook probe -> 401 (signature gate active)"
      return $true
    }

    Write-Host "[FAIL] unsigned webhook probe -> $($_.Exception.Message)"
    return $false
  }
}

$base = $BaseUrl.TrimEnd('/')
$healthUrl = "$base/health"
$readyUrl = "$base/ready"
$webhookUrl = "$base/api/webhooks"

Write-Host "Running Telnyx readiness checks against: $base"

$ok = $true
$ok = (Test-Endpoint -Name 'health' -Url $healthUrl -ExpectedStatus 200) -and $ok
$ok = (Test-Endpoint -Name 'ready' -Url $readyUrl -ExpectedStatus 200) -and $ok
$ok = (Test-UnsignedWebhook -Url $webhookUrl) -and $ok

if ($ok) {
  Write-Host ""
  Write-Host "READY: baseline endpoint checks passed."
  Write-Host "Next: configure Telnyx app webhook URL + signing key, then perform first live call."
  exit 0
}

Write-Host ""
Write-Host "NOT READY: one or more checks failed. Fix failures before live Telnyx call."
exit 1
