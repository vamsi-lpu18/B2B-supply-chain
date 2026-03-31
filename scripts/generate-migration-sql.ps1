$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path "scripts/migrations" -Force | Out-Null

$services = @(
    @{ Name = "IdentityAuth"; Context = "IdentityAuthDbContext"; Project = "services/IdentityAuth/IdentityAuth.Infrastructure/IdentityAuth.Infrastructure.csproj"; Startup = "services/IdentityAuth/IdentityAuth.API/IdentityAuth.API.csproj" },
    @{ Name = "CatalogInventory"; Context = "CatalogInventoryDbContext"; Project = "services/CatalogInventory/CatalogInventory.Infrastructure/CatalogInventory.Infrastructure.csproj"; Startup = "services/CatalogInventory/CatalogInventory.API/CatalogInventory.API.csproj" },
    @{ Name = "Order"; Context = "OrderDbContext"; Project = "services/Order/Order.Infrastructure/Order.Infrastructure.csproj"; Startup = "services/Order/Order.API/Order.API.csproj" },
    @{ Name = "LogisticsTracking"; Context = "LogisticsTrackingDbContext"; Project = "services/LogisticsTracking/LogisticsTracking.Infrastructure/LogisticsTracking.Infrastructure.csproj"; Startup = "services/LogisticsTracking/LogisticsTracking.API/LogisticsTracking.API.csproj" },
    @{ Name = "PaymentInvoice"; Context = "PaymentInvoiceDbContext"; Project = "services/PaymentInvoice/PaymentInvoice.Infrastructure/PaymentInvoice.Infrastructure.csproj"; Startup = "services/PaymentInvoice/PaymentInvoice.API/PaymentInvoice.API.csproj" },
    @{ Name = "Notification"; Context = "NotificationDbContext"; Project = "services/Notification/Notification.Infrastructure/Notification.Infrastructure.csproj"; Startup = "services/Notification/Notification.API/Notification.API.csproj" }
)

foreach ($service in $services) {
    $output = "scripts/migrations/$($service.Name).sql"

    Write-Host "Generating SQL for $($service.Name) -> $output" -ForegroundColor Cyan

    dotnet ef migrations script `
        --idempotent `
        --context $service.Context `
        --project $service.Project `
        --startup-project $service.Startup `
        --output $output

    Write-Host "SQL generated for $($service.Name)." -ForegroundColor Green
}

Write-Host "All migration SQL scripts generated successfully." -ForegroundColor Green
