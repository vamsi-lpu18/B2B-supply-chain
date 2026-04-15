$ErrorActionPreference = 'Stop'

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [object]$Body
    )

    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 8
            $resp = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -ContentType 'application/json' -Body $json
        }
        else {
            $resp = Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
        }

        return [pscustomobject]@{ ok = $true; status = 200; body = $resp }
    }
    catch {
        $status = 0
        $errBody = $null

        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $errBody = $reader.ReadToEnd()
                }
            }
            catch {
            }
        }

        return [pscustomobject]@{ ok = $false; status = $status; body = $errBody; error = $_.Exception.Message }
    }
}

$baseHeaders = @{ 'Oc-Client' = 'student-local'; 'X-Correlation-Id' = [Guid]::NewGuid().ToString('N') }

$adminLogin = Invoke-Api -Method 'POST' -Uri 'http://localhost:5000/identity/api/auth/login' -Headers $baseHeaders -Body @{ email = 'admin@supplychain.local'; password = 'Admin@1234' }
if (-not $adminLogin.ok) { throw "Admin login failed: $($adminLogin.status) $($adminLogin.body)" }

$dealerLogin = Invoke-Api -Method 'POST' -Uri 'http://localhost:5000/identity/api/auth/login' -Headers $baseHeaders -Body @{ email = 'dealer@supplychain.local'; password = 'Dealer@123' }
if (-not $dealerLogin.ok) { throw "Dealer login failed: $($dealerLogin.status) $($dealerLogin.body)" }

$adminToken = $adminLogin.body.accessToken
$dealerToken = $dealerLogin.body.accessToken
if ([string]::IsNullOrWhiteSpace($adminToken) -or [string]::IsNullOrWhiteSpace($dealerToken)) { throw 'Missing auth token(s).' }

$adminHeaders = @{ 'Authorization' = "Bearer $adminToken"; 'Oc-Client' = 'student-local'; 'X-Correlation-Id' = [Guid]::NewGuid().ToString('N') }
$dealerHeaders = @{ 'Authorization' = "Bearer $dealerToken"; 'Oc-Client' = 'student-local'; 'X-Correlation-Id' = [Guid]::NewGuid().ToString('N') }

$productsResp = Invoke-Api -Method 'GET' -Uri 'http://localhost:5000/catalog/api/products?page=1&size=10' -Headers $dealerHeaders -Body $null
if (-not $productsResp.ok) { throw "Product fetch failed: $($productsResp.status) $($productsResp.body)" }

$items = $productsResp.body.items
if (-not $items -or $items.Count -eq 0) { throw 'No products available to create test order.' }

$product = $items | Where-Object { $_.isActive -eq $true -and $_.availableStock -ge 1 } | Select-Object -First 1
if (-not $product) { throw 'No active in-stock product found.' }

$effectiveMinOrderQty = [Math]::Max([int]$product.minOrderQty, 1)
$qty = $effectiveMinOrderQty

$createOrderBody = @{
    paymentMode = 0
    lines = @(@{
            productId = $product.productId
            productName = $product.name
            sku = $product.sku
            quantity = $qty
            unitPrice = [decimal]$product.unitPrice
            minOrderQty = $effectiveMinOrderQty
        })
}

$createResp = Invoke-Api -Method 'POST' -Uri 'http://localhost:5000/orders/api/orders' -Headers $dealerHeaders -Body $createOrderBody
if (-not $createResp.ok) { throw "Order create failed: $($createResp.status) $($createResp.body)" }

$orderId = [string]$createResp.body.orderId
if ([string]::IsNullOrWhiteSpace($orderId)) { throw 'Created order missing orderId.' }

$currentStatus = [int]$createResp.body.status

switch ($currentStatus) {
    0 { $statusSequence = @(2, 3, 4, 6) }
    1 { $statusSequence = @(2, 3, 4, 6) }
    2 { $statusSequence = @(3, 4, 6) }
    3 { $statusSequence = @(4, 6) }
    4 { $statusSequence = @(6) }
    6 { $statusSequence = @() }
    default { throw "Created order is in unsupported status '$currentStatus' for return verification." }
}

$statusResults = @()

foreach ($status in $statusSequence) {
    $updateResp = Invoke-Api -Method 'PUT' -Uri "http://localhost:5000/orders/api/orders/$orderId/status" -Headers $adminHeaders -Body @{ newStatus = $status }
    $statusResults += [pscustomobject]@{
        targetStatus = $status
        ok = $updateResp.ok
        httpStatus = $updateResp.status
        body = $updateResp.body
    }

    if (-not $updateResp.ok) {
        break
    }
}

$returnResp = Invoke-Api -Method 'POST' -Uri "http://localhost:5000/orders/api/orders/$orderId/returns" -Headers $dealerHeaders -Body @{ reason = 'Automated return flow verification' }
$approveResp = Invoke-Api -Method 'PUT' -Uri "http://localhost:5000/orders/api/admin/orders/$orderId/approve-return" -Headers $adminHeaders -Body @{}
$orderDetailResp = Invoke-Api -Method 'GET' -Uri "http://localhost:5000/orders/api/orders/$orderId" -Headers $dealerHeaders -Body $null

$result = [pscustomobject]@{
    orderId = $orderId
    createOrderStatus = $createResp.status
    transitions = $statusResults
    requestReturnStatus = $returnResp.status
    requestReturnOk = $returnResp.ok
    requestReturnBody = $returnResp.body
    approveReturnStatus = $approveResp.status
    approveReturnOk = $approveResp.ok
    approveReturnBody = $approveResp.body
    finalOrderStatus = if ($orderDetailResp.ok) { $orderDetailResp.body.status } else { $null }
    finalHasReturnRequest = if ($orderDetailResp.ok) { [bool]($orderDetailResp.body.returnRequest) } else { $false }
}

$result | ConvertTo-Json -Depth 8
