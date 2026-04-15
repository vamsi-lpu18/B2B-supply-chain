Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BaseUrl = 'http://localhost:5000'
$ClientId = 'supply-chain-frontend-test'
$InternalApiKey = 'SupplyChainInternalApiKey_DevOnly_2026'
$Now = Get-Date
$Stamp = $Now.ToString('yyyyMMddHHmmss')
$ReportRows = New-Object System.Collections.Generic.List[object]

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

    $headerPart = To-Base64Url ([Text.Encoding]::UTF8.GetBytes($headerJson))
    $payloadPart = To-Base64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
    $unsigned = "$headerPart.$payloadPart"

    $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
    $signature = To-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned)))

    return "$unsigned.$signature"
}

function Get-JsonValue {
    param(
        $Json,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Json) {
        return $null
    }

    $prop = $Json.PSObject.Properties[$Name]
    if ($null -eq $prop) {
        return $null
    }

    return $prop.Value
}

function Invoke-ApiCall {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Token,
        $Body,
        [hashtable]$Headers
    )

    $requestHeaders = @{
        'Oc-Client' = $ClientId
        'X-Correlation-Id' = [Guid]::NewGuid().ToString('N')
    }

    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $requestHeaders['Authorization'] = "Bearer $Token"
    }

    if ($null -ne $Headers) {
        foreach ($key in @($Headers.Keys)) {
            $requestHeaders[$key] = [string]$Headers[$key]
        }
    }

    if ($Path -match '^https?://') {
        $uri = $Path
    }
    else {
        $uri = "$BaseUrl$Path"
    }
    $statusCode = 0
    $bodyText = ''
    $json = $null

    try {
        if ($null -ne $Body) {
            $payload = $Body
            if ($Body -isnot [string]) {
                $payload = $Body | ConvertTo-Json -Depth 12 -Compress
            }

            $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $uri -Headers $requestHeaders -ContentType 'application/json' -Body $payload -TimeoutSec 20
        }
        else {
            $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $uri -Headers $requestHeaders -TimeoutSec 20
        }

        $statusCode = [int]$resp.StatusCode
        $bodyText = [string]$resp.Content
    }
    catch {
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $bodyText = $reader.ReadToEnd()
            }
            catch {
                $bodyText = $_.Exception.Message
            }
        }
        else {
            $statusCode = -1
            $bodyText = $_.Exception.Message
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
        try {
            $json = $bodyText | ConvertFrom-Json
        }
        catch {
            $json = $null
        }
    }

    return [PSCustomObject]@{
        Status = $statusCode
        Body = $bodyText
        Json = $json
    }
}

function Add-Test {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Token,
        $Body,
        [hashtable]$Headers,
        [Parameter(Mandatory = $true)][int[]]$Expected
    )

    $result = Invoke-ApiCall -Method $Method -Path $Path -Token $Token -Body $Body -Headers $Headers
    $pass = $Expected -contains $result.Status
    $preview = ''
    if (-not [string]::IsNullOrWhiteSpace($result.Body)) {
        $preview = $result.Body
        if ($preview.Length -gt 220) {
            $preview = $preview.Substring(0, 220)
        }
    }

    $ReportRows.Add([PSCustomObject]@{
            Name = $Name
            Role = $Role
            Method = $Method
            Path = $Path
            Status = $result.Status
            Expected = ($Expected -join ',')
            Pass = $pass
            Preview = $preview
        }) | Out-Null

    return $result
}

Write-Output 'Seeding mock identities and auth tokens...'
$adminLogin = Add-Test -Name 'Auth login admin' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/login' -Body @{ email = 'admin@supplychain.local'; password = 'Admin@1234' } -Expected @(200)
$adminAccessToken = [string](Get-JsonValue -Json $adminLogin.Json -Name 'accessToken')
if ($adminLogin.Status -ne 200 -or [string]::IsNullOrWhiteSpace($adminAccessToken)) {
    throw 'Admin login failed. Cannot continue endpoint matrix run.'
}

