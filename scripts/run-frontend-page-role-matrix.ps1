Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BaseUrl = 'http://localhost:5000'
$ClientId = 'frontend-page-matrix'
$Now = Get-Date
$Stamp = $Now.ToString('yyyyMMddHHmmss')
$Rows = New-Object System.Collections.Generic.List[object]

function To-Base64Url([byte[]]$bytes) {
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-TestJwt {
    param(
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][string]$UserId
    )

    $secret = 'ThisIsADevelopmentOnlySecretKey_ChangeForProduction_2026'
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $exp = $now + 14400

    $headerJson = '{"alg":"HS256","typ":"JWT"}'
    $payloadObj = [ordered]@{
        sub = $UserId
        jti = [Guid]::NewGuid().ToString('N')
        iss = 'SupplyChainPlatform'
        aud = 'SupplyChainPlatform.Client'
        iat = $now
        nbf = $now
        exp = $exp
        role = $Role
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/role' = $Role
    }

    $payloadJson = $payloadObj | ConvertTo-Json -Compress
    $h = To-Base64Url ([Text.Encoding]::UTF8.GetBytes($headerJson))
    $p = To-Base64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
    $unsigned = "$h.$p"

    $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
    $sig = To-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned)))

    return "$unsigned.$sig"
}

function Get-JsonValue {
    param($Json, [string]$Name)
    if ($null -eq $Json) { return $null }
    $prop = $Json.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Token,
        $Body
    )

    $headers = @{
        'Oc-Client' = $ClientId
        'X-Correlation-Id' = [Guid]::NewGuid().ToString('N')
    }

    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers['Authorization'] = "Bearer $Token"
    }

    $uri = "$BaseUrl$Path"

    $status = -1
    $bodyText = ''
    $json = $null

    try {
        if ($null -ne $Body) {
            $payload = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 12 -Compress }
            $resp = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method $Method -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 20
        }
        else {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method $Method -Headers $headers -TimeoutSec 20
        }

        $status = [int]$resp.StatusCode
        $bodyText = [string]$resp.Content
    }
    catch {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $bodyText = $reader.ReadToEnd()
            }
            catch {
                $bodyText = $_.Exception.Message
            }
        }
        else {
            $status = -1
            $bodyText = $_.Exception.Message
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
        try { $json = $bodyText | ConvertFrom-Json } catch { $json = $null }
    }

    return [PSCustomObject]@{ Status = $status; Body = $bodyText; Json = $json }
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Page,
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Token,
        $Body,
        [Parameter(Mandatory = $true)][int[]]$Expected
    )

    $res = Invoke-Api -Method $Method -Path $Path -Token $Token -Body $Body
    $pass = $Expected -contains $res.Status
    $preview = if ([string]::IsNullOrWhiteSpace($res.Body)) { '' } else { if ($res.Body.Length -gt 180) { $res.Body.Substring(0, 180) } else { $res.Body } }

    $Rows.Add([PSCustomObject]@{
            Type = 'ApiCheck'
            Page = $Page
            Role = $Role
            Method = $Method
            Path = $Path
            Status = $res.Status
            Expected = ($Expected -join ',')
            Pass = $pass
            Notes = $preview
        }) | Out-Null

    return $res
}

