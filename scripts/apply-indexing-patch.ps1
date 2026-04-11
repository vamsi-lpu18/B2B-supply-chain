$ErrorActionPreference = "Stop"

$sqlFile = "scripts/migrations/IndexingPatch.sql"
if (-not (Test-Path $sqlFile)) {
    throw "Indexing patch not found at '$sqlFile'."
}

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    throw "sqlcmd was not found. Install SQL Server Command Line Utilities (sqlcmd) and retry."
}

Write-Host "Applying indexing patch from $sqlFile ..." -ForegroundColor Cyan
sqlcmd -S localhost -E -b -i $sqlFile
Write-Host "Indexing patch applied successfully." -ForegroundColor Green