$adminToken = $adminAccessToken
$adminUserId = [string](Get-JsonValue -Json $adminLogin.Json -Name 'userId')

$dealerEmail = "dealer.$Stamp@supplychain.local"
$dealerPassword = 'Dealer@1234'
$panDigits = $Stamp.Substring($Stamp.Length - 4)
$dealerGstNumber = "29ABCDE${panDigits}F1Z5"
$registerDealer = Add-Test -Name 'Auth register dealer' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/register' -Body @{
    email = $dealerEmail
    password = $dealerPassword
    fullName = 'Mock Dealer'
    phoneNumber = '9000000001'
    businessName = "Mock Dealer $Stamp"
    gstNumber = $dealerGstNumber
    tradeLicenseNo = "TL$Stamp"
    address = '12 Demo Street'
    city = 'Bengaluru'
    state = 'Karnataka'
    pinCode = '560001'
    isInterstate = $true
} -Expected @(201, 409)

$dealerId = [string](Get-JsonValue -Json $registerDealer.Json -Name 'userId')
if ([string]::IsNullOrWhiteSpace($dealerId)) {
    $dealerId = [Guid]::NewGuid().ToString()
}

Add-Test -Name 'Admin approve dealer' -Role 'Admin' -Method 'PUT' -Path "/identity/api/admin/dealers/$dealerId/approve" -Token $adminToken -Expected @(200, 404) | Out-Null
$dealerLogin = Add-Test -Name 'Auth login dealer' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/login' -Body @{ email = $dealerEmail; password = $dealerPassword } -Expected @(200, 401)

$dealerAccessToken = [string](Get-JsonValue -Json $dealerLogin.Json -Name 'accessToken')
if ($dealerLogin.Status -eq 200 -and -not [string]::IsNullOrWhiteSpace($dealerAccessToken)) {
    $dealerToken = $dealerAccessToken
    $dealerId = [string](Get-JsonValue -Json $dealerLogin.Json -Name 'userId')
}
else {
    $dealerToken = New-TestJwt -Role 'Dealer' -UserId $dealerId
}

$warehouseId = [Guid]::NewGuid().ToString()
$logisticsId = [Guid]::NewGuid().ToString()
$agentId = [Guid]::NewGuid().ToString()

$warehouseToken = New-TestJwt -Role 'Warehouse' -UserId $warehouseId
$logisticsToken = New-TestJwt -Role 'Logistics' -UserId $logisticsId
$agentToken = New-TestJwt -Role 'Agent' -UserId $agentId

Write-Output 'Seeding mock domain data...'
$productId = ''
$productSku = "MOCK-$Stamp"
$productName = "Mock Product $Stamp"
$productUnitPrice = 199.99
$productCategoryId = [Guid]::NewGuid().ToString()

$productList = Add-Test -Name 'Catalog list admin for seed' -Role 'Admin' -Method 'GET' -Path '/catalog/api/products?page=1&size=20' -Token $adminToken -Expected @(200)
$productItems = Get-JsonValue -Json $productList.Json -Name 'items'
$firstProduct = $null

if ($productItems -is [System.Array]) {
    if ($productItems.Length -gt 0) {
        $firstProduct = $productItems[0]
    }
}
elseif ($null -ne $productItems) {
    $firstProduct = $productItems
}

if ($null -ne $firstProduct) {
    $productId = [string](Get-JsonValue -Json $firstProduct -Name 'productId')
    $seedSku = [string](Get-JsonValue -Json $firstProduct -Name 'sku')
    $seedName = [string](Get-JsonValue -Json $firstProduct -Name 'name')
    $seedUnitPrice = Get-JsonValue -Json $firstProduct -Name 'unitPrice'

    if (-not [string]::IsNullOrWhiteSpace($seedSku)) {
        $productSku = $seedSku
    }
    if (-not [string]::IsNullOrWhiteSpace($seedName)) {
        $productName = $seedName
    }
    if ($null -ne $seedUnitPrice) {
        $productUnitPrice = [decimal]$seedUnitPrice
    }
}

