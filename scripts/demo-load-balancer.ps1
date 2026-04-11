Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

param(
    [int]$Count = 8,
    [string]$BaseUrl = 'http://localhost:5000',
    [string]$Path = '/identity-lb/api/auth/forgot-password'
)

$uri = "$BaseUrl$Path"

for ($i = 1; $i -le $Count; $i++) {
    $headers = @{
        'Oc-Client' = 'lb-demo-client'
        'X-Correlation-Id' = [Guid]::NewGuid().ToString('N')
    }

    $body = @{
        email = "lb-demo-$i@example.local"
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 15
        Write-Host ("[{0}] status={1}" -f $i, [int]$response.StatusCode)
    }
    catch {
        if ($_.Exception.Response) {
            Write-Host ("[{0}] status={1}" -f $i, [int]$_.Exception.Response.StatusCode)
        }
        else {
            Write-Host ("[{0}] error={1}" -f $i, $_.Exception.Message)
        }
    }
}

Write-Host "Done. Sent $Count requests to $Path via gateway."
Write-Host 'Check both IdentityAuth terminals; requests should be distributed by round-robin between ports 8001 and 8101.'