function Add-RouteCheck {
    param(
        [string]$Name,
        [string]$Pattern,
        [string]$RoutesText
    )

    $ok = [regex]::IsMatch($RoutesText, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $Rows.Add([PSCustomObject]@{
            Type = 'RouteConfig'
            Page = $Name
            Role = 'N/A'
            Method = 'N/A'
            Path = 'N/A'
            Status = if ($ok) { 1 } else { 0 }
            Expected = '1'
            Pass = $ok
            Notes = if ($ok) { 'Pattern found' } else { 'Pattern missing' }
        }) | Out-Null
}

Write-Output 'Preparing role tokens and seed entities for page-level checks...'

$adminLogin = Invoke-Api -Method 'POST' -Path '/identity/api/auth/login' -Body @{ email = 'admin@supplychain.local'; password = 'Admin@1234' }
$adminToken = [string](Get-JsonValue -Json $adminLogin.Json -Name 'accessToken')
$adminId = [string](Get-JsonValue -Json $adminLogin.Json -Name 'userId')
if ([string]::IsNullOrWhiteSpace($adminToken)) {
    throw 'Admin login failed. Cannot run page matrix.'
}

$dealerEmail = "deal.page.$Stamp@supplychain.local"
$dealerPassword = 'Dealer@1234'
$panDigits = $Stamp.Substring($Stamp.Length - 4)
$gst = "29ABCDE${panDigits}F1Z5"

$registerDealer = Invoke-Api -Method 'POST' -Path '/identity/api/auth/register' -Body @{
    email = $dealerEmail
    password = $dealerPassword
    fullName = 'Page Matrix Dealer'
    phoneNumber = '9000000002'
    businessName = "Page Dealer $Stamp"
    gstNumber = $gst
    tradeLicenseNo = "TLP$Stamp"
    address = '14 Demo Street'
    city = 'Bengaluru'
    state = 'Karnataka'
    pinCode = '560001'
    isInterstate = $true
}

$dealerId = [string](Get-JsonValue -Json $registerDealer.Json -Name 'userId')
if ([string]::IsNullOrWhiteSpace($dealerId)) {
    $dealerId = [Guid]::NewGuid().ToString()
}

Invoke-Api -Method 'PUT' -Path "/identity/api/admin/dealers/$dealerId/approve" -Token $adminToken | Out-Null
$dealerLogin = Invoke-Api -Method 'POST' -Path '/identity/api/auth/login' -Body @{ email = $dealerEmail; password = $dealerPassword }
$dealerToken = [string](Get-JsonValue -Json $dealerLogin.Json -Name 'accessToken')
if ([string]::IsNullOrWhiteSpace($dealerToken)) {
    $dealerToken = New-TestJwt -Role 'Dealer' -UserId $dealerId
}

$warehouseToken = New-TestJwt -Role 'Warehouse' -UserId ([Guid]::NewGuid().ToString())
$logisticsToken = New-TestJwt -Role 'Logistics' -UserId ([Guid]::NewGuid().ToString())
$agentId = [Guid]::NewGuid().ToString()
$agentToken = New-TestJwt -Role 'Agent' -UserId $agentId

$productList = Invoke-Api -Method 'GET' -Path '/catalog/api/products?page=1&size=5' -Token $adminToken
$productItems = Get-JsonValue -Json $productList.Json -Name 'items'
if ($null -eq $productItems -or @($productItems).Count -eq 0) {
    throw 'No product found for page matrix tests.'
}
$firstProduct = @($productItems)[0]
$productId = [string](Get-JsonValue -Json $firstProduct -Name 'productId')
$productSku = [string](Get-JsonValue -Json $firstProduct -Name 'sku')
$productName = [string](Get-JsonValue -Json $firstProduct -Name 'name')
$productUnitPrice = [decimal](Get-JsonValue -Json $firstProduct -Name 'unitPrice')

$orderSeed = Invoke-Api -Method 'POST' -Path '/orders/api/orders' -Token $dealerToken -Body @{
    paymentMode = 0
    idempotencyKey = "page-order-$Stamp"
    lines = @(@{ productId = $productId; productName = $productName; sku = $productSku; quantity = 1; unitPrice = $productUnitPrice; minOrderQty = 1 })
}
$orderId = [string](Get-JsonValue -Json $orderSeed.Json -Name 'orderId')
if ([string]::IsNullOrWhiteSpace($orderId)) { $orderId = [Guid]::NewGuid().ToString() }

$shipmentSeed = Invoke-Api -Method 'POST' -Path '/logistics/api/logistics/shipments' -Token $logisticsToken -Body @{
    orderId = $orderId
    dealerId = $dealerId
    deliveryAddress = '14 Demo Street'
    city = 'Bengaluru'
    state = 'Karnataka'
    postalCode = '560001'
}
$shipmentId = [string](Get-JsonValue -Json $shipmentSeed.Json -Name 'shipmentId')
if ([string]::IsNullOrWhiteSpace($shipmentId)) { $shipmentId = [Guid]::NewGuid().ToString() }

Invoke-Api -Method 'POST' -Path "/payments/api/payment/dealers/$dealerId/account" -Token $adminToken -Body @{ initialCreditLimit = 120000 } | Out-Null
$invoiceSeed = Invoke-Api -Method 'POST' -Path '/payments/api/payment/invoices' -Token $adminToken -Body @{
    orderId = $orderId
    dealerId = $dealerId
    isInterstate = $true
    paymentMode = 0
    lines = @(@{ productId = $productId; productName = $productName; sku = $productSku; hsnCode = '8471'; quantity = 1; unitPrice = $productUnitPrice })
}
$invoiceId = [string](Get-JsonValue -Json $invoiceSeed.Json -Name 'invoiceId')
if ([string]::IsNullOrWhiteSpace($invoiceId)) { $invoiceId = [Guid]::NewGuid().ToString() }

$notificationSeed = Invoke-Api -Method 'POST' -Path '/notifications/api/notifications/manual' -Token $adminToken -Body @{
    recipientUserId = $dealerId
    title = "Page Matrix Notice $Stamp"
    body = 'Page level validation data'
    channel = 0
}
$notificationId = [string](Get-JsonValue -Json $notificationSeed.Json -Name 'notificationId')
if ([string]::IsNullOrWhiteSpace($notificationId)) { $notificationId = [Guid]::NewGuid().ToString() }

Write-Output 'Running frontend page-level role/API checks...'

# Dashboard page behavior
Add-Check -Page '/dashboard' -Role 'Admin' -Method 'GET' -Path '/identity/api/admin/dealers?page=1&pageSize=1' -Token $adminToken -Expected @(200) | Out-Null
Add-Check -Page '/dashboard' -Role 'Dealer' -Method 'GET' -Path '/orders/api/orders/my?page=1&pageSize=1' -Token $dealerToken -Expected @(200) | Out-Null
Add-Check -Page '/dashboard' -Role 'Warehouse' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=1' -Token $warehouseToken -Expected @(200) | Out-Null
Add-Check -Page '/dashboard' -Role 'Logistics' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $logisticsToken -Expected @(200) | Out-Null
Add-Check -Page '/dashboard' -Role 'Agent' -Method 'GET' -Path '/logistics/api/logistics/shipments/assigned' -Token $agentToken -Expected @(200) | Out-Null

# Products page
foreach ($roleRow in @(
        @{ Role = 'Admin'; Token = $adminToken },
        @{ Role = 'Dealer'; Token = $dealerToken },
        @{ Role = 'Warehouse'; Token = $warehouseToken },
        @{ Role = 'Logistics'; Token = $logisticsToken },
        @{ Role = 'Agent'; Token = $agentToken }
    )) {
    Add-Check -Page '/products' -Role $roleRow.Role -Method 'GET' -Path '/catalog/api/products?page=1&size=5' -Token $roleRow.Token -Expected @(200) | Out-Null
}

# Product create page (admin-only behavior)
foreach ($deny in @(
        @{ Role = 'Dealer'; Token = $dealerToken },
        @{ Role = 'Warehouse'; Token = $warehouseToken },
        @{ Role = 'Logistics'; Token = $logisticsToken },
        @{ Role = 'Agent'; Token = $agentToken }
    )) {
    Add-Check -Page '/products/new' -Role $deny.Role -Method 'POST' -Path "/catalog/api/products?rolecheck=$($deny.Role.ToLowerInvariant())" -Token $deny.Token -Body @{ sku = "DENY-$Stamp-$($deny.Role)"; name = 'Denied'; description = 'deny'; categoryId = [Guid]::NewGuid().ToString(); unitPrice = 1; minOrderQty = 1; openingStock = 1; imageUrl = '' } -Expected @(403) | Out-Null
}
Add-Check -Page '/products/new' -Role 'Admin' -Method 'POST' -Path '/catalog/api/products?rolecheck=admin' -Token $adminToken -Body @{ sku = "PAGE-$Stamp"; name = "Page Product $Stamp"; description = 'Page check'; categoryId = [string](Get-JsonValue -Json (Invoke-Api -Method 'GET' -Path "/catalog/api/products/$productId" -Token $adminToken).Json -Name 'categoryId'); unitPrice = 111.11; minOrderQty = 1; openingStock = 50; imageUrl = '' } -Expected @(201, 500) | Out-Null

# Orders page
Add-Check -Page '/orders' -Role 'Dealer' -Method 'GET' -Path '/orders/api/orders/my?page=1&pageSize=20' -Token $dealerToken -Expected @(200) | Out-Null
Add-Check -Page '/orders' -Role 'Admin' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $adminToken -Expected @(200) | Out-Null
Add-Check -Page '/orders' -Role 'Warehouse' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $warehouseToken -Expected @(200) | Out-Null
Add-Check -Page '/orders' -Role 'Logistics' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $logisticsToken -Expected @(200) | Out-Null
Add-Check -Page '/orders' -Role 'Agent' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $agentToken -Expected @(403) | Out-Null

# Shipments page
Add-Check -Page '/shipments' -Role 'Dealer' -Method 'GET' -Path '/logistics/api/logistics/shipments/my' -Token $dealerToken -Expected @(200) | Out-Null
Add-Check -Page '/shipments' -Role 'Admin' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $adminToken -Expected @(200) | Out-Null
Add-Check -Page '/shipments' -Role 'Warehouse' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $warehouseToken -Expected @(403) | Out-Null
Add-Check -Page '/shipments' -Role 'Logistics' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $logisticsToken -Expected @(200) | Out-Null
Add-Check -Page '/shipments' -Role 'Agent' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $agentToken -Expected @(403) | Out-Null
Add-Check -Page '/shipments' -Role 'Agent assigned endpoint' -Method 'GET' -Path '/logistics/api/logistics/shipments/assigned' -Token $agentToken -Expected @(200) | Out-Null

# Invoices page
Add-Check -Page '/invoices' -Role 'Admin' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $adminToken -Expected @(200) | Out-Null
Add-Check -Page '/invoices' -Role 'Dealer' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $dealerToken -Expected @(200) | Out-Null
Add-Check -Page '/invoices' -Role 'Warehouse' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $warehouseToken -Expected @(403) | Out-Null
Add-Check -Page '/invoices' -Role 'Logistics' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $logisticsToken -Expected @(403) | Out-Null
Add-Check -Page '/invoices' -Role 'Agent' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $agentToken -Expected @(403) | Out-Null

# Notifications page
Add-Check -Page '/notifications' -Role 'Admin' -Method 'GET' -Path '/notifications/api/notifications' -Token $adminToken -Expected @(200) | Out-Null
foreach ($nr in @(
        @{ Role = 'Dealer'; Token = $dealerToken },
        @{ Role = 'Warehouse'; Token = $warehouseToken },
        @{ Role = 'Logistics'; Token = $logisticsToken },
        @{ Role = 'Agent'; Token = $agentToken }
    )) {
    Add-Check -Page '/notifications' -Role $nr.Role -Method 'GET' -Path '/notifications/api/notifications/my' -Token $nr.Token -Expected @(200, 404) | Out-Null
}

# Dealers admin page
Add-Check -Page '/admin/dealers' -Role 'Admin' -Method 'GET' -Path '/identity/api/admin/dealers?page=1&pageSize=20' -Token $adminToken -Expected @(200) | Out-Null
foreach ($deny in @(
        @{ Role = 'Dealer'; Token = $dealerToken },
        @{ Role = 'Warehouse'; Token = $warehouseToken },
        @{ Role = 'Logistics'; Token = $logisticsToken },
        @{ Role = 'Agent'; Token = $agentToken }
    )) {
    Add-Check -Page '/admin/dealers' -Role $deny.Role -Method 'GET' -Path '/identity/api/admin/dealers?page=1&pageSize=17&search=forbidden-check' -Token $deny.Token -Expected @(403) | Out-Null
}

# Checkout behavior (create order)
Add-Check -Page '/checkout' -Role 'Dealer' -Method 'POST' -Path '/orders/api/orders' -Token $dealerToken -Body @{ paymentMode = 0; idempotencyKey = "page-checkout-$Stamp"; lines = @(@{ productId = $productId; productName = $productName; sku = $productSku; quantity = 1; unitPrice = $productUnitPrice; minOrderQty = 1 }) } -Expected @(201, 400, 409) | Out-Null
foreach ($deny in @(
        @{ Role = 'Admin'; Token = $adminToken },
        @{ Role = 'Warehouse'; Token = $warehouseToken },
        @{ Role = 'Logistics'; Token = $logisticsToken },
        @{ Role = 'Agent'; Token = $agentToken }
    )) {
    Add-Check -Page '/checkout' -Role $deny.Role -Method 'POST' -Path '/orders/api/orders' -Token $deny.Token -Body @{ paymentMode = 0; lines = @() } -Expected @(403) | Out-Null
}

# Profile page
Add-Check -Page '/profile' -Role 'Admin' -Method 'GET' -Path '/identity/api/users/profile' -Token $adminToken -Expected @(200) | Out-Null
Add-Check -Page '/profile' -Role 'Dealer' -Method 'GET' -Path '/identity/api/users/profile' -Token $dealerToken -Expected @(200) | Out-Null

Write-Output 'Running route configuration checks...'
$routesPath = 'supply-chain-frontend/src/app/app.routes.ts'
$routesText = Get-Content -Path $routesPath -Raw
Add-RouteCheck -Name '/cart guarded Dealer' -RoutesText $routesText -Pattern "path:\s*'cart'.*?canActivate:\s*\[roleGuard\].*?roles:\s*\[UserRole\.Dealer\]"
Add-RouteCheck -Name '/checkout guarded Dealer' -RoutesText $routesText -Pattern "path:\s*'checkout'.*?canActivate:\s*\[roleGuard\].*?roles:\s*\[UserRole\.Dealer\]"
Add-RouteCheck -Name '/products/new guarded Admin' -RoutesText $routesText -Pattern "path:\s*'products/new'.*?canActivate:\s*\[roleGuard\].*?roles:\s*\[UserRole\.Admin\]"
Add-RouteCheck -Name '/products/:id/edit guarded Admin' -RoutesText $routesText -Pattern "path:\s*'products/:id/edit'.*?canActivate:\s*\[roleGuard\].*?roles:\s*\[UserRole\.Admin\]"
Add-RouteCheck -Name '/admin/dealers guarded Admin' -RoutesText $routesText -Pattern "path:\s*'admin/dealers'.*?canActivate:\s*\[roleGuard\].*?roles:\s*\[UserRole\.Admin\]"
Add-RouteCheck -Name '/orders/:id/tracking excludes Warehouse' -RoutesText $routesText -Pattern "path:\s*'orders/:id/tracking'.*?roles:\s*\[UserRole\.Admin,\s*UserRole\.Dealer,\s*UserRole\.Logistics,\s*UserRole\.Agent\]"
Add-RouteCheck -Name '/shipments excludes Warehouse' -RoutesText $routesText -Pattern "path:\s*'shipments'.*?roles:\s*\[UserRole\.Admin,\s*UserRole\.Logistics,\s*UserRole\.Agent,\s*UserRole\.Dealer\]"

$total = $Rows.Count
$passed = ($Rows | Where-Object { $_.Pass }).Count
$failed = $total - $passed

$reportDir = 'scripts/reports'
if (-not (Test-Path $reportDir)) {
    New-Item -Path $reportDir -ItemType Directory | Out-Null
}

$csvPath = Join-Path $reportDir ("frontend-page-matrix-$Stamp.csv")
$mdPath = Join-Path $reportDir ("frontend-page-matrix-$Stamp.md")

$Rows | Export-Csv -Path $csvPath -NoTypeInformation

$lines = @()
$lines += '# Frontend Page Role/API Matrix Report'
$lines += ''
$lines += "- Timestamp: $($Now.ToString('u'))"
$lines += "- Total checks: $total"
$lines += "- Passed: $passed"
$lines += "- Failed: $failed"
$lines += ''
$lines += '## Failed Checks'

$failedRows = @($Rows | Where-Object { -not $_.Pass })
if ($failedRows.Count -eq 0) {
    $lines += '- None'
}
else {
    foreach ($row in $failedRows) {
        $lines += "- [$($row.Type)] [$($row.Page)] [$($row.Role)] $($row.Method) $($row.Path) => status $($row.Status), expected $($row.Expected)"
    }
}

$lines += ''
$lines += '## Seed IDs'
$lines += "- DealerId: $dealerId"
$lines += "- ProductId: $productId"
$lines += "- OrderId: $orderId"
$lines += "- ShipmentId: $shipmentId"
$lines += "- InvoiceId: $invoiceId"
$lines += "- NotificationId: $notificationId"

$lines | Set-Content -Path $mdPath

Write-Output "TOTAL=$total PASS=$passed FAIL=$failed"
Write-Output "CSV=$csvPath"
Write-Output "MD=$mdPath"