if ([string]::IsNullOrWhiteSpace($productId)) {
    $categoryList = Add-Test -Name 'Catalog categories admin for seed' -Role 'Admin' -Method 'GET' -Path '/catalog/api/products/categories' -Token $adminToken -Expected @(200)
    $categoryItems = $categoryList.Json
    $firstCategory = $null
    $firstLeafCategory = $null

    if ($categoryItems -is [System.Array]) {
        if ($categoryItems.Length -gt 0) {
            $firstCategory = $categoryItems[0]
        }

        foreach ($categoryItem in $categoryItems) {
            $parentCategoryId = [string](Get-JsonValue -Json $categoryItem -Name 'parentCategoryId')
            if (-not [string]::IsNullOrWhiteSpace($parentCategoryId)) {
                $firstLeafCategory = $categoryItem
                break
            }
        }
    }
    elseif ($null -ne $categoryItems) {
        $firstCategory = $categoryItems
    }

    $seedCategory = if ($null -ne $firstLeafCategory) { $firstLeafCategory } else { $firstCategory }
    $seedCategoryId = [string](Get-JsonValue -Json $seedCategory -Name 'categoryId')
    if (-not [string]::IsNullOrWhiteSpace($seedCategoryId)) {
        $productCategoryId = $seedCategoryId
    }

    $productCreate = Add-Test -Name 'Catalog create product' -Role 'Admin' -Method 'POST' -Path '/catalog/api/products' -Token $adminToken -Body @{
        sku = $productSku
        name = $productName
        description = 'Generated test product'
        categoryId = $productCategoryId
        unitPrice = $productUnitPrice
        minOrderQty = 1
        openingStock = 150
        imageUrl = ''
    } -Expected @(201, 500)

    $productId = [string](Get-JsonValue -Json $productCreate.Json -Name 'productId')
}

if ([string]::IsNullOrWhiteSpace($productId)) {
    throw 'Catalog did not provide any usable product id. Cannot continue test matrix.'
}

$productDetailSeed = Add-Test -Name 'Catalog detail admin for seed' -Role 'Admin' -Method 'GET' -Path "/catalog/api/products/$productId" -Token $adminToken -Expected @(200, 404)
$seedCategoryId = [string](Get-JsonValue -Json $productDetailSeed.Json -Name 'categoryId')
if (-not [string]::IsNullOrWhiteSpace($seedCategoryId)) {
    $productCategoryId = $seedCategoryId
}

Add-Test -Name 'Catalog restock warehouse' -Role 'Warehouse' -Method 'POST' -Path "/catalog/api/products/$productId/restock" -Token $warehouseToken -Body @{ quantity = 20; referenceId = "RST-$Stamp" } -Expected @(200, 404) | Out-Null

$orderCreate = Add-Test -Name 'Orders create dealer' -Role 'Dealer' -Method 'POST' -Path '/orders/api/orders' -Token $dealerToken -Body @{
    paymentMode = 0
    idempotencyKey = "order-$Stamp"
    lines = @(@{
            productId = $productId
            productName = $productName
            sku = $productSku
            quantity = 2
            unitPrice = $productUnitPrice
            minOrderQty = 1
        })
} -Expected @(201, 400, 409)

$orderId = [string](Get-JsonValue -Json $orderCreate.Json -Name 'orderId')
if ([string]::IsNullOrWhiteSpace($orderId)) {
    $orderId = [Guid]::NewGuid().ToString()
}

$shipmentCreate = Add-Test -Name 'Logistics create shipment' -Role 'Logistics' -Method 'POST' -Path '/logistics/api/logistics/shipments' -Token $logisticsToken -Body @{
    orderId = $orderId
    dealerId = $dealerId
    deliveryAddress = '12 Demo Street'
    city = 'Bengaluru'
    state = 'Karnataka'
    postalCode = '560001'
} -Expected @(201, 400, 404)

$shipmentId = [string](Get-JsonValue -Json $shipmentCreate.Json -Name 'shipmentId')
if ([string]::IsNullOrWhiteSpace($shipmentId)) {
    $shipmentId = [Guid]::NewGuid().ToString()
}

