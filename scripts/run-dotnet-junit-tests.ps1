param(
    [string]$Configuration = 'Release',
    [string]$ResultsDir = 'artifacts/test-results'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null

    dotnet test SupplyChainPlatform.slnx `
        --configuration $Configuration `
        --logger "junit;LogFilePath=$ResultsDir/{assembly}.xml;MethodFormat=Class;FailureBodyFormat=Verbose"

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host "JUnit XML reports written to: $ResultsDir"
}
finally {
    Pop-Location
}