Add-Test -Name 'Payments seed dealer account' -Role 'Admin' -Method 'POST' -Path "/payments/api/payment/dealers/$dealerId/account" -Token $adminToken -Body @{ initialCreditLimit = 150000 } -Expected @(200, 404) | Out-Null

$invoiceCreate = Add-Test -Name 'Payments generate invoice' -Role 'Admin' -Method 'POST' -Path '/payments/api/payment/invoices' -Token $adminToken -Body @{
    orderId = $orderId
    dealerId = $dealerId
    isInterstate = $true
    paymentMode = 0
    lines = @(@{
            productId = $productId
            productName = $productName
            sku = $productSku
            hsnCode = '8471'
            quantity = 2
            unitPrice = $productUnitPrice
        })
} -Expected @(201, 400, 404)

$invoiceId = [string](Get-JsonValue -Json $invoiceCreate.Json -Name 'invoiceId')
if ([string]::IsNullOrWhiteSpace($invoiceId)) {
    $invoiceId = [Guid]::NewGuid().ToString()
}

$manualNotification = Add-Test -Name 'Notifications manual create' -Role 'Admin' -Method 'POST' -Path '/notifications/api/notifications/manual' -Token $adminToken -Body @{
    recipientUserId = $dealerId
    title = "Mock Notice $Stamp"
    body = 'Generated by endpoint matrix runner'
    channel = 0
} -Expected @(201, 400)

$notificationId = [string](Get-JsonValue -Json $manualNotification.Json -Name 'notificationId')
if ([string]::IsNullOrWhiteSpace($notificationId)) {
    $notificationId = [Guid]::NewGuid().ToString()
}

Write-Output 'Running complete endpoint matrix for all roles...'

# Identity/Auth
Add-Test -Name 'Auth forgot password' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/forgot-password' -Body @{ email = $dealerEmail } -Expected @(200) | Out-Null
Add-Test -Name 'Auth reset password invalid otp' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/reset-password' -Body @{ email = $dealerEmail; otpCode = '000000'; newPassword = 'Dealer@5678' } -Expected @(400, 401) | Out-Null
Add-Test -Name 'Auth refresh no cookie' -Role 'Anonymous' -Method 'POST' -Path '/identity/api/auth/refresh' -Expected @(401) | Out-Null
Add-Test -Name 'Users profile admin' -Role 'Admin' -Method 'GET' -Path '/identity/api/users/profile' -Token $adminToken -Expected @(200) | Out-Null
Add-Test -Name 'Users profile anonymous denied' -Role 'Anonymous' -Method 'GET' -Path '/identity/api/users/profile' -Expected @(401) | Out-Null
Add-Test -Name 'Admin dealers list admin' -Role 'Admin' -Method 'GET' -Path '/identity/api/admin/dealers?page=1&pageSize=20' -Token $adminToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin dealers list dealer denied' -Role 'Dealer' -Method 'GET' -Path '/identity/api/admin/dealers?page=1&pageSize=19&search=denied-check' -Token $dealerToken -Expected @(403) | Out-Null
Add-Test -Name 'Admin dealer detail' -Role 'Admin' -Method 'GET' -Path "/identity/api/admin/dealers/$dealerId" -Token $adminToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Admin dealer credit limit' -Role 'Admin' -Method 'PUT' -Path "/identity/api/admin/dealers/$dealerId/credit-limit" -Token $adminToken -Body @{ creditLimit = 225000 } -Expected @(200, 404, 502) | Out-Null

# Catalog/Inventory
Add-Test -Name 'Catalog create product dealer denied' -Role 'Dealer' -Method 'POST' -Path '/catalog/api/products' -Token $dealerToken -Body @{ sku = "DENY-$Stamp"; name = 'Nope'; description = 'deny'; categoryId = [Guid]::NewGuid().ToString(); unitPrice = 10; minOrderQty = 1; openingStock = 1 } -Expected @(403) | Out-Null
Add-Test -Name 'Catalog update product admin' -Role 'Admin' -Method 'PUT' -Path "/catalog/api/products/$productId" -Token $adminToken -Body @{ name = "Mock Product Updated $Stamp"; description = 'Updated'; categoryId = $productCategoryId; unitPrice = 209.99; minOrderQty = 1; imageUrl = ''; isActive = $true } -Expected @(200, 404, 500) | Out-Null
Add-Test -Name 'Catalog list anonymous denied by gateway auth' -Role 'Anonymous' -Method 'GET' -Path '/catalog/api/products?page=1&size=20' -Expected @(401) | Out-Null
Add-Test -Name 'Catalog detail anonymous denied by gateway auth' -Role 'Anonymous' -Method 'GET' -Path "/catalog/api/products/$productId" -Expected @(401) | Out-Null
Add-Test -Name 'Catalog search anonymous denied by gateway auth' -Role 'Anonymous' -Method 'GET' -Path '/catalog/api/products/search?q=Mock' -Expected @(401) | Out-Null
Add-Test -Name 'Catalog stock warehouse' -Role 'Warehouse' -Method 'GET' -Path "/catalog/api/products/$productId/stock" -Token $warehouseToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Inventory soft-lock dealer' -Role 'Dealer' -Method 'POST' -Path '/catalog/api/inventory/soft-lock' -Token $dealerToken -Body @{ productId = $productId; orderId = $orderId; quantity = 1 } -Expected @(200, 409, 404) | Out-Null
Add-Test -Name 'Inventory hard-deduct logistics denied' -Role 'Logistics' -Method 'POST' -Path '/catalog/api/inventory/hard-deduct' -Token $logisticsToken -Body @{ productId = $productId; orderId = $orderId; quantity = 1 } -Expected @(403) | Out-Null
Add-Test -Name 'Inventory hard-deduct internal key' -Role 'Internal' -Method 'POST' -Path 'http://localhost:8002/api/internal/inventory/hard-deduct' -Headers @{ 'X-Internal-Api-Key' = $InternalApiKey } -Body @{ productId = $productId; orderId = $orderId; quantity = 1 } -Expected @(200, 409, 404) | Out-Null
Add-Test -Name 'Inventory release-soft-lock admin' -Role 'Admin' -Method 'POST' -Path '/catalog/api/inventory/release-soft-lock' -Token $adminToken -Body @{ productId = $productId; orderId = $orderId } -Expected @(200, 404) | Out-Null
Add-Test -Name 'Inventory subscribe dealer' -Role 'Dealer' -Method 'POST' -Path '/catalog/api/inventory/subscriptions' -Token $dealerToken -Body @{ dealerId = $dealerId; productId = $productId } -Expected @(200, 400, 404) | Out-Null
Add-Test -Name 'Inventory unsubscribe dealer' -Role 'Dealer' -Method 'DELETE' -Path '/catalog/api/inventory/subscriptions' -Token $dealerToken -Body @{ dealerId = $dealerId; productId = $productId } -Expected @(200, 404) | Out-Null

# Orders
Add-Test -Name 'Orders create admin denied' -Role 'Admin' -Method 'POST' -Path '/orders/api/orders' -Token $adminToken -Body @{ paymentMode = 0; lines = @() } -Expected @(403) | Out-Null
Add-Test -Name 'Orders my dealer' -Role 'Dealer' -Method 'GET' -Path '/orders/api/orders/my?page=1&pageSize=20' -Token $dealerToken -Expected @(200) | Out-Null
Add-Test -Name 'Orders detail dealer' -Role 'Dealer' -Method 'GET' -Path "/orders/api/orders/$orderId" -Token $dealerToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Orders detail admin' -Role 'Admin' -Method 'GET' -Path "/orders/api/orders/$orderId" -Token $adminToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Orders update status logistics (restricted target denied)' -Role 'Logistics' -Method 'PUT' -Path "/orders/api/orders/$orderId/status" -Token $logisticsToken -Body @{ newStatus = 2 } -Expected @(400, 404, 409) | Out-Null
Add-Test -Name 'Orders update status warehouse denied' -Role 'Warehouse' -Method 'PUT' -Path "/orders/api/orders/$orderId/status" -Token $warehouseToken -Body @{ newStatus = 2 } -Expected @(403) | Out-Null
Add-Test -Name 'Orders cancel dealer' -Role 'Dealer' -Method 'POST' -Path "/orders/api/orders/$orderId/cancel" -Token $dealerToken -Body @{ reason = 'Mock cancel request' } -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Orders return request dealer' -Role 'Dealer' -Method 'POST' -Path "/orders/api/orders/$orderId/returns" -Token $dealerToken -Body @{ reason = 'Mock return request' } -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Admin orders list admin' -Role 'Admin' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $adminToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders list warehouse' -Role 'Warehouse' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $warehouseToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders list logistics' -Role 'Logistics' -Method 'GET' -Path '/orders/api/admin/orders?page=1&pageSize=20' -Token $logisticsToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders analytics admin' -Role 'Admin' -Method 'GET' -Path '/orders/api/admin/orders/analytics?days=90&top=5' -Token $adminToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders analytics warehouse' -Role 'Warehouse' -Method 'GET' -Path '/orders/api/admin/orders/analytics?days=90&top=5' -Token $warehouseToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders analytics logistics' -Role 'Logistics' -Method 'GET' -Path '/orders/api/admin/orders/analytics?days=90&top=5' -Token $logisticsToken -Expected @(200) | Out-Null
Add-Test -Name 'Admin orders analytics dealer denied' -Role 'Dealer' -Method 'GET' -Path '/orders/api/admin/orders/analytics?days=90&top=5' -Token $dealerToken -Expected @(403) | Out-Null
Add-Test -Name 'Admin orders bulk status warehouse denied' -Role 'Warehouse' -Method 'POST' -Path '/orders/api/admin/orders/bulk-status' -Token $warehouseToken -Body @{ newStatus = 3; orderIds = @($orderId); validateOnly = $true } -Expected @(403) | Out-Null
Add-Test -Name 'Admin approve hold' -Role 'Admin' -Method 'PUT' -Path "/orders/api/admin/orders/$orderId/approve-hold" -Token $adminToken -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Admin reject hold' -Role 'Admin' -Method 'PUT' -Path "/orders/api/admin/orders/$orderId/reject-hold" -Token $adminToken -Body @{ reason = 'Mock reject hold' } -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Admin approve hold logistics denied' -Role 'Logistics' -Method 'PUT' -Path "/orders/api/admin/orders/$orderId/approve-hold" -Token $logisticsToken -Expected @(403) | Out-Null

# Logistics
Add-Test -Name 'Logistics create shipment dealer denied' -Role 'Dealer' -Method 'POST' -Path '/logistics/api/logistics/shipments' -Token $dealerToken -Body @{ orderId = $orderId; dealerId = $dealerId; deliveryAddress = 'deny'; city = 'x'; state = 'x'; postalCode = '000000' } -Expected @(403) | Out-Null
Add-Test -Name 'Logistics create shipment warehouse denied' -Role 'Warehouse' -Method 'POST' -Path '/logistics/api/logistics/shipments' -Token $warehouseToken -Body @{ orderId = $orderId; dealerId = $dealerId; deliveryAddress = 'deny'; city = 'x'; state = 'x'; postalCode = '000000' } -Expected @(403) | Out-Null
Add-Test -Name 'Logistics get shipment dealer' -Role 'Dealer' -Method 'GET' -Path "/logistics/api/logistics/shipments/$shipmentId" -Token $dealerToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Logistics get shipment warehouse denied' -Role 'Warehouse' -Method 'GET' -Path "/logistics/api/logistics/shipments/$shipmentId" -Token $warehouseToken -Expected @(403) | Out-Null
Add-Test -Name 'Logistics get my dealer shipments' -Role 'Dealer' -Method 'GET' -Path '/logistics/api/logistics/shipments/my' -Token $dealerToken -Expected @(200) | Out-Null
Add-Test -Name 'Logistics get all agent denied' -Role 'Agent' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $agentToken -Expected @(403) | Out-Null
Add-Test -Name 'Logistics get all warehouse denied' -Role 'Warehouse' -Method 'GET' -Path '/logistics/api/logistics/shipments' -Token $warehouseToken -Expected @(403) | Out-Null
Add-Test -Name 'Logistics get assigned agent shipments' -Role 'Agent' -Method 'GET' -Path '/logistics/api/logistics/shipments/assigned' -Token $agentToken -Expected @(200) | Out-Null
Add-Test -Name 'Logistics assign agent logistics' -Role 'Logistics' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/assign-agent" -Token $logisticsToken -Body @{ agentId = $agentId } -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Logistics update status agent' -Role 'Agent' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/status" -Token $agentToken -Body @{ status = 3; note = 'Mock in-transit update' } -Expected @(200, 404, 400, 409) | Out-Null
Add-Test -Name 'Logistics update status dealer denied' -Role 'Dealer' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/status" -Token $dealerToken -Body @{ status = 3; note = 'deny' } -Expected @(403) | Out-Null
Add-Test -Name 'Logistics rate delivery agent dealer' -Role 'Dealer' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/agent-rating" -Token $dealerToken -Body @{ rating = 4; comment = 'Endpoint matrix rating check' } -Expected @(200, 400, 404) | Out-Null
Add-Test -Name 'Logistics rate delivery agent agent denied' -Role 'Agent' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/agent-rating" -Token $agentToken -Body @{ rating = 4; comment = 'deny' } -Expected @(403) | Out-Null
Add-Test -Name 'Logistics rate delivery agent logistics denied' -Role 'Logistics' -Method 'PUT' -Path "/logistics/api/logistics/shipments/$shipmentId/agent-rating" -Token $logisticsToken -Body @{ rating = 4; comment = 'deny' } -Expected @(403) | Out-Null

# Payments
Add-Test -Name 'Payments seed account dealer denied' -Role 'Dealer' -Method 'POST' -Path "/payments/api/payment/dealers/$dealerId/account" -Token $dealerToken -Body @{ initialCreditLimit = 1000 } -Expected @(403) | Out-Null
Add-Test -Name 'Payments credit check anonymous denied' -Role 'Anonymous' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/credit-check?amount=1000" -Expected @(401) | Out-Null
Add-Test -Name 'Payments credit check internal key' -Role 'Internal' -Method 'GET' -Path "http://localhost:8005/api/payment/internal/dealers/$dealerId/credit-check?amount=1000" -Headers @{ 'X-Internal-Api-Key' = $InternalApiKey } -Expected @(200) | Out-Null
Add-Test -Name 'Payments update credit limit admin' -Role 'Admin' -Method 'PUT' -Path "/payments/api/payment/dealers/$dealerId/credit-limit" -Token $adminToken -Body @{ creditLimit = 300000 } -Expected @(200, 404) | Out-Null
Add-Test -Name 'Payments settle outstanding dealer' -Role 'Dealer' -Method 'POST' -Path "/payments/api/payment/dealers/$dealerId/settlements" -Token $dealerToken -Body @{ amount = 500; referenceNo = "SET-$Stamp" } -Expected @(200, 404, 400) | Out-Null
Add-Test -Name 'Payments get invoice dealer' -Role 'Dealer' -Method 'GET' -Path "/payments/api/payment/invoices/$invoiceId" -Token $dealerToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Payments list dealer invoices dealer' -Role 'Dealer' -Method 'GET' -Path "/payments/api/payment/dealers/$dealerId/invoices" -Token $dealerToken -Expected @(200) | Out-Null
Add-Test -Name 'Payments download invoice admin' -Role 'Admin' -Method 'GET' -Path "/payments/api/payment/invoices/$invoiceId/download" -Token $adminToken -Expected @(200, 404) | Out-Null

# Notifications
Add-Test -Name 'Notifications create manual dealer denied' -Role 'Dealer' -Method 'POST' -Path '/notifications/api/notifications/manual' -Token $dealerToken -Body @{ title = 'deny'; body = 'deny'; channel = 0 } -Expected @(403) | Out-Null
Add-Test -Name 'Notifications ingest anonymous denied' -Role 'Anonymous' -Method 'POST' -Path '/notifications/api/notifications/ingest' -Body @{ sourceService = 'EndpointMatrix'; eventType = 'MockEvent'; payload = '{"status":"ok"}'; recipientUserId = $dealerId } -Expected @(401) | Out-Null
Add-Test -Name 'Notifications ingest internal key' -Role 'Internal' -Method 'POST' -Path '/notifications/api/notifications/ingest' -Headers @{ 'X-Internal-Api-Key' = $InternalApiKey } -Body @{ sourceService = 'EndpointMatrix'; eventType = 'MockEvent'; payload = '{"status":"ok"}'; recipientUserId = $dealerId } -Expected @(200, 400) | Out-Null
Add-Test -Name 'Notifications my dealer' -Role 'Dealer' -Method 'GET' -Path '/notifications/api/notifications/my' -Token $dealerToken -Expected @(200) | Out-Null
Add-Test -Name 'Notifications all admin' -Role 'Admin' -Method 'GET' -Path '/notifications/api/notifications' -Token $adminToken -Expected @(200) | Out-Null
Add-Test -Name 'Notifications by id dealer' -Role 'Dealer' -Method 'GET' -Path "/notifications/api/notifications/$notificationId" -Token $dealerToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Notifications mark sent admin' -Role 'Admin' -Method 'PUT' -Path "/notifications/api/notifications/$notificationId/sent" -Token $adminToken -Expected @(200, 404) | Out-Null
Add-Test -Name 'Notifications mark failed admin' -Role 'Admin' -Method 'PUT' -Path "/notifications/api/notifications/$notificationId/failed" -Token $adminToken -Body @{ failureReason = 'Mock failure' } -Expected @(200, 404) | Out-Null

# Final logout test at end
Add-Test -Name 'Auth logout admin' -Role 'Admin' -Method 'POST' -Path '/identity/api/auth/logout' -Token $adminToken -Body @{} -Expected @(200) | Out-Null

$passCount = ($ReportRows | Where-Object { $_.Pass }).Count
$totalCount = $ReportRows.Count
$failCount = $totalCount - $passCount

$reportDir = 'scripts/reports'
if (-not (Test-Path $reportDir)) {
    New-Item -Path $reportDir -ItemType Directory | Out-Null
}

$csvPath = Join-Path $reportDir ("endpoint-matrix-$Stamp.csv")
$mdPath = Join-Path $reportDir ("endpoint-matrix-$Stamp.md")

$ReportRows | Export-Csv -Path $csvPath -NoTypeInformation

$md = @()
$md += "# Endpoint Matrix Report"
$md += ""
$md += "- Timestamp: $($Now.ToString('u'))"
$md += "- Total tests: $totalCount"
$md += "- Passed: $passCount"
$md += "- Failed: $failCount"
$md += ""
$md += "## Failed Tests"

$failed = $ReportRows | Where-Object { -not $_.Pass }
if (@($failed).Count -eq 0) {
    $md += "- None"
}
else {
    foreach ($f in @($failed)) {
        $md += "- [$($f.Role)] $($f.Method) $($f.Path) => status $($f.Status), expected $($f.Expected)"
    }
}

$md += ""
$md += "## Mock Data IDs"
$md += "- DealerId: $dealerId"
$md += "- ProductId: $productId"
$md += "- OrderId: $orderId"
$md += "- ShipmentId: $shipmentId"
$md += "- InvoiceId: $invoiceId"
$md += "- NotificationId: $notificationId"

$md | Set-Content -Path $mdPath

Write-Output "TOTAL=$totalCount PASS=$passCount FAIL=$failCount"
Write-Output "CSV=$csvPath"
Write-Output "MD=$mdPath"
